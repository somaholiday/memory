// Renders memory choices in flexible title and preview columns.
// Handles selection while the browser owns text filtering.

import {
  type KeybindingsManager,
  type SelectItem,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";

export interface FlexListTheme {
  selectedText: (text: string) => string;
  description: (text: string) => string;
  scrollInfo: (text: string) => string;
  noMatch: (text: string) => string;
}

export interface FlexListOptions {
  keybindings: KeybindingsManager;
  maxVisible: number;
  theme: FlexListTheme;
  noMatchText?: string;
}

const PREFIX_SELECTED = "→ ";
const PREFIX_NORMAL = "  ";
const PREFIX_WIDTH = 2;

export class FlexList {
  private items: SelectItem[] = [];
  private selectedIndex = 0;
  private maxLabelWidth = 0;
  private readonly keybindings: KeybindingsManager;
  private readonly maxVisible: number;
  private readonly theme: FlexListTheme;
  private readonly noMatchText: string;

  onSelect?: (item: SelectItem) => void;

  constructor(items: SelectItem[], options: FlexListOptions) {
    this.keybindings = options.keybindings;
    this.maxVisible = options.maxVisible;
    this.theme = options.theme;
    this.noMatchText = options.noMatchText ?? "No matching memories";
    this.setItems(items);
  }

  setItems(items: SelectItem[]): void {
    this.items = items;
    this.selectedIndex = 0;
    this.maxLabelWidth = items.reduce(
      (width, item) => Math.max(width, visibleWidth(item.label)),
      0,
    );
  }

  invalidate(): void {
    // Render state is computed on demand.
  }

  render(width: number): string[] {
    if (this.items.length === 0) {
      return [this.theme.noMatch(`  ${this.noMatchText}`)];
    }

    const startIndex = Math.max(
      0,
      Math.min(
        this.selectedIndex - Math.floor(this.maxVisible / 2),
        this.items.length - this.maxVisible,
      ),
    );
    const endIndex = Math.min(startIndex + this.maxVisible, this.items.length);
    const lines: string[] = [];

    for (let index = startIndex; index < endIndex; index++) {
      lines.push(this.renderItem(this.items[index]!, index === this.selectedIndex, width));
    }

    if (startIndex > 0 || endIndex < this.items.length) {
      const text = `  (${this.selectedIndex + 1}/${this.items.length})`;
      lines.push(this.theme.scrollInfo(truncateToWidth(text, width - 2, "")));
    }

    return lines;
  }

  handleInput(data: string): void {
    if (this.keybindings.matches(data, "tui.select.up")) {
      this.selectedIndex = this.selectedIndex === 0
        ? this.items.length - 1
        : this.selectedIndex - 1;
    } else if (this.keybindings.matches(data, "tui.select.down")) {
      this.selectedIndex = this.selectedIndex === this.items.length - 1
        ? 0
        : this.selectedIndex + 1;
    } else if (this.keybindings.matches(data, "tui.select.confirm")) {
      const item = this.items[this.selectedIndex];
      if (item) this.onSelect?.(item);
    }
  }

  private renderItem(item: SelectItem, selected: boolean, width: number): string {
    const description = item.description?.replace(/[\r\n]+/g, " ").trim();
    const prefix = selected ? PREFIX_SELECTED : PREFIX_NORMAL;

    if (width < 40 || !description) {
      return this.renderLabel(prefix, item.label, selected, width);
    }

    const labelCap = Math.min(this.maxLabelWidth, Math.floor(width * 0.6));
    const label = truncateToWidth(item.label, labelCap, "");
    const gap = Math.max(2, labelCap - visibleWidth(label) + 2);
    const spacing = " ".repeat(gap);
    const descriptionWidth = width - PREFIX_WIDTH - visibleWidth(label) - gap - 2;

    if (descriptionWidth <= 10) {
      return this.renderLabel(prefix, item.label, selected, width);
    }

    const preview = truncateToWidth(description, descriptionWidth, "");
    if (selected) return this.theme.selectedText(`${prefix}${label}${spacing}${preview}`);
    return `${prefix}${label}${this.theme.description(spacing + preview)}`;
  }

  private renderLabel(prefix: string, label: string, selected: boolean, width: number): string {
    const text = prefix + truncateToWidth(label, width - PREFIX_WIDTH - 2, "");
    return selected ? this.theme.selectedText(text) : text;
  }
}
