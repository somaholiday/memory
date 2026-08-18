#!/usr/bin/env node
// Command-line adapter for the shared memory vault module.
// Agent skills use this when their harness has no native memory tools.

import * as fs from "node:fs";
import { parseArgs } from "node:util";
import {
  formatSearchResponse,
  formatValidationResult,
  openMemoryVault,
} from "../../core/src/index.js";

const HELP = `memory-vault <command> [arguments]

Commands:
  init                         Create the configured vault
  status                       Show vault and index status
  list                         List memories
  search <query>               Search with BM25 and optional vectors
  read <filename.md>           Read one memory
  hash <filename.md>           Print a memory's content hash for --expect-hash
  write <filename.md>          Write content from --content-file or stdin
  delete <filename.md>         Delete one memory
  validate                     Validate all memories

Options:
  --vault <path>               Override MEMORY_VAULT
  --json                       Emit JSON
  --content-file <path>        Read write content from a file
  --commit-message <message>   Commit a write when the vault is a Git repo
  --expect-hash <hash>         Fail the write if the memory changed since this hash
  --force                      Overwrite even if the memory changed since it was read
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    vault: { type: "string" },
    json: { type: "boolean", default: false },
    "content-file": { type: "string" },
    "commit-message": { type: "string" },
    "expect-hash": { type: "string" },
    force: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

function output(value: unknown, text: () => string): void {
  console.log(values.json ? JSON.stringify(value, null, 2) : text());
}

async function main(): Promise<void> {
  if (values.help || positionals.length === 0) {
    console.log(HELP);
    return;
  }

  const [command, ...args] = positionals;
  const vault = openMemoryVault({ path: values.vault });

  switch (command) {
    case "init": {
      const status = vault.init();
      output(status, () => `Memory vault ready: ${status.path}`);
      return;
    }
    case "status": {
      const status = vault.status();
      output(status, () => [
        `Vault: ${status.path}`,
        `Initialized: ${status.initialized ? "yes" : "no"}`,
        `Memories: ${status.files}`,
        `Index: ${status.indexPath}`,
        `Embedding cache: ${status.embeddingCachePath}`,
        `Git: ${status.git ? "yes" : "no"}`,
        `Embeddings: ${status.embeddingsConfigured ? "configured" : "disabled (BM25 only)"}`,
      ].join("\n"));
      return;
    }
    case "list": {
      const files = vault.list();
      output(files, () => files.map((file) => `${file.path}${file.preview ? ` — ${file.preview}` : ""}`).join("\n"));
      return;
    }
    case "search": {
      const query = args.join(" ").trim();
      if (!query) throw new Error("search requires a query");
      const result = await vault.search(query);
      output(result, () => formatSearchResponse(query, result));
      return;
    }
    case "read": {
      const filename = args[0];
      if (!filename) throw new Error("read requires a filename");
      const content = vault.read(filename);
      output({ path: filename, content }, () => content);
      return;
    }
    case "hash": {
      const filename = args[0];
      if (!filename) throw new Error("hash requires a filename");
      const hash = vault.hash(filename);
      output({ path: filename, hash }, () => hash);
      return;
    }
    case "write": {
      const filename = args[0];
      if (!filename) throw new Error("write requires a filename");
      const content = values["content-file"]
        ? fs.readFileSync(values["content-file"], "utf-8")
        : fs.readFileSync(0, "utf-8");
      const result = vault.write({
        path: filename,
        content,
        commitMessage: values["commit-message"],
        expectedHash: values["expect-hash"],
        force: values.force,
      });
      output(result, () => `Memory saved: ${result.path}${result.commit ? `\n${result.commit}` : ""}`);
      return;
    }
    case "delete": {
      const filename = args[0];
      if (!filename) throw new Error("delete requires a filename");
      const result = vault.delete(filename, values["commit-message"]);
      output(result, () => `Memory deleted: ${result.path}${result.commit ? `\n${result.commit}` : ""}`);
      return;
    }
    case "validate": {
      const result = vault.validate();
      output(result, () => formatValidationResult(result));
      if (result.errors.length > 0) process.exitCode = 1;
      return;
    }
    default:
      throw new Error(`Unknown command: ${command}\n\n${HELP}`);
  }
}

main().catch((error) => {
  console.error(`memory-vault: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
