// Validates memory documents and vault-wide OKF conformance.
// Enforces the portable schema and reports non-portable or broken links.

import * as fs from "node:fs";
import * as path from "node:path";
import { parseDocument } from "yaml";

export interface MemoryValidationResult {
	errors: string[];
	warnings: string[];
}

export interface VaultValidationResult extends MemoryValidationResult {
	fileCount: number;
}

interface ValidationOptions {
	vaultPath?: string;
	memoryPath?: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const RESERVED_FILES = new Set(["index.md", "log.md"]);
const MEMORY_STATUSES = new Set(["reference", "active", "plan"]);

function validDate(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const [year, month, day] = value.split("-").map(Number);
	const parsed = new Date(Date.UTC(year, month - 1, day));
	return parsed.getUTCFullYear() === year
		&& parsed.getUTCMonth() === month - 1
		&& parsed.getUTCDate() === day;
}

/** Remove fenced and inline code, where Markdown does not recognize links. */
function stripCode(markdown: string): string {
	let fence: { char: string; length: number } | null = null;
	const lines = markdown.split("\n").map((line) => {
		const marker = line.match(/^\s*(`{3,}|~{3,})/);
		if (marker) {
			const char = marker[1][0];
			if (!fence) fence = { char, length: marker[1].length };
			else if (char === fence.char && marker[1].length >= fence.length) fence = null;
			return "";
		}
		return fence ? "" : line;
	});
	return lines.join("\n").replace(/(`+)[^\n]*?\1/g, "");
}

function relatedTarget(reference: string): string {
	const wikilink = reference.match(/^\[\[([^\]|]+)(?:\|[^\]]+)?]]$/);
	const target = (wikilink?.[1] ?? reference).split("#", 1)[0];
	return target.endsWith(".md") ? target : `${target}.md`;
}

/** Validate one memory before it is written or indexed. */
export function validateMemoryContent(content: string, options: ValidationOptions = {}): MemoryValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const frontmatterMatch = content.match(FRONTMATTER);
	if (!frontmatterMatch) {
		return { errors: ["missing YAML frontmatter at the start of the file"], warnings };
	}

	const document = parseDocument(frontmatterMatch[1], { prettyErrors: false });
	if (document.errors.length > 0) {
		return {
			errors: document.errors.map((error) => `invalid YAML frontmatter: ${error.message}`),
			warnings,
		};
	}

	const frontmatter = document.toJS();
	if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
		return { errors: ["YAML frontmatter must be a mapping"], warnings };
	}

	if (frontmatter.type !== "Memory") errors.push("type must be exactly 'Memory'");
	if (typeof frontmatter.title !== "string" || !frontmatter.title.trim()) {
		errors.push("title must be a non-empty string");
	}
	if (typeof frontmatter.description !== "string" || !frontmatter.description.trim() || /[\r\n]/.test(frontmatter.description)) {
		errors.push("description must be a non-empty single-line string");
	}
	if (typeof frontmatter.status !== "string" || !MEMORY_STATUSES.has(frontmatter.status)) {
		errors.push("status must be one of: reference, active, plan");
	}
	if (typeof frontmatter.date !== "string" || !validDate(frontmatter.date)) {
		errors.push("date must be a valid YYYY-MM-DD value");
	}
	if (!Array.isArray(frontmatter.tags) || frontmatter.tags.some((tag: unknown) => typeof tag !== "string" || !tag.trim())) {
		errors.push("tags must be a YAML list of non-empty strings");
	}
	if (!Array.isArray(frontmatter.related) || frontmatter.related.some((ref: unknown) => typeof ref !== "string" || !ref.trim())) {
		errors.push("related must be a YAML list of non-empty strings");
	}

	const body = stripCode(content.slice(frontmatterMatch[0].length));
	const wikilinks = [...body.matchAll(/!?\[\[[^\]]+]]/g)].map((match) => match[0]);
	if (wikilinks.length > 0) {
		errors.push(`body contains non-portable wiki-style link${wikilinks.length === 1 ? "" : "s"}: ${wikilinks.join(", ")}`);
	}

	if (Array.isArray(frontmatter.related) && options.vaultPath) {
		for (const reference of frontmatter.related) {
			if (typeof reference !== "string" || !reference.trim()) continue;
			const target = relatedTarget(reference);
			const isCurrentFile = options.memoryPath === target;
			if (!isCurrentFile && !fs.existsSync(path.join(options.vaultPath, target))) {
				warnings.push(`related target not found: ${reference} (${target})`);
			}
		}
	}

	return { errors, warnings };
}

/** Validate every root-level memory in a vault. */
export function validateVault(vaultPath: string): VaultValidationResult {
	const files = fs.readdirSync(vaultPath)
		.filter((file) => file.endsWith(".md") && !file.startsWith(".") && !RESERVED_FILES.has(file))
		.sort();
	const errors: string[] = [];
	const warnings: string[] = [];

	for (const file of files) {
		const content = fs.readFileSync(path.join(vaultPath, file), "utf-8");
		const result = validateMemoryContent(content, { vaultPath, memoryPath: file });
		errors.push(...result.errors.map((error) => `${file}: ${error}`));
		warnings.push(...result.warnings.map((warning) => `${file}: ${warning}`));
	}

	return { fileCount: files.length, errors, warnings };
}

function countLabel(count: number, singular: string): string {
	return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

/** Format validation results for the memory tool and write responses. */
export function formatValidationResult(result: VaultValidationResult | MemoryValidationResult): string {
	const counts = `${countLabel(result.errors.length, "error")}, ${countLabel(result.warnings.length, "warning")}`;
	const heading = "fileCount" in result
		? `Validated ${result.fileCount} memories: ${counts}`
		: `Validation: ${counts}`;
	const sections = [heading];
	if (result.errors.length > 0) sections.push(`Errors:\n${result.errors.map((error) => `- ${error}`).join("\n")}`);
	if (result.warnings.length > 0) sections.push(`Warnings:\n${result.warnings.map((warning) => `- ${warning}`).join("\n")}`);
	return sections.join("\n\n");
}
