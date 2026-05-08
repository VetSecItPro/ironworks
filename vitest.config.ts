import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/db",
      "packages/shared",
      "packages/adapters/anthropic-api",
      "packages/adapters/claude-local",
      "packages/adapters/codex-local",
      "packages/adapters/cursor-local",
      "packages/adapters/gemini-local",
      "packages/adapters/openai-api",
      "packages/adapters/opencode-local",
      "packages/adapters/openrouter-api",
      "packages/adapters/pi-local",
      "packages/adapters/poe-api",
      "server",
      "ui",
      "cli",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["server/src/**/*.ts", "ui/src/**/*.{ts,tsx}"],
      exclude: ["**/*.test.*", "**/*.spec.*", "**/dist/**", "**/node_modules/**"],
      thresholds: {
        statements: 30,
        branches: 30,
        functions: 30,
        lines: 30,
      },
    },
  },
});
