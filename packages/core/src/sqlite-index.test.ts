// Tests extraction of OKF discovery metadata into the disposable memory index.
// Uses a temporary Markdown file without opening SQLite.

import { afterEach, describe, expect, test } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseFile } from "./sqlite-index.js";

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("parseFile", () => {
	test("prefers frontmatter title and description over body-derived values", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-db-"));
		tempDirs.push(dir);
		const filename = "2026-07-23 example-memory.md";
		const filePath = path.join(dir, filename);
		fs.writeFileSync(filePath, `---
type: Memory
title: Frontmatter Title
description: Frontmatter description.
status: reference
date: 2026-07-23
tags: [test, portable]
related:
  - "[[2026-07-22 related-memory]]"
---

# Body Title

Body preview text.
`);

		const parsed = parseFile(filePath, filename);
		expect(parsed.title).toBe("Frontmatter Title");
		expect(parsed.preview).toBe("Frontmatter description.");
		expect(parsed.date).toBe("2026-07-23");
		expect(parsed.tags).toEqual(["test", "portable"]);
		expect(parsed.related).toEqual(["[[2026-07-22 related-memory]]"]);
	});
});
