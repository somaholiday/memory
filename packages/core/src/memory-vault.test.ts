// Tests the public core interface through real Markdown and SQLite operations.
// Temporary vaults keep path safety and first-run behavior isolated.

import { afterEach, describe, expect, test } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { openMemoryVault } from "./memory-vault.js";

const temporaryPaths: string[] = [];

afterEach(() => {
  for (const directory of temporaryPaths.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function temporaryVault() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "memory-vault-test-"));
  fs.rmSync(directory, { recursive: true });
  temporaryPaths.push(directory);
  return openMemoryVault({ path: directory });
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
  });

  test("rejects paths outside the vault", () => {
    const vault = temporaryVault();
    vault.init();
    expect(() => vault.read("../secret.md")).toThrow("root-level .md filename");
    expect(() => vault.write({ path: "/tmp/secret.md", content })).toThrow("root-level .md filename");
  });
});
