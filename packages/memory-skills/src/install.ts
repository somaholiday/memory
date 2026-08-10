#!/usr/bin/env node
// CLI for locating or installing the packaged Agent Skills.
// It detects common agents while retaining an explicit target for scripts.

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { findSkillCollisions, installSkills, SKILL_NAMES } from "./skill-installer.js";
import { detectSkillTargets, selectSkillTargets, type SkillTarget } from "./skill-targets.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = path.join(packageRoot, "skills");

const HELP = `memory-skills <command> [target]

Commands:
  path                 Print the packaged skills directory
  list                 List included skills
  install [target]     Choose detected agents, or copy skills to an explicit directory

Options:
  --all                Install into every detected agent skill directory
  --force              Replace existing skill directories
  -h, --help           Show this help
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    all: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

function installIntoTargets(targets: Array<Pick<SkillTarget, "label" | "targetDir">>): void {
  if (targets.length === 0) {
    console.log("No targets selected; nothing installed.");
    return;
  }

  if (!values.force) {
    const collisions = targets.flatMap((target) =>
      findSkillCollisions(target.targetDir).map((skill) => `${target.label}: ${skill}`),
    );
    if (collisions.length > 0) {
      throw new Error(
        `Refusing to replace existing skills:\n- ${collisions.join("\n- ")}\nRe-run with --force after reviewing them.`,
      );
    }
  }

  for (const target of targets) {
    const result = installSkills({
      sourceDir: skillsDir,
      targetDir: target.targetDir,
      force: values.force,
    });
    console.log(`Installed ${result.installed.length} skills for ${target.label} in ${result.targetDir}`);
  }
}

async function main(): Promise<void> {
  if (values.help || positionals.length === 0) {
    console.log(HELP);
    return;
  }

  const [command, target] = positionals;
  switch (command) {
    case "path":
      console.log(skillsDir);
      return;
    case "list":
      console.log(SKILL_NAMES.join("\n"));
      return;
    case "install": {
      if (target) {
        if (values.all) throw new Error("--all cannot be used with an explicit target directory");
        installIntoTargets([{ label: "custom target", targetDir: target }]);
        return;
      }

      const detected = detectSkillTargets();
      if (detected.length === 0) {
        throw new Error("No supported agents detected. Pass an explicit target directory instead.");
      }
      if (values.all) {
        installIntoTargets(detected);
        return;
      }
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error("Interactive selection needs a terminal. Pass a target directory or use --all.");
      }
      installIntoTargets(await selectSkillTargets(detected));
      return;
    }
    default:
      throw new Error(`Unknown command: ${command}\n\n${HELP}`);
  }
}

main().catch((error) => {
  console.error(`memory-skills: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
