import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/db",
      "packages/adapters/opencode-local",
      "packages/adapters/poe-api",
      "packages/adapters/anthropic-api",
      "packages/adapters/openai-api",
      "packages/adapters/openrouter-api",
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
