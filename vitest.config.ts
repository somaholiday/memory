// Keeps tests isolated from the user's live memory and embedding configuration.
// The setup file runs before test modules load and cache environment-derived config.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./test/setup.ts"],
  },
});
