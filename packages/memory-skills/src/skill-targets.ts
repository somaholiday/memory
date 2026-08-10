// Detects supported agent installations and selects their user skill directories.
// Interactive selection uses fzf when present, with a plain prompt as fallback.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";

export interface SkillTarget {
  id: "claude" | "codex" | "pi";
  label: string;
  targetDir: string;
}

interface DetectSkillTargetsOptions {
  homeDir?: string;
  pathValue?: string;
  exists?: (candidate: string) => boolean;
  commandExists?: (command: string, pathValue: string) => boolean;
}

const TARGETS = [
  { id: "claude", label: "Claude Code", configDir: ".claude", command: "claude", skillsDir: ".claude/skills" },
  { id: "codex", label: "Codex", configDir: ".codex", command: "codex", skillsDir: ".agents/skills" },
  { id: "pi", label: "Pi", configDir: ".pi/agent", command: "pi", skillsDir: ".pi/agent/skills" },
] as const;

export function commandExists(command: string, pathValue: string): boolean {
  const extensions = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  return pathValue.split(path.delimiter).some((directory) =>
    extensions.some((extension) => {
      try {
        fs.accessSync(path.join(directory, `${command}${extension}`), fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    }),
  );
}

export function detectSkillTargets(options: DetectSkillTargetsOptions = {}): SkillTarget[] {
  const homeDir = options.homeDir ?? os.homedir();
  const pathValue = options.pathValue ?? process.env.PATH ?? "";
  const exists = options.exists ?? fs.existsSync;
  const hasCommand = options.commandExists ?? commandExists;

  return TARGETS.filter(
    (target) => exists(path.join(homeDir, target.configDir)) || hasCommand(target.command, pathValue),
  ).map((target) => ({
    id: target.id,
    label: target.label,
    targetDir: path.join(homeDir, target.skillsDir),
  }));
}

export function parseTargetSelection(input: string, targets: SkillTarget[]): SkillTarget[] {
  const answer = input.trim().toLowerCase();
  if (answer === "all" || answer === "*") return [...targets];
  if (answer === "") return [];

  const indexes = answer.split(/[\s,]+/).map((value) => Number.parseInt(value, 10));
  if (indexes.some((index) => !Number.isInteger(index) || index < 1 || index > targets.length)) {
    throw new Error(`Choose numbers from 1 to ${targets.length}, or "all"`);
  }
  return [...new Set(indexes)].map((index) => targets[index - 1]);
}

function selectWithFzf(targets: SkillTarget[]): SkillTarget[] | undefined {
  if (!commandExists("fzf", process.env.PATH ?? "")) return undefined;

  const choices = targets.map((target) => `${target.id}\t${target.label}\t${target.targetDir}`).join("\n");
  const result = spawnSync(
    "fzf",
    [
      "--multi",
      "--delimiter=\\t",
      "--with-nth=2,3",
      "--prompt=Install skills for: ",
      "--header=Tab: toggle • Enter: install • Esc: cancel",
    ],
    { input: `${choices}\n`, encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] },
  );
  if (result.status === 1 || result.status === 130) return [];
  if (result.status !== 0) return undefined;

  const selectedIds = new Set(
    result.stdout.trim().split("\n").filter(Boolean).map((line) => line.split("\t", 1)[0]),
  );
  return targets.filter((target) => selectedIds.has(target.id));
}

export async function selectSkillTargets(targets: SkillTarget[]): Promise<SkillTarget[]> {
  const fzfSelection = selectWithFzf(targets);
  if (fzfSelection) return fzfSelection;

  console.log("Detected agent skill directories:");
  targets.forEach((target, index) => console.log(`  ${index + 1}. ${target.label} — ${target.targetDir}`));
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await prompt.question('Install where? Enter numbers separated by commas, or "all": ');
    return parseTargetSelection(answer, targets);
  } finally {
    prompt.close();
  }
}
