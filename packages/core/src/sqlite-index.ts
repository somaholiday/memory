// SQLite-backed VaultIndex implementation.
// Builds a derived index from .md files; the .db file is disposable. Semantic
// search adds a sqlite-vec vector store, populated out-of-band from a separate
// persistent embedding cache so the disposable index can be rebuilt cheaply.

import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { parseDocument } from "yaml";
import type { VaultIndex, MemoryEntry } from "./types.js";
import { embedTexts, getEmbeddingConfig } from "./embeddings.js";

type SqliteDatabase = InstanceType<typeof Database>;

const SCHEMA = `
CREATE TABLE files (
	id           INTEGER PRIMARY KEY,
	path         TEXT UNIQUE NOT NULL,
	title        TEXT NOT NULL DEFAULT '',
	date         TEXT NOT NULL DEFAULT '',
	preview      TEXT NOT NULL DEFAULT '',
	content_hash TEXT NOT NULL DEFAULT ''
);

CREATE TABLE tags (
	file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
	tag     TEXT NOT NULL,
	PRIMARY KEY (file_id, tag)
);
CREATE INDEX idx_tags_tag ON tags(tag);

CREATE TABLE related (
	file_id         INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
	related_file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
	PRIMARY KEY (file_id, related_file_id)
);

CREATE VIRTUAL TABLE fts USING fts5(title, content);
`;

interface ParsedFile {
	path: string;
	title: string;
	date: string;
	tags: string[];
	related: string[];
	body: string;
	preview: string;
	hash: string;
}

/** Strip YAML frontmatter, returning the body. */
function stripFrontmatter(content: string): string {
	const fmEnd = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
	return fmEnd ? content.slice(fmEnd[0].length) : content;
}

/** Parse YAML frontmatter and extract metadata from a memory file. */
export function parseFile(filePath: string, filename: string): ParsedFile {
	const content = fs.readFileSync(filePath, "utf-8");
	const result: ParsedFile = {
		path: filename, title: "", date: "",
		tags: [], related: [], body: "", preview: "", hash: "",
	};
	let frontmatterTitle = "";
	let frontmatterDescription = "";

	const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (fmMatch) {
		const document = parseDocument(fmMatch[1], { prettyErrors: false });
		if (document.errors.length === 0) {
			const metadata = document.toJS();
			if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
				if (typeof metadata.title === "string") frontmatterTitle = metadata.title.trim();
				if (typeof metadata.description === "string") frontmatterDescription = metadata.description.trim();
				if (typeof metadata.date === "string") result.date = metadata.date.trim();
				if (Array.isArray(metadata.tags)) {
					result.tags = metadata.tags.filter((tag: unknown): tag is string => typeof tag === "string");
				}
				if (Array.isArray(metadata.related)) {
					result.related = metadata.related.filter((ref: unknown): ref is string => typeof ref === "string");
				}
			}
		}
	}

	// Body is everything after frontmatter
	result.body = stripFrontmatter(content);
	result.hash = crypto.createHash("sha256").update(result.body).digest("hex");

	// Prefer OKF discovery metadata, with body/filename fallbacks for old documents.
	const titleMatch = result.body.match(/^#\s+(.+)$/m);
	result.title = frontmatterTitle || (titleMatch ? titleMatch[1].trim() : filename.replace(/\.md$/, ""));
	result.preview = frontmatterDescription;

	if (!result.preview) {
		for (const line of result.body.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			if (trimmed.startsWith("*20") || trimmed.startsWith("**Date")) continue;
			result.preview = trimmed.length > 100 ? trimmed.slice(0, 97) + "..." : trimmed;
			break;
		}
	}

	return result;
}

/** Resolve a related entry to a filename. Handles wikilinks and bare filenames. */
function resolveRelated(ref: string): string {
	const wikiMatch = ref.match(/^\[\[(.+?)]]$/);
	if (wikiMatch) return wikiMatch[1] + ".md";
	if (!ref.endsWith(".md")) return ref + ".md";
	return ref;
}

/** The text fed to the embedding model for a note: filename plus body. */
function embeddingInput(filename: string, body: string): string {
	return `${filename}\n\n${body}`;
}

/** Float32 vector -> bytes for storage / vec0 binding. */
function vecToBytes(vec: Float32Array): Uint8Array {
	return new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
}

/** Stored BLOB -> Float32 vector. */
function bytesToVec(buf: Buffer): Float32Array {
	return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

/** Derive a stable cache path outside the vault to avoid sync conflicts. */
function cacheDir(): string {
	const cacheHome = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
	const dir = path.join(cacheHome, "memory-vault");
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

function dbPathFor(vaultPath: string, suffix: string): string {
	const hash = crypto.createHash("sha256").update(vaultPath).digest("hex").slice(0, 12);
	return path.join(cacheDir(), `${hash}${suffix}`);
}

export function indexPathsForVault(vaultPath: string): { indexPath: string; embeddingCachePath: string } {
	return {
		indexPath: dbPathFor(vaultPath, ".db"),
		embeddingCachePath: dbPathFor(vaultPath, ".emb.db"),
	};
}

/** Create a SQLite-backed VaultIndex for the given vault directory. */
export function createSqliteIndex(vaultPath: string): VaultIndex {
	const { indexPath: dbPath, embeddingCachePath: embCachePath } = indexPathsForVault(vaultPath);
	const { model, dimensions } = getEmbeddingConfig();
	const embeddingCacheKey = `${model}:${dimensions}`;
	let db: SqliteDatabase | null = null;
	let embCache: SqliteDatabase | null = null;

	function openDb(): SqliteDatabase {
		if (!db) {
			db = new Database(dbPath);
			db.pragma("journal_mode=WAL");
			db.pragma("foreign_keys=ON");
		}
		return db;
	}

	/** Persistent (hash, model) -> vector cache; survives index rebuilds. */
	function openEmbCache(): SqliteDatabase {
		if (!embCache) {
			embCache = new Database(embCachePath);
			embCache.pragma("journal_mode=WAL");
			embCache.exec(
				"CREATE TABLE IF NOT EXISTS emb (hash TEXT NOT NULL, model TEXT NOT NULL, vector BLOB NOT NULL, PRIMARY KEY (hash, model));",
			);
		}
		return embCache;
	}

	function isFresh(): boolean {
		if (!fs.existsSync(dbPath) || !db) return false;
		const dbMtime = fs.statSync(dbPath).mtimeMs;
		const mdFiles = fs.readdirSync(vaultPath)
			.filter((f) => f.endsWith(".md") && !f.startsWith("."));

		// Count mismatch means a file was added or deleted
		const row = db.prepare("SELECT COUNT(*) as count FROM files").get() as { count: number };
		if (row.count !== mdFiles.length) return false;

		// Any file newer than the DB means content changed
		for (const file of mdFiles) {
			if (fs.statSync(path.join(vaultPath, file)).mtimeMs > dbMtime) return false;
		}
		return true;
	}

	function ensureFresh(): void {
		try {
			if (db && isFresh()) return;
		} catch {
			// Corrupted or schema-less DB — fall through to rebuild
		}
		rebuild();
	}

	function rebuild(): void {
		if (db) { db.close(); db = null; }
		// Remove the WAL/SHM sidecars too: a corrupt WAL survives a bare
		// unlink of the .db and re-poisons the freshly recreated database,
		// which defeats this rebuild's own corruption recovery.
		for (const suffix of ["", "-wal", "-shm"]) {
			const f = dbPath + suffix;
			if (fs.existsSync(f)) fs.unlinkSync(f);
		}

		db = new Database(dbPath);
		db.pragma("journal_mode=WAL");
		db.pragma("foreign_keys=ON");
		db.exec(SCHEMA);
		const mdFiles = fs.readdirSync(vaultPath)
			.filter((f) => f.endsWith(".md") && !f.startsWith("."));

		const parsed: ParsedFile[] = [];
		for (const file of mdFiles) {
			parsed.push(parseFile(path.join(vaultPath, file), file));
		}

		const insertFile = db.prepare(
			"INSERT INTO files (path, title, date, preview, content_hash) VALUES (?, ?, ?, ?, ?) RETURNING id",
		);
		const insertTag = db.prepare("INSERT INTO tags (file_id, tag) VALUES (?, ?)");
		const insertFts = db.prepare("INSERT INTO fts (rowid, title, content) VALUES (?, ?, ?)");
		const insertRelated = db.prepare(
			"INSERT OR IGNORE INTO related (file_id, related_file_id) VALUES (?, ?)",
		);

		const pathToId = new Map<string, number>();
		const relatedLinks: { from: string; to: string }[] = [];

		db.transaction(() => {
			for (const file of parsed) {
				const row = insertFile.get(file.path, file.title, file.date, file.preview, file.hash) as { id: number };
				pathToId.set(file.path, row.id);

				for (const tag of file.tags) {
					insertTag.run(row.id, tag);
				}
				insertFts.run(row.id, file.title, file.body);

				for (const rel of file.related) {
					relatedLinks.push({ from: file.path, to: rel });
				}
			}

			for (const { from, to } of relatedLinks) {
				const fromId = pathToId.get(from);
				const toId = pathToId.get(resolveRelated(to));
				if (fromId !== undefined && toId !== undefined) {
					insertRelated.run(fromId, toId);
				}
			}
		})();
	}

	/** Populate the disposable vec_files store from the persistent cache, embedding
	 *  any cache misses via the API. Returns true when the store is usable for KNN.
	 *  No-ops when already populated; degrades to false (BM25-only) without a key. */
	async function ensureEmbeddings(): Promise<boolean> {
		ensureFresh();
		const d = openDb();
		try {
			const sqliteVec = await import("sqlite-vec");
			sqliteVec.load(d);
			d.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_files USING vec0(embedding float[${dimensions}]);`);
		} catch (error) {
			console.error(`[memory-vault] vector search unavailable: ${error}`);
			return false;
		}

		const files = d.prepare("SELECT id, path, content_hash FROM files").all() as
			{ id: number; path: string; content_hash: string }[];
		const populated = (d.prepare("SELECT COUNT(*) as c FROM vec_files").get() as { c: number }).c;
		if (files.length > 0 && populated === files.length) return true;

		const cache = openEmbCache();
		const getCached = cache.prepare("SELECT vector FROM emb WHERE hash = ? AND model = ?");
		const vectors = new Map<number, Float32Array>();
		const misses: { id: number; path: string; content_hash: string }[] = [];

		for (const f of files) {
			const row = getCached.get(f.content_hash, embeddingCacheKey) as { vector: Buffer } | undefined;
			if (row) vectors.set(f.id, bytesToVec(row.vector));
			else misses.push(f);
		}

		if (misses.length > 0) {
			const inputs = misses.map((m) => {
				const body = stripFrontmatter(fs.readFileSync(path.join(vaultPath, m.path), "utf-8"));
				return embeddingInput(m.path, body);
			});
			const embedded = await embedTexts(inputs);
			if (!embedded) return false; // no key / API failure — leave BM25-only

			const putCache = cache.prepare("INSERT OR REPLACE INTO emb (hash, model, vector) VALUES (?, ?, ?)");
			cache.transaction(() => {
				misses.forEach((m, i) => {
					vectors.set(m.id, embedded[i]);
					putCache.run(m.content_hash, embeddingCacheKey, vecToBytes(embedded[i]));
				});
			})();
		}

		const insertVec = d.prepare("INSERT INTO vec_files (rowid, embedding) VALUES (?, ?)");
		d.transaction(() => {
			d.prepare("DELETE FROM vec_files").run();
			for (const [id, vec] of vectors) {
				insertVec.run(BigInt(id), vecToBytes(vec));
			}
		})();
		return vectors.size > 0;
	}

	const SEARCH_SQL = `
		SELECT f.path, f.title, f.date, f.preview
		FROM fts JOIN files f ON fts.rowid = f.id
		WHERE fts MATCH ?
		ORDER BY fts.rank
	`;

	// vec0 requires LIMIT (or k=?) on the KNN query itself, so rank in a subquery
	// before joining back to file metadata.
	const VECTOR_SQL = `
		SELECT f.path, f.title, f.date, f.preview
		FROM (SELECT rowid, distance FROM vec_files WHERE embedding MATCH ? ORDER BY distance LIMIT 50) v
		JOIN files f ON v.rowid = f.id
		ORDER BY v.distance
	`;

	return {
		listFiles(): MemoryEntry[] {
			ensureFresh();
			return openDb()
				.prepare("SELECT path, title, date, preview FROM files ORDER BY path")
				.all() as MemoryEntry[];
		},

		search(query: string): MemoryEntry[] {
			ensureFresh();
			const d = openDb();
			try {
				return d.prepare(SEARCH_SQL).all(query) as MemoryEntry[];
			} catch {
				// FTS5 syntax error — quote each term and retry
				const safe = query.split(/\s+/).filter(Boolean)
					.map((t) => `"${t.replace(/"/g, "")}"`).join(" ");
				try {
					return d.prepare(SEARCH_SQL).all(safe) as MemoryEntry[];
				} catch {
					return [];
				}
			}
		},

		ensureEmbeddings,

		vectorSearch(queryVec: Float32Array): MemoryEntry[] {
			return openDb().prepare(VECTOR_SQL).all(vecToBytes(queryVec)) as MemoryEntry[];
		},

		filesByTag(tag: string): MemoryEntry[] {
			ensureFresh();
			return openDb().prepare(`
				SELECT f.path, f.title, f.date, f.preview
				FROM tags t JOIN files f ON t.file_id = f.id
				WHERE t.tag = ?
				ORDER BY f.path
			`).all(tag) as MemoryEntry[];
		},

		allTags(): { tag: string; count: number }[] {
			ensureFresh();
			return openDb().prepare(
				"SELECT tag, COUNT(*) as count FROM tags GROUP BY tag ORDER BY count DESC, tag",
			).all() as { tag: string; count: number }[];
		},

		rebuild,
	};
}
