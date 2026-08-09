# pi-memory-vault

Requires Node.js 22.19 or newer, matching current Pi releases.

SQLite-backed long-term Markdown memory for [Pi](https://pi.dev).

## Install

```bash
pi install npm:pi-memory-vault
```

For a local checkout:

```bash
pi install /absolute/path/to/packages/pi-memory
```

Restart Pi, then run:

```text
/memory init
/memory status
```

The extension registers `memory_read`, `memory_write`, and `/memory`. It works without the companion skills package.

Run `/memory` to browse titles and previews in a fuzzy-filtered picker, or `/memory <query>` to search the vault before opening the picker.

## Configuration

`MEMORY_VAULT` selects the Markdown directory. Without it, the extension uses `~/Memory`.

Search uses SQLite FTS5 BM25 by default. Set `OPENAI_API_KEY` to add vector search where the optional `sqlite-vec` package is supported. Advanced embedding settings live at `$XDG_CONFIG_HOME/memory-vault/embeddings.json`:

```json
{
  "model": "text-embedding-3-small",
  "dimensions": 1536,
  "endpoint": "https://api.openai.com/v1/embeddings"
}
```

Git commits are optional. `memory_write` commits only when given a commit message and the vault is a Git repository.
