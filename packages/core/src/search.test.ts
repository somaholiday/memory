// Tests for hybrid memory search: RRF fusion of BM25 + vector rankings,
// graceful degradation to BM25-only, and response formatting.

import { describe, expect, test } from "vitest";
import { bm25Query, formatSearchResponse, rrfFuse, searchMemories } from "./search.js";
import type { MemoryEntry } from "./types.js";

const entry = (path: string): MemoryEntry => ({ path, title: "", date: "", preview: "" });

describe("bm25Query", () => {
	test("ORs sanitized terms", () => {
		expect(bm25Query("music listening history")).toBe('"music" OR "listening" OR "history"');
	});
	test("strips punctuation and lowercases", () => {
		expect(bm25Query("TLS cert renewal?")).toBe('"tls" OR "cert" OR "renewal"');
	});
	test("supports non-Latin terms", () => {
		expect(bm25Query("記憶を検索")).toBe('"記憶を検索"');
	});
	test("returns empty string when no usable terms", () => {
		expect(bm25Query("!!! ???")).toBe("");
	});
});

describe("rrfFuse", () => {
	test("fuses two rankings by reciprocal rank", () => {
		const fused = rrfFuse([
			["a.md", "b.md", "c.md"],
			["c.md", "a.md", "d.md"],
		]);
		// a: 1/(60+1) + 1/(60+2); c: 1/(60+3) + 1/(60+1) — both appear twice
		// a and c rank above b and d (single-list hits)
		expect(fused.slice(0, 2).sort()).toEqual(["a.md", "c.md"]);
		expect(fused).toContain("b.md");
		expect(fused).toContain("d.md");
	});

	test("a single ranking passes through in order", () => {
		expect(rrfFuse([["x.md", "y.md", "z.md"]])).toEqual(["x.md", "y.md", "z.md"]);
	});

	test("ignores empty rankings", () => {
		expect(rrfFuse([[], ["only.md"], []])).toEqual(["only.md"]);
	});
});

describe("searchMemories", () => {
	test("fuses BM25 and vector when both are available", () => {
		const result = searchMemories("query", {
			bm25: () => [entry("lex.md"), entry("shared.md")],
			vector: () => [entry("shared.md"), entry("sem.md")],
		});
		expect(result.backend).toBe("hybrid");
		// shared.md wins (appears in both), then the two singletons
		expect(result.files[0].path).toBe("shared.md");
		expect(result.files.map((f) => f.path).sort()).toEqual(["lex.md", "sem.md", "shared.md"]);
	});

	test("falls back to BM25-only when vector is unavailable", () => {
		const result = searchMemories("query", {
			bm25: () => [entry("a.md"), entry("b.md")],
			vector: () => null,
		});
		expect(result.backend).toBe("bm25");
		expect(result.files.map((f) => f.path)).toEqual(["a.md", "b.md"]);
	});

	test("falls back to BM25-only when vector returns empty", () => {
		const result = searchMemories("query", {
			bm25: () => [entry("a.md")],
			vector: () => [],
		});
		expect(result.backend).toBe("bm25");
		expect(result.files.map((f) => f.path)).toEqual(["a.md"]);
	});

	test("caps results at the configured limit", () => {
		const many = Array.from({ length: 20 }, (_, i) => entry(`f${i}.md`));
		const result = searchMemories("query", { bm25: () => many, vector: () => many, limit: 5 });
		expect(result.files).toHaveLength(5);
	});

	test("returns no results when both are empty", () => {
		const result = searchMemories("query", { bm25: () => [], vector: () => [] });
		expect(result.files).toEqual([]);
	});
});

describe("formatSearchResponse", () => {
	test("labels hybrid results", () => {
		const text = formatSearchResponse("backups", {
			backend: "hybrid",
			files: [entry("2026-03-05 vesta-backup-plan.md")],
		});
		expect(text).toContain('Found 1 memory matching "backups"');
		expect(text).toContain("hybrid");
		expect(text).toContain("- 2026-03-05 vesta-backup-plan.md");
	});

	test("labels bm25-only results", () => {
		const text = formatSearchResponse("backups", {
			backend: "bm25",
			files: [entry("a.md"), entry("b.md")],
		});
		expect(text).toContain('Found 2 memories matching "backups"');
		expect(text).toContain("BM25");
	});

	test("reports no matches", () => {
		const text = formatSearchResponse("nope", { backend: "bm25", files: [] });
		expect(text).toBe('No memories found matching "nope"');
	});
});
