import { beforeEach } from "vitest";

/**
 * Vitest setup file: reset mutable module-level singletons between test cases.
 *
 * Why this matters: service modules that hold `let` counters, Maps, or
 * EventEmitter instances at module scope carry state from test A into
 * test B within the same file run. Execution-order-dependent failures
 * follow — a counter that was 0 when A ran is 1 when B runs, and the test
 * starts producing different output on every invocation.
 *
 * Approach: opt-in reset. Each module with singleton state exports a named
 * `_resetSingletonsForTest()` function. This setup file imports those
 * modules dynamically inside a global `beforeEach` and calls each reset.
 * Dynamic imports use `.catch(() => undefined)` so a missing module (for
 * example, when the setup file is inherited by a fork that doesn't have
 * every service) degrades silently instead of failing the whole run.
 *
 * Adding a new module to the reset set:
 *   1. Export `_resetSingletonsForTest()` from the module
 *   2. Add an entry to the `resets` array below
 *   3. Optional: add a describe block to `__tests__/singleton-reset.test.ts`
 *      proving the reset works for that module's specific state shape
 */

beforeEach(async () => {
  const resets = [
    import("../../services/live-events.js").then((m) => m._resetSingletonsForTest?.()).catch(() => undefined),
    import("../../services/run-log-store.js").then((m) => m._resetSingletonsForTest?.()).catch(() => undefined),
  ];
  await Promise.all(resets);
});
