// Builds the interactive memory browser used by the /memory command.
// Shows title previews and filters the list as the user types.

import { DynamicBorder, type Theme } from "@earendil-works/pi-coding-agent";
import {
  Container,
  fuzzyFilter,
  Key,
  type KeybindingsManager,
  matchesKey,
  type SelectItem,
  Text,
  type TUI,
} from "@earendil-works/pi-tui";
import type { MemoryEntry } from "../../core/src/index.js";
import { FlexList, type FlexListTheme } from "./flex-list.js";

interface BrowserOptions {
  items: SelectItem[];
  title: string;
  helpText: string;
}

function listTheme(theme: Theme): FlexListTheme {
  return {
    selectedText: (text) => theme.fg("accent", text),
    description: (text) => theme.fg("muted", text),
    scrollInfo: (text) => theme.fg("dim", text),
    noMatch: (text) => theme.fg("warning", text),
  };
}

export function createMemoryBrowser(
  options: BrowserOptions,
  tui: TUI,
  theme: Theme,
  keybindings: KeybindingsManager,
  done: (value: string | null) => void,
) {
  const container = new Container();
  let filter = "";

  container.addChild(new DynamicBorder((text) => theme.fg("accent", text)));
  container.addChild(new Text(` ${theme.fg("accent", theme.bold(options.title))}`, 1, 0));

  const filterDisplay = new Text("", 1, 0);
  container.addChild(filterDisplay);

  const list = new FlexList(options.items, {
    keybindings,
    maxVisible: Math.min(options.items.length, 15),
    theme: listTheme(theme),
  });
  list.onSelect = (item) => done(item.value);
  container.addChild(list);

  container.addChild(new Text(theme.fg("dim", options.helpText), 1, 0));
  container.addChild(new DynamicBorder((text) => theme.fg("accent", text)));

  function applyFilter(): void {
    const items = filter
      ? fuzzyFilter(options.items, filter, (item) => `${item.label} ${item.description ?? ""}`)
      : options.items;
    list.setItems(items);
    filterDisplay.setText(filter ? `${theme.fg("accent", " Filter: ")}${filter}` : "");
    tui.requestRender();
  }

  return {
    render: (width: number) => container.render(width),
    invalidate: () => container.invalidate(),
    handleInput(data: string) {
      if (keybindings.matches(data, "tui.select.cancel")) {
        if (filter) {
          filter = "";
          applyFilter();
        } else {
          done(null);
        }
        tui.requestRender();
        return;
      }
      if (matchesKey(data, Key.backspace)) {
        if (filter) {
          filter = filter.slice(0, -1);
          applyFilter();
        }
        return;
      }
      if (data.length === 1 && data.charCodeAt(0) >= 32) {
        filter += data;
        applyFilter();
        return;
      }
      list.handleInput(data);
      tui.requestRender();
    },
  };
}

function memoryItems(files: MemoryEntry[]): SelectItem[] {
  return files.map((file) => ({
    value: file.path,
    label: `📄 ${file.path.replace(/\.md$/, "")}`,
    description: file.preview,
  }));
}

export function memoryBrowserFactory(files: MemoryEntry[]) {
  const count = `${files.length} ${files.length === 1 ? "memory" : "memories"}`;
  return (tui: TUI, theme: Theme, keybindings: KeybindingsManager, done: (value: string | null) => void) =>
    createMemoryBrowser({
      items: memoryItems(files),
      title: `Memory — ${count}`,
      helpText: " ↑↓ navigate • enter open • type to filter • esc quit",
    }, tui, theme, keybindings, done);
}

export function searchBrowserFactory(files: MemoryEntry[], query: string) {
  const count = `${files.length} ${files.length === 1 ? "result" : "results"}`;
  return (tui: TUI, theme: Theme, keybindings: KeybindingsManager, done: (value: string | null) => void) =>
    createMemoryBrowser({
      items: memoryItems(files),
      title: `Search “${query}” — ${count}`,
      helpText: " ↑↓ navigate • enter open • type to filter • esc cancel",
    }, tui, theme, keybindings, done);
}
