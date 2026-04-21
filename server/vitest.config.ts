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
    isolate: true,
    singleFork: true,
    fileParallelism: false,
    // Retain retry: 2. Tier 1 fixture refactor landed (37 files → makeFullServicesMock,
    // 3 files → makeChainableDb, env-scope + route-app helpers extracted), but 3× runs
    // without retries exposed residual non-deterministic module-graph pollution —
    // different cross-company/authz tests flake each run (dashboard, agent-memory,
    // tenant-isolation, library) with no single file reproducing. Full determinism
    // needs a systemic audit of every vi.mock() + beforeEach() + shared module state,
    // deferred to a future test-hygiene phase. Retries mask transient pollution
    // without hiding real bugs (genuine failures repeat all 3 attempts).
    retry: 2,
    // Deterministic hook execution order across nested describe blocks.
    sequence: {
      hooks: "stack",
    },
    // Singleton reset: clears mutable module-level state (Maps, cached refs,
    // monotone counters) between every it() block so tests that reach the real
    // service module — rather than a vi.mock stub — start with a clean slate.
    // The setup file is additive; it does not replace beforeEach hooks in
    // individual test files.
    setupFiles: ["src/__tests__/helpers/setup-singletons.ts"],
  },
});
