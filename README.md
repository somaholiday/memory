# Memory Vault

Portable long-term memory backed by Markdown and a disposable SQLite index.

## Packages

| Package | Purpose |
| --- | --- |
| [`pi-memory-vault`](packages/pi-memory) | Native Pi tools and interactive `/memory` command. Works without the skills. |
| [`memory-skills`](packages/memory-skills) | Harness-neutral read, write, and audit skills plus a portable CLI. Works without Pi. |

Both packages bundle the same private core module, so validation, path safety, indexing, and search behave the same everywhere.

## Install for Pi

Install either package or both:

```bash
pi install npm:pi-memory-vault
pi install npm:memory-skills
```

Then initialize and inspect the default `~/Memory` vault:

```text
/memory init
/memory status
```

Set `MEMORY_VAULT` before starting Pi to use another directory.

## Install for other harnesses

```bash
npm install --global memory-skills
memory-skills install ~/.agents/skills
export MEMORY_VAULT="$HOME/Memory"
memory-vault init
```

See the [`memory-skills` guide](packages/memory-skills) for other target directories and CLI commands.

## Search

SQLite FTS5 BM25 works without an account or network connection. Optional vector search requires `OPENAI_API_KEY` and a platform supported by `sqlite-vec`. If either is unavailable, search stays on BM25.

The derived index and embedding cache live outside the vault under `$XDG_CACHE_HOME/memory-vault` or `~/.cache/memory-vault`. Markdown files remain the source of truth.

## Safety

- Reads, writes, and deletes are confined to root-level `.md` files in the configured vault.
- Writes require valid memory frontmatter.
- Git commits are optional and include only the requested memory path.
- Skills require a full draft and explicit user approval before writes or deletions.
- Embedding credentials come from the environment or an explicit command and are not stored by this package.

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for package and release checks.
