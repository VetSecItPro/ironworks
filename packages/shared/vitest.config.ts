import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@ironworksai/shared",
    include: ["src/**/*.test.ts"],
  },
});
