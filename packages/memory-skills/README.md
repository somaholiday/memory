# memory-skills

Harness-neutral Agent Skills for reading, writing, and auditing a Markdown memory vault.

## Included

- `memory-read`
- `memory-write`
- `memory-audit`
- `memory-vault` CLI with SQLite BM25, optional vector search, validation, and safe writes

The skills follow the [Agent Skills standard](https://agentskills.io/specification). They prefer native memory tools when a harness provides them, then use the bundled CLI, then fall back to direct filesystem access.

## Requirements

- Node.js 20 or newer for indexed CLI use
- A C++ build toolchain when a prebuilt `better-sqlite3` binary is unavailable
- Plain filesystem access for the no-dependency fallback

## Setup

```bash
export MEMORY_VAULT="$HOME/Memory"
memory-vault init
memory-vault status
```

Install the package through your harness or package manager, then add its `skills/` directory to the harness's Agent Skills search path. The skill files contain no harness-specific commands.

## CLI

```bash
memory-vault list
memory-vault search "deployment"
memory-vault read "2026-08-08 deployment.md"
memory-vault validate
memory-vault write "2026-08-08 deployment.md" --content-file draft.md
```

Set `OPENAI_API_KEY` to add vector search where the optional `sqlite-vec` package is supported. Without either piece, indexed commands use BM25.

Git is optional. Pass `--commit-message` on a write to commit only that memory when the vault is already a Git repository.
