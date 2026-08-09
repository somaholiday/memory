#!/usr/bin/env node
// CLI for locating or installing the packaged Agent Skills.
// It makes no assumptions about which harness owns the target directory.

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { installSkills, SKILL_NAMES } from "./skill-installer.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = path.join(packageRoot, "skills");

const HELP = `memory-skills <command> [target]

Commands:
  path                 Print the packaged skills directory
  list                 List included skills
  install <target>     Copy all skills into a harness skill directory

Options:
  --force              Replace existing skill directories
  -h, --help           Show this help
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    force: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

function main(): void {
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
      if (!target) throw new Error("install requires a target skill directory");
      const result = installSkills({ sourceDir: skillsDir, targetDir: target, force: values.force });
      console.log(`Installed ${result.installed.length} skills in ${result.targetDir}:`);
      for (const name of result.installed) console.log(`- ${name}`);
      return;
    }
    default:
      throw new Error(`Unknown command: ${command}\n\n${HELP}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`memory-skills: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
