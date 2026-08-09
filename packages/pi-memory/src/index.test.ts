// Tests the Pi adapter through captured tool definitions rather than a model.
// The shared core still performs real SQLite work in a temporary vault.

import { afterEach, describe, expect, test, vi } from "vitest";
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

function loadExtension() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pi-memory-test-"));
  fs.rmSync(directory, { recursive: true });
  temporaryPaths.push(directory);
  process.env.MEMORY_VAULT = directory;

  const tools = new Map<string, any>();
  const commands = new Map<string, any>();
  const messages: any[] = [];
  const pi = {
    registerTool(tool: { name: string }) { tools.set(tool.name, tool); },
    registerCommand(name: string, command: unknown) { commands.set(name, command); },
    registerMessageRenderer() {},
    sendMessage(message: unknown) { messages.push(message); },
  } as unknown as ExtensionAPI;
  memoryExtension(pi);
  return { commands, messages, tools };
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
    const { tools } = loadExtension();
    expect([...tools.keys()]).toEqual(["memory_read", "memory_write"]);
  });

  test("initializes, writes, and searches through native tools", async () => {
    const { tools } = loadExtension();
    const read = tools.get("memory_read");
    const write = tools.get("memory_write");

    await read.execute("init", { action: "init" });
    await write.execute("write", { path: "2026-08-08 adapter-test.md", content });
    const result = await read.execute("search", { action: "search", query: "native tools" });

    expect(result.details.files).toEqual(["2026-08-08 adapter-test.md"]);
  });

  test("opens the custom memory browser in TUI mode", async () => {
    const { commands, messages, tools } = loadExtension();
    const filename = "2026-08-08 adapter-test.md";
    await tools.get("memory_read").execute("init", { action: "init" });
    await tools.get("memory_write").execute("write", { path: filename, content });

    const custom = vi.fn().mockResolvedValue(filename);
    const notify = vi.fn();
    await commands.get("memory").handler("", {
      mode: "tui",
      ui: { custom, notify },
    });

    expect(custom).toHaveBeenCalledOnce();
    expect(messages).toEqual([expect.objectContaining({
      customType: "memory",
      details: { title: filename },
    })]);
    expect(notify).toHaveBeenCalledWith(`Loaded: ${filename}`, "info");
  });
});
