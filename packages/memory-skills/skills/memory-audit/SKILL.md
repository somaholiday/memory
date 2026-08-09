---
name: memory-audit
description: Thoroughly audit the configured memory vault for stale, inaccurate, duplicated, superseded, unsafe, or orphaned memories; corroborate current-state claims against authoritative sources; propose deletions and full replacement drafts; repair relationships; validate; and commit approved cleanup. Use when the user asks to audit, clean up, prune, reconcile, or verify memories.
---

# Memory Audit

Audit memories as a small knowledge base, not a pile of Markdown. Separate historical facts from current-state claims, verify the latter, and make no vault changes before explicit approval.

Load the `memory-read` and `memory-write` skills first. Their backend order, file format, drafting, and confirmation rules remain authoritative.

## Invocation

Invoke this skill through the harness's standard skill mechanism. Command names vary by harness; the skill itself assumes none.

## Rules

- **Audit first, mutate later.** Do not edit or delete memories during discovery.
- **Never trust a note merely because it has a recent `updated` date.** Verify its claims.
- **Old does not mean stale.** Historical incident notes remain useful when clearly framed and uniquely informative.
- **An unchecked task is not automatically obsolete.** Classify it as verified open, completed but stale, abandoned, or needs user input.
- **Current-state notes require corroboration.** Check live config, tracked source, service state, or current documentation.
- **Do not dump secrets while scanning.** Report locations and secret types, never values. Exclude logs, databases, backups, and large application-data trees from broad content searches.
- **Keep live-system fixes separate.** Report them, then use the relevant domain skill/repository workflow and a separate commit.
- **Follow repository instructions.** Read `AGENTS.md`, preserve existing work, use the required branch strategy, and never stage unrelated files.

## Memory Status

Every memory has one lowercase `status` value:

- `reference` — durable documentation with no currently tracked work
- `active` — work is underway or concrete unfinished tasks remain
- `plan` — proposed implementation that has not started

Completed plans become `reference`. Vague someday/maybe ideas remain `reference` unless they become an intended project.

## Phase 1: Establish the Baseline

1. Resolve `MEMORY_VAULT`. If unavailable, stop and ask where the vault lives.
2. Inspect the memory index and run structural validation. Prefer native memory tools; otherwise use the bundled CLI:

```bash
memory-vault list
memory-vault validate
```
3. Inspect Git state before touching anything:

```bash
git -C "$MEMORY_VAULT" status --short --branch
git -C "$MEMORY_VAULT" log --oneline --decorate -5
```

4. Inventory every memory with filename, title, description, status, line count, date, updated date, tags, and relationships.
5. Note pre-existing commits, modifications, and untracked files. Do not absorb them into the audit commit accidentally.

Structural validation catches malformed notes and broken relationships. It does **not** prove that content is true.

## Phase 2: Scan for Risk Signals

Search all memory content, not only filenames.

### Lifecycle language

Look for:

- `superseded`, `obsolete`, `deprecated`, `historical`
- `plan`, `planned`, `next steps`, `follow-up`
- `TODO`, `TBD`, `pending`, `remaining`, `not yet`, `outstanding`
- status claims with old dates
- frontmatter status that conflicts with the actual work state

### Current-state assumptions

Look for references likely to drift:

- service names, hostnames, ports, paths, package names, and import paths
- deployed architecture, storage topology, cron schedules, and backup stages
- active credentials, authentication methods, and certificate expiry dates
- files claimed to exist locally or remotely
- software described as deployed, enabled, or currently used

### Sensitive material

Search narrowly for credential indicators such as passwords, API keys, tokens, private keys, and bearer headers. Prefer path-only output:

```bash
rg -l -i '(password|api[_ -]?key|secret|token|credential|private key)' \
  "$MEMORY_VAULT" --glob '*.md'
```

Do not print matching values. Treat examples and placeholders differently from real credentials.

### Relationships and duplication

- Find backlinks to superseded or deletion-candidate memories.
- Identify multiple notes describing the same incident, architecture, or plan.
- Prefer one concise current note plus genuinely useful historical diagnostics.
- Flag body links as well as `related` frontmatter.

## Phase 3: Corroborate Claims

Prioritize notes that claim to describe a live system or current workflow.

For each one:

1. Identify the authoritative source:
   - tracked configuration
   - live service state
   - current project documentation
   - current local dotfiles
   - current API/DNS/certificate response
2. Load the matching domain skill before touching that system.
3. Read the system's own README or runbook completely.
4. Use read-only checks first.
5. Compare the memory's claims against reality and record evidence.

Examples:

- A deployment plan may now be implemented with a substantially different design.
- A “current” backup note may still describe retired disks and disabled jobs.
- A local fix may reference software no longer installed.
- A supposedly failed experiment may still have live services, firewall rules, monitors, DNS, launchers, and tracked files.

## Phase 4: Classify Every Finding

First verify that each memory's `status` matches its contents and corroborated state. Then use these audit buckets:

### Keep

Accurate, useful, uniquely informative, and appropriately historical or current.

### Update

The topic remains useful, but current-state claims, paths, architecture, terminology, tasks, or relationships are wrong.

### Delete

Use when the note is:

- fully superseded with no unique value
- an implemented plan whose instructions now conflict with reality
- duplicated by a better consolidated note
- documentation for removed software or an abandoned experiment
- mostly dangerous stale instructions

### Needs user input

Use when reality cannot answer a personal or physical-state question: whether hardware moved off-site, a workflow is still wanted, or a backlog still matters.

### Live issue outside the vault

A real service/config problem discovered during corroboration. Report it separately before fixing it.

## Phase 5: Present the Audit

Report:

- total memories and validation result
- definite deletion candidates with one-line reasons
- update candidates with specific contradictions
- legitimate open work
- sensitive-material findings without values
- unrelated live issues
- proposed cleanup batch

Do not change memories yet.

## Phase 6: Obtain Approval

For deletions:

- list every exact path
- wait for explicit deletion approval

For rewrites:

- propose every path
- show the **complete replacement Markdown**, including frontmatter
- wait for explicit approval of the drafts

If the user excludes a note or wants to handle it separately, leave it untouched.

Approval of an audit summary is not approval of unseen replacement text.

## Phase 7: Apply Approved Cleanup

1. Delete only approved paths. Prefer `memory-vault delete "<filename>.md"` when the bundled CLI is available.
2. Write only approved replacement drafts.
3. Ensure every surviving memory has a filename-derived title, one-line description, and accurate status.
4. Repair `related` frontmatter and body links in surviving notes.
5. Keep relationships bidirectional where useful.
6. Search the vault for every deleted filename and former identifier.
7. Do not preserve unnecessary tombstone prose such as “the old system was removed” unless that history prevents a likely mistake.

Prefer concise current-state notes over appending another correction banner to a long obsolete plan.

## Phase 8: Verify

Run all available validation:

```bash
git -C "$MEMORY_VAULT" diff --check
rg -n '<deleted-memory-name>|<known-stale-term>' "$MEMORY_VAULT" --glob '*.md'
```

Also run the native memory validator and confirm:

- no malformed frontmatter
- valid title, description, and status metadata
- no broken relationships
- no remaining backlinks to deleted notes
- no accidental secret values in rewritten notes
- expected memory count

## Phase 9: Commit and Push

Before staging, inspect status again. Commit only the approved vault files:

```bash
git -C "$MEMORY_VAULT" status --short
git -C "$MEMORY_VAULT" add <explicit paths>
git -C "$MEMORY_VAULT" commit -m "docs(memory): audit stale memories"
```

Use one audit commit unless the user asks to split it. Keep live-system fixes in their own repositories and commits.

## Live-System Cleanup

If the audit uncovers stale production machinery:

1. load the relevant domain skill;
2. inspect repository instructions and Git state;
3. enumerate the full footprint—services, timers, firewall rules, routes, monitors, DNS, files, packages, launchers, and memories;
4. present exact sudo commands before running any sudo command;
5. remove runtime state and tracked configuration deliberately;
6. validate configs before reload/recreate;
7. verify ports, processes, monitors, URLs, files, and Git state afterward;
8. commit and push each repository separately;
9. only then delete the memory describing the experiment.

## Final Report

State concisely:

- memories deleted and rewritten
- relationships repaired
- validation result and final memory count
- vault commit and push state
- live systems changed, with separate commit IDs
- unresolved items requiring user action

## Common Failure Modes

- Treating structural validation as factual validation.
- Searching filenames but not content.
- Deleting all historical notes merely because they are old.
- Keeping giant superseded plans “for history” when they are mostly wrong.
- Dumping secrets or secret-bearing logs during broad searches.
- Editing a memory before showing its full replacement draft.
- Deleting a failed-experiment memory while leaving the experiment running.
- Mixing live-service fixes into the memory-vault commit.
- Staging unrelated files with `git add -A`.
