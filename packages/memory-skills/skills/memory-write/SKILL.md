---
name: memory-write
description: Use when the user asks to remember or save something, or when durable context from the session would likely help future work.
compatibility: The indexed CLI requires Node.js 20 or newer; direct Markdown writes work without it.
---

# Writing Memories

Write focused Markdown memories into `MEMORY_VAULT`. Always draft first, show the full draft, and wait for explicit user confirmation before writing.

## Backend Order

1. **Native memory tool** — If the harness provides one, use it after drafting and user confirmation.
2. **Bundled CLI** — If `memory-vault` is available, use it for validation, writing, reindexing, and optional Git commits.
3. **Direct filesystem write** — If `MEMORY_VAULT` exists, write or update Markdown files there.
4. **No vault configured** — If no backend is available, ask the user where memories should be stored.

For an approved draft, the CLI accepts content on standard input or through `--content-file`:

```bash
memory-vault write "<filename>.md" --content-file "<draft-file>"
memory-vault validate
```

Add `--commit-message "<message>"` only when the user wants Git commits. If the command is not on `PATH`, resolve `../../dist/cli.js` relative to this skill and run it with Node.js.

## Update vs. Create

Prefer updating existing files over creating new ones. Before writing, search the vault for an existing memory on the same topic. Use native memory search or filesystem `rg`. Update in place when the topic matches; create a new file only when the topic is distinct.

## Required Confirmation

Before writing anything:

1. Propose the file path.
2. Show the full Markdown draft, including frontmatter.
3. Wait for explicit confirmation from the user.

Do not write from implied approval. “Looks good,” “yes,” or an explicit filename/path approval is enough. Silence is not approval. Sneaky writes are how tiny databases become haunted.

## File Format

Every memory file has YAML frontmatter followed by content:

```yaml
---
type: Memory
title: Human-readable title derived from the filename
description: One-sentence summary of the memory.
status: reference | active | plan
date: YYYY-MM-DD
tags: [lowercase, freeform, tags]
related:
  - "[[other-memory-filename]]"
---

# Descriptive Title

Content here...
```

- **type** — Always `Memory`; required for Open Knowledge Format conformance.
- **title** — Human-readable display title derived from the filename.
- **description** — Non-empty, single-line sentence used for search previews and progressive disclosure.
- **status** — `reference` for durable documentation, `active` for concrete unfinished work, or `plan` for proposed work not yet started.
- **date** — When the work happened.
- **tags** — Freeform, lowercase tags for cross-cutting search.
- **related** — Curated relationships as wiki-style links, without `.md`.

Use URL-encoded standard Markdown for links in the body so portable OKF
consumers can follow them: `[Label](other%20memory.md)`.

If adding a `related` link, update the linked file too when practical so relationships are bidirectional.

## Naming Convention

Use vault-root files named:

```text
YYYY-MM-DD topic-slug.md
```

Examples:

```text
2026-03-08 deployment-checklist.md
2026-03-12 auth-redirects.md
2026-06-14 memory-skills-packaging.md
```

## Steps

1. Search for an existing memory on the topic.
2. Derive its title from the filename and classify its status.
3. Draft the new or updated memory with a one-sentence description.
4. Propose the path and show the full draft.
5. Wait for explicit confirmation.
6. Write only the confirmed file changes.
7. If the vault is a git repo, commit only the touched memory files:

```bash
cd "$MEMORY_VAULT" && git add "<file>" ["<related-file>"] && git commit -m "Add memory: <filename>"
```

## Common Mistakes

- Writing before confirmation. Never.
- Creating duplicates instead of updating existing notes.
- Using vague tags like `misc` or `notes`.
- Marking vague future ideas `active`; use `active` only for concrete unfinished work.
- Leaving a completed plan as `plan` instead of reclassifying it as `reference`.
- Committing unrelated vault changes with `git add -A`.
- Saving transcripts instead of distilled, reusable context.
