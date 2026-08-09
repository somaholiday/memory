// Tests portable skill installation without relying on a specific harness.
// Temporary directories cover clean installs and deliberate replacement.

import { afterEach, describe, expect, test } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { installSkills, SKILL_NAMES } from "./skill-installer.js";

const temporaryPaths: string[] = [];

afterEach(() => {
  for (const directory of temporaryPaths.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-skills-test-"));
  temporaryPaths.push(root);
  const sourceDir = path.join(root, "source");
  const targetDir = path.join(root, "target");
  for (const name of SKILL_NAMES) {
    const directory = path.join(sourceDir, name);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "SKILL.md"), `# ${name}\n`);
  }
  return { sourceDir, targetDir };
}

describe("installSkills", () => {
  test("copies every packaged skill", () => {
    const paths = fixture();
    const result = installSkills(paths);
    expect(result.installed).toEqual(SKILL_NAMES);
    for (const name of SKILL_NAMES) {
      expect(fs.readFileSync(path.join(paths.targetDir, name, "SKILL.md"), "utf-8")).toBe(`# ${name}\n`);
    }
  });

  test("requires force before replacing an existing skill", () => {
    const paths = fixture();
    installSkills(paths);
    expect(() => installSkills(paths)).toThrow("Refusing to replace existing skills");
    expect(() => installSkills({ ...paths, force: true })).not.toThrow();
  });
});
