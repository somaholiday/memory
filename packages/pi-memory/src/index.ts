// Pi adapter for the shared SQLite-backed Markdown memory vault.
// Registers native tools, compact rendering, and the /memory command.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  getMarkdownTheme,
  truncateHead,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Container, Markdown, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import * as path from "node:path";
import { memoryBrowserFactory, searchBrowserFactory } from "./browser.js";
import {
  formatSearchResponse,
  formatValidationResult,
  openMemoryVault,
} from "../../core/src/index.js";

export default function memoryExtension(pi: ExtensionAPI) {
  const vault = openMemoryVault({ requireReadBeforeWrite: true });

  pi.registerMessageRenderer("memory", (message, { expanded }, theme) => {
    const details = message.details as { title?: string } | undefined;
    const title = details?.title ?? "Memory";
    const content = typeof message.content === "string" ? message.content : "";
    if (!expanded) return new Text(theme.fg("accent", `📎 ${title}`), 1, 0);

    const container = new Container();
    container.addChild(new Text(theme.fg("accent", `📎 ${title}`), 1, 0));
    container.addChild(new Markdown(content, 1, 0, getMarkdownTheme()));
    return container;
  });

  pi.registerTool({
    name: "memory_read",
    label: "Memory Read",
    description: "Initialize, inspect, search, read, or validate a Markdown memory vault",
    promptSnippet: "Search, read, or validate long-term memories",
    promptGuidelines: [
      "Use memory_read with action 'search' when prior decisions or saved context may help.",
      "Use memory_read with action 'list' to inspect available memories before broad exploration.",
      "Use memory_read with action 'init' only when the user asks to create the configured vault."
    ],
    parameters: Type.Object({
      action: StringEnum(["init", "status", "index", "list", "search", "read", "validate"] as const),
      query: Type.Optional(Type.String({ description: "Search text or root-level memory filename" })),
    }),
    async execute(_toolCallId, params) {
      switch (params.action) {
        case "init": {
          const status = vault.init();
          return { content: [{ type: "text" as const, text: `Memory vault ready: ${status.path}` }], details: status as unknown as Record<string, unknown> };
        }
        case "status": {
          const status = vault.status();
          const text = [
            `Vault: ${status.path}`,
            `Initialized: ${status.initialized ? "yes" : "no"}`,
            `Memories: ${status.files}`,
            `Index: ${status.indexPath}`,
            `Embedding cache: ${status.embeddingCachePath}`,
            `Git: ${status.git ? "yes" : "no"}`,
            `Embeddings: ${status.embeddingsConfigured ? "configured" : "disabled"}`,
          ].join("\n");
          return { content: [{ type: "text" as const, text }], details: status as unknown as Record<string, unknown> };
        }
        case "index":
        case "list": {
          const files = vault.list();
          const listing = files.map((file) => `- **${file.path}**${file.preview ? ` — ${file.preview}` : ""}`).join("\n");
          return {
            content: [{ type: "text" as const, text: `# Memories (${files.length})\n\n${listing}` }],
            details: { files: files.map((file) => file.path) } as Record<string, unknown>,
          };
        }
        case "search": {
          if (!params.query) throw new Error("query is required for search");
          const result = await vault.search(params.query);
          return {
            content: [{ type: "text" as const, text: formatSearchResponse(params.query, result) }],
            details: { query: params.query, backend: result.backend, files: result.files.map((file) => file.path) } as Record<string, unknown>,
          };
        }
        case "read": {
          if (!params.query) throw new Error("query is required for read");
          const content = vault.read(params.query);
          const truncation = truncateHead(content, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
          return {
            content: [{ type: "text" as const, text: truncation.content }],
            details: { path: params.query, truncated: truncation.truncated } as Record<string, unknown>,
          };
        }
        case "validate": {
          const result = vault.validate();
          return {
            content: [{ type: "text" as const, text: formatValidationResult(result) }],
            details: result as unknown as Record<string, unknown>,
          };
        }
      }
    },
  });

  pi.registerTool({
    name: "memory_write",
    label: "Memory Write",
    description: "Save a validated Markdown memory after the user approves its path and full content",
    promptSnippet: "Save an approved memory draft",
    promptGuidelines: [
      "Before memory_write, search for an existing note, show the full draft and path, and wait for explicit user approval.",
      "Use memory_write only with type, title, description, status, date, tags, and related frontmatter.",
      "On a memory conflict error, re-read the memory, merge both versions, and write again; use force only after the user explicitly approves overwriting.",
    ],
    parameters: Type.Object({
      path: Type.String({ description: "Root-level .md filename" }),
      content: Type.String({ description: "Full approved Markdown content" }),
      commitMessage: Type.Optional(Type.String({ description: "Optional Git commit message" })),
      force: Type.Optional(Type.Boolean({ description: "Overwrite despite a conflict; only with explicit user approval" })),
    }),
    async execute(_toolCallId, params) {
      const target = path.join(vault.path, params.path);
      return withFileMutationQueue(target, async () => {
        const result = vault.write(params);
        const warnings = result.warnings.length ? `\n\nWarnings:\n${result.warnings.map((item) => `- ${item}`).join("\n")}` : "";
        return {
          content: [{ type: "text" as const, text: `Memory saved: ${result.path}${result.commit ? `\n${result.commit}` : ""}${warnings}` }],
          details: result,
        };
      });
    },
  });

  pi.registerCommand("memory", {
    description: "Browse memories, search by text, or show init/status help",
    handler: async (args, ctx) => {
      const input = args.trim();
      if (input === "init") {
        const status = vault.init();
        ctx.ui.notify(`Memory vault ready: ${status.path}`, "info");
        return;
      }
      if (input === "status") {
        const status = vault.status();
        ctx.ui.notify([
          `${status.files} memories in ${status.path}`,
          `Index: ${status.indexPath}`,
          `Embeddings: ${status.embeddingsConfigured ? "configured" : "disabled"}`,
          `Git: ${status.git ? "yes" : "no"}`,
        ].join("\n"), status.initialized ? "info" : "warning");
        return;
      }

      if (!vault.status().initialized) {
        if (!ctx.hasUI || !await ctx.ui.confirm("Initialize memory vault?", `Create ${vault.path}?`)) return;
        vault.init();
        ctx.ui.notify(`Memory vault ready: ${vault.path}`, "info");
      }

      if (input) {
        const result = await vault.search(input);
        if (result.files.length === 0) {
          ctx.ui.notify(`No memories found for "${input}"`, "warning");
          return;
        }
        const selected = ctx.mode === "tui"
          ? await ctx.ui.custom<string | null>(searchBrowserFactory(result.files, input))
          : await ctx.ui.select("Choose a memory", result.files.map((file) => file.path)) ?? null;
        if (selected) loadMemory(selected);
        return;
      }
      const files = vault.list();
      if (files.length === 0) {
        ctx.ui.notify("No memories found", "warning");
        return;
      }
      const selected = ctx.mode === "tui"
        ? await ctx.ui.custom<string | null>(memoryBrowserFactory(files))
        : await ctx.ui.select("Choose a memory", files.map((file) => file.path)) ?? null;
      if (selected) loadMemory(selected);

      function loadMemory(filename: string) {
        const content = vault.read(filename);
        pi.sendMessage({ customType: "memory", content, display: true, details: { title: filename } }, { triggerTurn: false });
        ctx.ui.notify(`Loaded: ${filename}`, "info");
      }
    },
  });
}
