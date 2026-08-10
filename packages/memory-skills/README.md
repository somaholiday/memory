# memory-skills

Harness-neutral Agent Skills for reading, writing, and auditing a Markdown memory vault.

## Included

- `memory-read`
- `memory-write`
- `memory-audit`
- `memory-vault` CLI with SQLite BM25, optional vector search, validation, and safe writes
- `memory-skills` installer for copying skills into any harness directory

The skills follow the [Agent Skills standard](https://agentskills.io/specification). They prefer native memory tools when a harness provides them, then use the bundled CLI, then fall back to direct filesystem access.

## Requirements

- Node.js 20 or newer for indexed CLI use
- A C++ build toolchain when a prebuilt `better-sqlite3` binary is unavailable
- Plain filesystem access for the no-dependency fallback

## Install in Pi

Pi reads the package's skill manifest directly:

```bash
pi install npm:memory-skills
```

No copy step is needed.

## Install in another harness

Install the CLI, then let it detect Claude Code, Codex, and Pi:

```bash
npm install --global memory-skills
memory-skills install
```

Select one or more detected agents. The installer uses `fzf --multi` when available and falls back to a numbered terminal prompt. It installs into each agent's user skill directory:

- Claude Code: `~/.claude/skills`
- Codex: `~/.agents/skills`
- Pi: `~/.pi/agent/skills`

For scripts, install into every detected agent or pass an explicit directory:

```bash
memory-skills install --all
memory-skills install ~/.agents/skills
```

The installer refuses to replace an existing skill. Review it, then opt in when updating:

```bash
memory-skills install --force
```

Harnesses that accept an external skill path can use the package in place:

```bash
memory-skills path
```

The skill files contain no harness-specific commands.

## Configure the vault

```bash
export MEMORY_VAULT="$HOME/Memory"
memory-vault init
memory-vault status
```

Persist `MEMORY_VAULT` in your shell profile if every session should use the same directory. Without it, the CLI uses `~/Memory`.

## CLI

```bash
memory-vault list
memory-vault search "deployment"
memory-vault read "2026-08-08 deployment.md"
memory-vault validate
memory-vault write "2026-08-08 deployment.md" --content-file draft.md
memory-vault delete "2026-08-08 deployment.md"
```

Set `OPENAI_API_KEY` to add vector search where the optional `sqlite-vec` package is supported. Without either piece, indexed commands use BM25.

Git is optional. Pass `--commit-message` on a write or delete to commit only that memory when the vault is already a Git repository.
