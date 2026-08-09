// Tests the custom /memory browser without starting Pi's full TUI.
// Covers fuzzy filtering, selection, and two-stage cancellation.

import { describe, expect, test, vi } from "vitest";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  Key,
  type Keybinding,
  type KeybindingsManager,
  type KeyId,
  matchesKey,
  type TUI,
} from "@earendil-works/pi-tui";
import { createMemoryBrowser } from "./browser.js";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

const keybindings = {
  matches(data: string, binding: Keybinding) {
    const keys: Partial<Record<Keybinding, KeyId>> = {
      "tui.select.up": Key.up,
      "tui.select.down": Key.down,
      "tui.select.confirm": Key.enter,
      "tui.select.cancel": Key.escape,
    };
    const key = keys[binding];
    return key ? matchesKey(data, key) : false;
  },
} as unknown as KeybindingsManager;

function buildBrowser(done = vi.fn()) {
  const requestRender = vi.fn();
  const component = createMemoryBrowser({
    items: [
      { value: "alpha.md", label: "Alpha", description: "Deploy the server" },
      { value: "beta.md", label: "Beta", description: "Design the client" },
    ],
    title: "Memory — 2 memories",
    helpText: "help",
  }, { requestRender } as unknown as TUI, theme, keybindings, done);
  return { component, done, requestRender };
}

describe("memory browser", () => {
  test("filters titles and previews, then selects the visible memory", () => {
    const { component, done } = buildBrowser();

    for (const character of "server") component.handleInput(character);

    const output = component.render(100).join("\n");
    expect(output).toContain("Filter: server");
    expect(output).toContain("Alpha");
    expect(output).not.toContain("Beta");

    component.handleInput("\r");
    expect(done).toHaveBeenCalledWith("alpha.md");
  });

  test("escape clears a filter before closing the browser", () => {
    const { component, done } = buildBrowser();

    component.handleInput("x");
    component.handleInput("\x1b");
    expect(component.render(100).join("\n")).not.toContain("Filter:");
    expect(done).not.toHaveBeenCalled();

    component.handleInput("\x1b");
    expect(done).toHaveBeenCalledWith(null);
  });
});
