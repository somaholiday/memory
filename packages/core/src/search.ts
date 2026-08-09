// Hybrid memory search: fuse BM25 (FTS5) and vector (embedding) rankings with
// Reciprocal Rank Fusion, degrading to BM25-only when embeddings are unavailable.

import type { MemoryEntry, SearchResult } from "./types.js";

export interface SearchDeps {
	/** Lexical BM25 ranking from SQLite FTS5. */
	bm25: (query: string) => MemoryEntry[];
	/** Semantic ranking from vector KNN, or null when embeddings are unavailable. */
	vector: (query: string) => MemoryEntry[] | null;
	/** Max results to return after fusion. Default 10. */
	limit?: number;
}

/** Build a recall-friendly FTS5 query: OR the bare alphanumeric terms so natural
 *  -language queries match notes containing any term, not all of them. Returns ""
 *  when no usable terms remain (caller should treat as no lexical results). */
export function bm25Query(raw: string): string {
	const terms = raw.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
	return terms.map((t) => `"${t}"`).join(" OR ");
}

/** Reciprocal Rank Fusion: fuse ranked path lists into one order. k dampens the
 *  contribution of low ranks (standard default 60). */
export function rrfFuse(rankings: string[][], k = 60): string[] {
	const scores = new Map<string, number>();
	for (const ranking of rankings) {
		ranking.forEach((path, i) => {
			scores.set(path, (scores.get(path) ?? 0) + 1 / (k + i + 1));
		});
	}
	return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([path]) => path);
}

export function searchMemories(query: string, deps: SearchDeps): SearchResult {
	const limit = deps.limit ?? 10;
	const lexical = deps.bm25(query);
	const semantic = deps.vector(query);

	if (!semantic || semantic.length === 0) {
		return { backend: "bm25", files: lexical.slice(0, limit) };
	}

	// Index both rankings by path so the fused order can be rehydrated to entries.
	const byPath = new Map<string, MemoryEntry>();
	for (const e of [...lexical, ...semantic]) byPath.set(e.path, e);

	const fusedPaths = rrfFuse([lexical.map((e) => e.path), semantic.map((e) => e.path)]);
	const files = fusedPaths
		.map((p) => byPath.get(p))
		.filter((e): e is MemoryEntry => Boolean(e))
		.slice(0, limit);
	return { backend: "hybrid", files };
}

export function formatSearchResponse(query: string, response: SearchResult): string {
	if (response.files.length === 0) return `No memories found matching "${query}"`;

	const n = response.files.length;
	const label = response.backend === "hybrid" ? "hybrid BM25+vector" : "BM25";
	const list = response.files.map((f) => `- ${f.path}`).join("\n");
	return `Found ${n} memor${n === 1 ? "y" : "ies"} matching "${query}" (${label}):\n${list}`;
}
