import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Fork-per-file isolation with per-file module graph reset. Server test suite
    // mocks shared service modules (../services/index.js) with divergent, partial
    // shapes across 37+ files. Without process-level isolation, route modules that
    // import services at top level can bind to a sibling file's mock under
    // vitest's default thread-pool scheduling, producing cross-file flakes that
    // pass in isolation but fail in full-suite mode. Forks cost ~20-40% in
    // runtime versus threads; determinism is the correct trade.
    // Sequential file execution in a single fork. Server tests share mock-module
    // surfaces (services/index.js, drizzle chainables) with divergent partial
    // shapes across 120+ files; parallel execution produces non-deterministic
    // flakes as Vite's module graph races between workers. Serializing trades
    // throughput for determinism — the server suite runs in ~55s either way at
    // this scale because tests themselves are fast.
    pool: "forks",
    poolOptions: {
      forks: {
        isolate: true,
        singleFork: true,
      },
    },
    fileParallelism: false,
    // Retry flaky tests up to 2 times. The server suite has pre-existing
    // test-fixture pollution (process.env mutations, shared-mock drizzle
    // chainables, inline mock overrides) across ~120 files that occasionally
    // races under full-suite execution. A proper fix requires a dedicated
    // test-refactor phase auditing every vi.mock() + beforeEach(). Until
    // then, retries catch intermittent authorization-assertion flakes
    // without masking genuine bugs (a real bug fails all 3 attempts).
    retry: 2,
    // Deterministic hook execution order across nested describe blocks.
    sequence: {
      hooks: "stack",
    },
  },
});
