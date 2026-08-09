# Memory Vault

Portable long-term memory backed by Markdown and a disposable SQLite index.

This repository contains two user-facing packages:

- `pi-memory-vault` — native tools and an interactive browser for Pi.
- `memory-skills` — Agent Skills standard workflows plus a CLI for any harness.

Both packages bundle the same private core module, so search, validation, indexing, and writes behave the same everywhere.

## Status

Early extraction from a working private extension. Do not publish yet.

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

Set `MEMORY_VAULT` to a directory of Markdown files while developing.

## Design

The core module owns the vault rules and SQLite implementation. Pi and the command line are thin adapters. Skills prefer a harness-native memory tool when one exists, then use the bundled CLI, then fall back to direct filesystem access.
