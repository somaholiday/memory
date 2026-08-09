// Tests memory schema validation, portable body links, and vault-wide reports.
// Filesystem cases use temporary vaults so the real memory vault stays untouched.

import { afterEach, describe, expect, test } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { formatValidationResult, validateMemoryContent, validateVault } from "./validation.js";

const tempDirs: string[] = [];

const VALID_FRONTMATTER = "type: Memory\ntitle: Example Memory\ndescription: One-line summary of the memory.\nstatus: reference\ndate: 2026-07-15\ntags: [memory, test]\nrelated: []\n";

function memory(frontmatter = VALID_FRONTMATTER, body = "# Example\n\nPortable [link](other.md).\n"): string {
	return `---\n${frontmatter}---\n\n${body}`;
}

function tempVault(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-validation-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("validateMemoryContent", () => {
	test("accepts a conformant memory", () => {
		expect(validateMemoryContent(memory())).toEqual({ errors: [], warnings: [] });
	});

	test("requires parseable mapping frontmatter", () => {
		expect(validateMemoryContent("# No frontmatter").errors).toContain("missing YAML frontmatter at the start of the file");
		expect(validateMemoryContent("---\ntags: [broken\n---\n").errors[0]?.startsWith("invalid YAML frontmatter:")).toBe(true);
		expect(validateMemoryContent("---\n- nope\n---\n").errors).toContain("YAML frontmatter must be a mapping");
	});

	test("enforces the memory vault frontmatter schema", () => {
		const result = validateMemoryContent("---\ntype: Note\ntitle: ''\ndescription: |\n  More than\n  one line.\nstatus: done\ndate: 2026-02-30\ntags: nope\nrelated: [ok, 42]\n---\n");
		expect(result.errors).toContain("type must be exactly 'Memory'");
		expect(result.errors).toContain("title must be a non-empty string");
		expect(result.errors).toContain("description must be a non-empty single-line string");
		expect(result.errors).toContain("status must be one of: reference, active, plan");
		expect(result.errors).toContain("date must be a valid YYYY-MM-DD value");
		expect(result.errors).toContain("tags must be a YAML list of non-empty strings");
		expect(result.errors).toContain("related must be a YAML list of non-empty strings");
	});

	test("accepts every supported memory status", () => {
		for (const status of ["reference", "active", "plan"]) {
			const frontmatter = VALID_FRONTMATTER.replace("status: reference", `status: ${status}`);
			expect(validateMemoryContent(memory(frontmatter)).errors).toEqual([]);
		}
	});

	test("rejects prose wikilinks but ignores code examples", () => {
		const prose = validateMemoryContent(memory(VALID_FRONTMATTER, "See [[other-memory]].\n"));
		expect(prose.errors[0]).toContain("[[other-memory]]");

		const examples = validateMemoryContent(memory(VALID_FRONTMATTER, "`[[inline-example]]`\n\n```yaml\nrelated: ['[[fenced-example]]']\n```\n"));
		expect(examples.errors).toEqual([]);
	});

	test("warns about missing related targets", () => {
		const vault = tempVault();
		const content = memory("type: Memory\ntitle: Source Memory\ndescription: Source memory description.\nstatus: reference\ndate: 2026-07-15\ntags: [memory, test]\nrelated:\n  - '[[missing-memory]]'\n");
		const result = validateMemoryContent(content, { vaultPath: vault, memoryPath: "source.md" });
		expect(result.warnings).toEqual([
			"related target not found: [[missing-memory]] (missing-memory.md)",
		]);
	});
});

describe("validateVault", () => {
	test("aggregates file paths and skips reserved files", () => {
		const vault = tempVault();
		fs.writeFileSync(path.join(vault, "good.md"), memory());
		fs.writeFileSync(path.join(vault, "bad.md"), memory("type: Note\ntitle: Bad Memory\ndescription: Invalid type.\nstatus: reference\ndate: 2026-07-15\ntags: [memory, test]\nrelated: []\n"));
		fs.writeFileSync(path.join(vault, "index.md"), "# Index\n");

		const result = validateVault(vault);
		expect(result.fileCount).toBe(2);
		expect(result.errors).toEqual(["bad.md: type must be exactly 'Memory'"]);
		expect(formatValidationResult(result)).toContain("Validated 2 memories: 1 error, 0 warnings");
	});
});
