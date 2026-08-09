// Installs the packaged Agent Skills into any harness skill directory.
// Copying is the portable default; callers must opt in before replacing files.

import * as fs from "node:fs";
import * as path from "node:path";

export const SKILL_NAMES = ["memory-read", "memory-write", "memory-audit"] as const;

export interface InstallSkillsOptions {
  sourceDir: string;
  targetDir: string;
  force?: boolean;
}

export interface InstallSkillsResult {
  installed: string[];
  targetDir: string;
}

export function installSkills(options: InstallSkillsOptions): InstallSkillsResult {
  const sourceDir = path.resolve(options.sourceDir);
  const targetDir = path.resolve(options.targetDir);
  fs.mkdirSync(targetDir, { recursive: true });

  const collisions = SKILL_NAMES.filter((name) => fs.existsSync(path.join(targetDir, name)));
  if (collisions.length > 0 && !options.force) {
    throw new Error(
      `Refusing to replace existing skills: ${collisions.join(", ")}. Re-run with --force after reviewing them.`,
    );
  }

  for (const name of SKILL_NAMES) {
    const source = path.join(sourceDir, name);
    if (!fs.existsSync(path.join(source, "SKILL.md"))) {
      throw new Error(`Packaged skill is missing: ${source}`);
    }
    const target = path.join(targetDir, name);
    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(source, target, { recursive: true });
  }

  return { installed: [...SKILL_NAMES], targetDir };
}
