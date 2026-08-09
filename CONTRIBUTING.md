# Contributing

## Setup

```bash
npm install
npm test
npm run typecheck
npm run build
```

Node.js 20 or newer is required. The test suite uses temporary vaults and does not touch `MEMORY_VAULT`.

## Packages

- `packages/core` is private shared source. Public packages bundle it during `prepack`.
- `packages/pi-memory` contains only the Pi adapter and Pi-facing documentation.
- `packages/memory-skills` contains Agent Skills, the portable CLI, and installer.

Keep harness-specific behavior in adapters. Vault rules, validation, search, and file safety belong in the core module.

## Before a pull request

```bash
npm test
npm run typecheck
npm run build
npm pack --dry-run --workspace packages/pi-memory
npm pack --dry-run --workspace packages/memory-skills
```
