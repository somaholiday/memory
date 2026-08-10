// Tests agent detection and plain-terminal target selection parsing.
// Injected filesystem and command checks keep host tools out of the results.

import { describe, expect, test } from "vitest";
import * as path from "node:path";
import { detectSkillTargets, parseTargetSelection, type SkillTarget } from "./skill-targets.js";

const homeDir = path.resolve("/home/tester");

function targets(): SkillTarget[] {
  return [
    { id: "claude", label: "Claude Code", targetDir: path.join(homeDir, ".claude/skills") },
    { id: "codex", label: "Codex", targetDir: path.join(homeDir, ".agents/skills") },
    { id: "pi", label: "Pi", targetDir: path.join(homeDir, ".pi/agent/skills") },
  ];
}

describe("detectSkillTargets", () => {
  test("detects agents from their config directories", () => {
    const existing = new Set([path.join(homeDir, ".claude"), path.join(homeDir, ".pi/agent")]);
    const detected = detectSkillTargets({
      homeDir,
      exists: (candidate) => existing.has(candidate),
      commandExists: () => false,
    });
    expect(detected).toEqual([targets()[0], targets()[2]]);
  });

  test("detects agents available on PATH", () => {
    const detected = detectSkillTargets({
      homeDir,
      pathValue: "/bin",
      exists: () => false,
      commandExists: (command) => command === "codex",
    });
    expect(detected).toEqual([targets()[1]]);
  });
});

describe("parseTargetSelection", () => {
  test("accepts multiple numbers and removes duplicates", () => {
    expect(parseTargetSelection("3, 1 3", targets())).toEqual([targets()[2], targets()[0]]);
  });

  test("accepts all", () => {
    expect(parseTargetSelection("all", targets())).toEqual(targets());
  });

  test("rejects choices outside the menu", () => {
    expect(() => parseTargetSelection("4", targets())).toThrow('Choose numbers from 1 to 3, or "all"');
  });
});
