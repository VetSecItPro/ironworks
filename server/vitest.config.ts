import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Reset mutable module-level singletons between every it() block. Without
    // this, services that hold counters/caches/emitters at module scope carry
    // state from test A into test B, producing non-deterministic failures.
    setupFiles: ["src/__tests__/helpers/setup-singletons.ts"],
  },
});
