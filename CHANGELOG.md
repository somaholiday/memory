# Changelog

## pi-memory-vault 0.2.0, memory-skills 0.3.0 — 2026-08-18

### Added

- Optimistic locking for memory writes: the vault tracks content hashes on read and rejects a write when the file changed since it was read.
- `expectedHash` and `force` write options in the core vault, plus a `hashMemoryContent` helper and `vault.hash()`.
- Pi `memory_write` refuses to overwrite a memory the session has not read; a `force` parameter overrides after explicit user approval.
- CLI `hash` command and `--expect-hash` / `--force` write options; the memory-write skill documents the conflict flow.

## memory-skills 0.2.0 — 2026-08-10

### Added

- Interactive skill installation with automatic Claude Code, Codex, and Pi detection.
- Optional `fzf` multi-select with a built-in numbered prompt fallback.

## 0.1.0 — 2026-08-08

### Added

- Shared Markdown vault core with a disposable SQLite FTS5 index.
- BM25 search with optional OpenAI embeddings and `sqlite-vec` ranking.
- Portable validation, safe root-level file access, and optional path-scoped Git commits.
- `pi-memory-vault` tools and `/memory` command for Pi.
- Harness-neutral `memory-read`, `memory-write`, and `memory-audit` skills.
- `memory-vault` command-line interface and `memory-skills` installer.
