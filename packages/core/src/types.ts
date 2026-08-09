// Public data types for the memory vault core.
// Adapters share these types without learning the SQLite schema.

export interface MemoryEntry {
  path: string;
  title: string;
  date: string;
  preview: string;
}

export interface VaultIndex {
  listFiles(): MemoryEntry[];
  search(query: string): MemoryEntry[];
  ensureEmbeddings(): Promise<boolean>;
  vectorSearch(queryVector: Float32Array): MemoryEntry[];
  filesByTag(tag: string): MemoryEntry[];
  allTags(): { tag: string; count: number }[];
  rebuild(): void;
}

export interface SearchResult {
  backend: "hybrid" | "bm25";
  files: MemoryEntry[];
}

export interface VaultStatus {
  path: string;
  initialized: boolean;
  files: number;
  git: boolean;
  embeddingsConfigured: boolean;
}

export interface WriteResult {
  path: string;
  warnings: string[];
  commit?: string;
}
