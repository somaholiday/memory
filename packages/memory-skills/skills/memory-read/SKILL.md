---
name: memory-read
description: Use when past project context, prior decisions, saved notes, or user requests to recall, remember, or search previous work might be relevant.
compatibility: The indexed CLI requires Node.js 20 or newer; filesystem fallback works without it.
---

# Reading Memories

Use the best available backend to find relevant Markdown memories in `MEMORY_VAULT`. Prefer context-rich search, then exact reads, then filesystem search.

## Backend Order

1. **Native memory tool** — If the harness provides one, use it for indexed search and exact reads.
2. **Bundled CLI** — If `memory-vault` is available, use its SQLite-backed commands.
3. **Filesystem fallback** — Search and read `MEMORY_VAULT` directly with shell and file tools.
4. **No vault configured** — If no backend can resolve a vault, ask the user where memories live.

## Indexed CLI

```bash
memory-vault status
memory-vault list
memory-vault search "<term>"
memory-vault read "<filename>.md"
```

Use `--json` when structured output will be easier to inspect. If the command is not on `PATH`, resolve `../../dist/cli.js` relative to this skill and run it with Node.js.

## Filesystem Fallback

```bash
ls "$MEMORY_VAULT"/*.md
rg -n "<term>" "$MEMORY_VAULT/"
rg -l "tags:.*<term>" "$MEMORY_VAULT/"
rg -l "^  - .*<term>" "$MEMORY_VAULT/"
```

Use exact file reads for selected files. Include the `.md` extension when reading exact paths. Summarize relevant findings instead of dumping large files unless the user asks.

## Common Mistakes

- Searching only filenames. Use content search and matching context lines when possible.
- Giving up when an indexed search tool is unavailable. Filesystem search is good enough.
- Reading too much. Load the smallest set of notes that answers the question.
