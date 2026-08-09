// Tests the Pi adapter through captured tool definitions rather than a model.
// The shared core still performs real SQLite work in a temporary vault.

import { afterEach, describe, expect, test } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import memoryExtension from "./index.js";

const temporaryPaths: string[] = [];

afterEach(() => {
  delete process.env.MEMORY_VAULT;
  for (const directory of temporaryPaths.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function loadTools() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pi-memory-test-"));
  fs.rmSync(directory, { recursive: true });
  temporaryPaths.push(directory);
  process.env.MEMORY_VAULT = directory;

  const tools = new Map<string, any>();
  const pi = {
    registerTool(tool: { name: string }) { tools.set(tool.name, tool); },
    registerCommand() {},
    registerMessageRenderer() {},
  } as unknown as ExtensionAPI;
  memoryExtension(pi);
  return tools;
}

const content = `---
type: Memory
title: Adapter Test
description: A memory written through the Pi adapter.
status: reference
date: 2026-08-08
tags: [test]
related: []
---

# Adapter Test

Native Pi tools share the core index.
`;

describe("pi-memory-vault", () => {
  test("registers standalone read and write tools", () => {
    const tools = loadTools();
    expect([...tools.keys()]).toEqual(["memory_read", "memory_write"]);
  });

  test("initializes, writes, and searches through native tools", async () => {
    const tools = loadTools();
    const read = tools.get("memory_read");
    const write = tools.get("memory_write");

    await read.execute("init", { action: "init" });
    await write.execute("write", { path: "2026-08-08 adapter-test.md", content });
    const result = await read.execute("search", { action: "search", query: "native tools" });

    expect(result.details.files).toEqual(["2026-08-08 adapter-test.md"]);
  });
});
