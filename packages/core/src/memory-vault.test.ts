// Tests the public core interface through real Markdown and SQLite operations.
// Temporary vaults keep path safety and first-run behavior isolated.

import { afterEach, describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { openMemoryVault } from "./memory-vault.js";

const temporaryPaths: string[] = [];

afterEach(() => {
  for (const directory of temporaryPaths.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function temporaryVault(options: { requireReadBeforeWrite?: boolean } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "memory-vault-test-"));
  fs.rmSync(directory, { recursive: true });
  temporaryPaths.push(directory);
  return openMemoryVault({ path: directory, ...options });
}

const content = `---
type: Memory
title: Test Memory
description: A searchable memory used by the core interface test.
status: reference
date: 2026-08-08
tags: [test]
related: []
---

# Test Memory

SQLite finds this sentence.
`;

describe("MemoryVault", () => {
  test("initializes, writes, reads, searches, and validates", async () => {
    const vault = temporaryVault();
    expect(vault.status().initialized).toBe(false);
    vault.init();

    vault.write({ path: "2026-08-08 test-memory.md", content });
    expect(vault.read("2026-08-08 test-memory.md")).toBe(content);
    expect((await vault.search("SQLite")).files.map((file) => file.path)).toEqual([
      "2026-08-08 test-memory.md",
    ]);
    expect(vault.validate().errors).toEqual([]);

    vault.delete("2026-08-08 test-memory.md");
    expect(vault.list()).toEqual([]);
  });

  test("commits only the requested memory", () => {
    const vault = temporaryVault();
    vault.init();
    execFileSync("git", ["init"], { cwd: vault.path, stdio: "ignore" });
    execFileSync("git", ["config", "user.name", "Memory Test"], { cwd: vault.path });
    execFileSync("git", ["config", "user.email", "memory@example.invalid"], { cwd: vault.path });
    fs.writeFileSync(path.join(vault.path, "unrelated.txt"), "leave staged\n");
    execFileSync("git", ["add", "unrelated.txt"], { cwd: vault.path });

    vault.write({ path: "2026-08-08 test-memory.md", content, commitMessage: "Add test memory" });

    const committed = execFileSync("git", ["show", "--pretty=", "--name-only", "HEAD"], {
      cwd: vault.path,
      encoding: "utf-8",
    }).trim();
    const staged = execFileSync("git", ["diff", "--cached", "--name-only"], {
      cwd: vault.path,
      encoding: "utf-8",
    }).trim();
    expect(committed).toBe("2026-08-08 test-memory.md");
    expect(staged).toBe("unrelated.txt");
  });

  test("rejects a write when the file changed since it was read", () => {
    const vault = temporaryVault();
    vault.init();
    vault.write({ path: "2026-08-08 test-memory.md", content });
    vault.read("2026-08-08 test-memory.md");

    const other = openMemoryVault({ path: vault.path });
    other.write({ path: "2026-08-08 test-memory.md", content: content.replace("sentence", "clause") });

    expect(() => vault.write({ path: "2026-08-08 test-memory.md", content })).toThrow("Memory conflict");
    vault.read("2026-08-08 test-memory.md");
    expect(() => vault.write({ path: "2026-08-08 test-memory.md", content })).not.toThrow();
  });

  test("force skips the stale-read check", () => {
    const vault = temporaryVault();
    vault.init();
    vault.write({ path: "2026-08-08 test-memory.md", content });
    vault.read("2026-08-08 test-memory.md");

    const other = openMemoryVault({ path: vault.path });
    other.write({ path: "2026-08-08 test-memory.md", content: content.replace("sentence", "clause") });

    expect(() => vault.write({ path: "2026-08-08 test-memory.md", content, force: true })).not.toThrow();
  });

  test("enforces an expectedHash precondition", () => {
    const vault = temporaryVault();
    vault.init();
    vault.write({ path: "2026-08-08 test-memory.md", content });
    const stale = "0".repeat(64);

    expect(() => vault.write({ path: "2026-08-08 test-memory.md", content, expectedHash: stale })).toThrow("Memory conflict");
    const current = vault.hash("2026-08-08 test-memory.md");
    expect(() => vault.write({ path: "2026-08-08 test-memory.md", content, expectedHash: current })).not.toThrow();
  });

  test("requireReadBeforeWrite refuses to overwrite an unread memory", () => {
    const writer = temporaryVault();
    writer.init();
    writer.write({ path: "2026-08-08 test-memory.md", content });

    const vault = openMemoryVault({ path: writer.path, requireReadBeforeWrite: true });
    expect(() => vault.write({ path: "2026-08-08 test-memory.md", content })).toThrow("was not read in this session");
    expect(() => vault.write({ path: "2026-08-08 new-memory.md", content })).not.toThrow();
    vault.read("2026-08-08 test-memory.md");
    expect(() => vault.write({ path: "2026-08-08 test-memory.md", content })).not.toThrow();
  });

  test("rejects paths outside the vault", () => {
    const vault = temporaryVault();
    vault.init();
    expect(() => vault.read("../secret.md")).toThrow("root-level .md filename");
    expect(() => vault.write({ path: "/tmp/secret.md", content })).toThrow("root-level .md filename");
  });
});
