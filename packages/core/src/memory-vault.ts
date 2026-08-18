// Deep interface for a Markdown memory vault.
// It hides path safety, validation, SQLite search, embeddings, and optional Git.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createSqliteIndex, indexPathsForVault } from "./sqlite-index.js";
import { embedQuery, hasEmbeddingCredentials } from "./embeddings.js";
import { bm25Query, searchMemories } from "./search.js";
import { validateMemoryContent, validateVault } from "./validation.js";
import type { MemoryEntry, SearchResult, VaultStatus, WriteResult } from "./types.js";

export interface OpenMemoryVaultOptions {
  path?: string;
  /** Refuse to overwrite a memory this vault instance has not read. */
  requireReadBeforeWrite?: boolean;
}

export interface WriteMemoryOptions {
  path: string;
  content: string;
  commitMessage?: string;
  /** Hash of the content this write is based on; the write fails if the file changed. */
  expectedHash?: string;
  /** Skip stale-read and read-before-write checks. */
  force?: boolean;
}

export function hashMemoryContent(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

function defaultVaultPath(): string {
  return process.env.MEMORY_VAULT?.trim() || path.join(os.homedir(), "Memory");
}

function assertMemoryFilename(filename: string): void {
  if (path.basename(filename) !== filename || !filename.endsWith(".md")) {
    throw new Error("Memory path must be a root-level .md filename");
  }
}

function isGitRepo(cwd: string): boolean {
  try {
    return execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() === "true";
  } catch {
    return false;
  }
}

function commitFile(cwd: string, filename: string, message: string): string | undefined {
  if (!isGitRepo(cwd)) return undefined;
  execFileSync("git", ["add", "--", filename], { cwd, stdio: "ignore" });
  try {
    execFileSync("git", ["diff", "--cached", "--quiet", "--", filename], { cwd, stdio: "ignore" });
    return undefined;
  } catch {
    return execFileSync("git", ["commit", "-m", message, "--", filename], {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  }
}

export class MemoryVault {
  readonly path: string;
  private readonly index;
  private readonly requireReadBeforeWrite: boolean;
  private readonly readHashes = new Map<string, string>();

  constructor(options: OpenMemoryVaultOptions = {}) {
    this.path = path.resolve(options.path ?? defaultVaultPath());
    this.index = createSqliteIndex(this.path);
    this.requireReadBeforeWrite = options.requireReadBeforeWrite ?? false;
  }

  init(): VaultStatus {
    fs.mkdirSync(this.path, { recursive: true });
    return this.status();
  }

  status(): VaultStatus {
    const initialized = fs.existsSync(this.path) && fs.statSync(this.path).isDirectory();
    return {
      path: this.path,
      initialized,
      files: initialized ? this.list().length : 0,
      ...indexPathsForVault(this.path),
      git: initialized && isGitRepo(this.path),
      embeddingsConfigured: hasEmbeddingCredentials(),
    };
  }

  list(): MemoryEntry[] {
    this.assertInitialized();
    return this.index.listFiles();
  }

  async search(query: string): Promise<SearchResult> {
    this.assertInitialized();
    const queryVector = await embedQuery(query);
    const vectorReady = queryVector ? await this.index.ensureEmbeddings() : false;
    return searchMemories(query, {
      bm25: (value) => this.index.search(bm25Query(value)),
      vector: () => queryVector && vectorReady ? this.index.vectorSearch(queryVector) : null,
    });
  }

  read(filename: string): string {
    this.assertInitialized();
    const filePath = this.resolveFile(filename, true);
    const content = fs.readFileSync(filePath, "utf-8");
    this.readHashes.set(filename, hashMemoryContent(content));
    return content;
  }

  /** Hash of a memory's current content, for expectedHash preconditions. */
  hash(filename: string): string {
    this.assertInitialized();
    const filePath = this.resolveFile(filename, true);
    return hashMemoryContent(fs.readFileSync(filePath, "utf-8"));
  }

  write(options: WriteMemoryOptions): WriteResult {
    this.assertInitialized();
    const filePath = this.resolveFile(options.path, false);
    this.assertWriteSafe(options, filePath);
    const validation = validateMemoryContent(options.content, {
      vaultPath: this.path,
      memoryPath: options.path,
    });
    if (validation.errors.length > 0) {
      throw new Error(`Memory validation failed:\n${validation.errors.map((error) => `- ${error}`).join("\n")}`);
    }

    const temporaryPath = `${filePath}.tmp-${process.pid}`;
    fs.writeFileSync(temporaryPath, options.content, "utf-8");
    fs.renameSync(temporaryPath, filePath);
    this.readHashes.set(options.path, hashMemoryContent(options.content));
    this.index.rebuild();

    const result: WriteResult = { path: options.path, warnings: validation.warnings };
    if (options.commitMessage) result.commit = commitFile(this.path, options.path, options.commitMessage);
    return result;
  }

  delete(filename: string, commitMessage?: string): WriteResult {
    this.assertInitialized();
    const filePath = this.resolveFile(filename, true);
    fs.unlinkSync(filePath);
    this.readHashes.delete(filename);
    this.index.rebuild();

    const result: WriteResult = { path: filename, warnings: [] };
    if (commitMessage) result.commit = commitFile(this.path, filename, commitMessage);
    return result;
  }

  validate() {
    this.assertInitialized();
    return validateVault(this.path);
  }

  private assertWriteSafe(options: WriteMemoryOptions, filePath: string): void {
    if (options.force || !fs.existsSync(filePath)) return;
    const currentHash = hashMemoryContent(fs.readFileSync(filePath, "utf-8"));
    const expected = options.expectedHash ?? this.readHashes.get(options.path);
    if (expected === undefined) {
      if (this.requireReadBeforeWrite) {
        throw new Error(
          `Memory conflict: ${options.path} exists but was not read in this session. ` +
          `Read it first and merge your changes, or pass force to overwrite.`,
        );
      }
      return;
    }
    if (expected !== currentHash) {
      throw new Error(
        `Memory conflict: ${options.path} changed since it was read (another session may have written it). ` +
        `Re-read it, merge your changes, and write again — or pass force to overwrite.`,
      );
    }
  }

  private assertInitialized(): void {
    if (!fs.existsSync(this.path) || !fs.statSync(this.path).isDirectory()) {
      throw new Error(`Memory vault does not exist: ${this.path}. Run memory-vault init or set MEMORY_VAULT.`);
    }
  }

  private resolveFile(filename: string, mustExist: boolean): string {
    assertMemoryFilename(filename);
    const filePath = path.join(this.path, filename);
    if (mustExist && !fs.existsSync(filePath)) throw new Error(`Memory file not found: ${filename}`);
    if (fs.existsSync(filePath) && fs.lstatSync(filePath).isSymbolicLink()) {
      throw new Error(`Memory files may not be symbolic links: ${filename}`);
    }
    return filePath;
  }
}

export function openMemoryVault(options: OpenMemoryVaultOptions = {}): MemoryVault {
  return new MemoryVault(options);
}
