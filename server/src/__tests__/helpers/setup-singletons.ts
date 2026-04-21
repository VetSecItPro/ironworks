import { beforeEach } from "vitest";

/**
 * Vitest setup file: reset mutable module-level singletons between test cases.
 *
 * Why this matters: the server test suite runs inside a single fork
 * (`singleFork: true`) with per-file module graph isolation (`isolate: true`).
 * Between files, Vitest destroys and recreates the module registry — so
 * cross-file singleton pollution is already prevented by the runtime config.
 *
 * Between `it()` blocks within the same file, however, module-level `let`
 * variables and `Map`/`Set` instances persist across the full file run.
 * Services that cache query results, track in-flight promises, or accumulate
 * event counters carry stale state from test A into test B, producing
 * non-deterministic results whenever execution order affects the cache key.
 *
 * The approach here is an opt-in reset: service modules expose a named
 * `_resetSingletonsForTest()` function (defined and exported only when the
 * module is imported in a test context). The setup file calls all known
 * reset functions inside a global `beforeEach` so every `it()` block starts
 * with a clean slate.
 *
 * Modules without a reset function are listed in the audit section below.
 * They are either truly immutable (frozen `Set` of keyword stop-words) or
 * are always mocked at the `vi.mock` level in every test that touches them,
 * so their module-level state is never reached from test code.
 *
 * ── Singleton audit (as of 2026-04-21) ──────────────────────────────────────
 *
 * MUTABLE — reset required (Tier 1 — original set)
 *   services/activity-log.ts
 *     · _pluginEventBus         — let, nullable ref; registration order matters
 *     · cachedGeneralSettings   — let, timed cache; stale data across tests
 *     · _lastHashByCompany      — Map<string,string>; integrity chain anchor
 *
 *   services/heartbeat-scheduling.ts
 *     · cachedSchedulerSettings — let, timed cache
 *     · cachedSettingsAt        — let number; paired with above
 *
 *   services/knowledge.ts
 *     · KB_SUMMARY_CACHE        — Map; grows unbounded within a file run
 *
 *   services/live-events.ts
 *     · nextEventId             — let number; monotone counter leaks across tests
 *
 *   services/playbook-chunk-cache.ts
 *     · caches                  — Map<agentId, AgentCache>; per-agent chunk cache
 *
 *   services/company-skills.ts
 *     · skillInventoryRefreshPromises — Map; in-flight promise deduplicator
 *
 *   services/workspace-runtime.ts
 *     · runtimeServicesById        — Map; live process registry
 *     · runtimeServicesByReuseKey  — Map; reuse-key index
 *     · runtimeServiceLeasesByRun  — Map; per-run lease list
 *
 *   services/run-log-store.ts
 *     · cachedStore             — let; path-bound singleton, breaks when
 *                                  IRONWORKS_HOME changes between tests
 *
 *   services/workspace-operation-log-store.ts
 *     · cachedStore             — same pattern as run-log-store
 *
 *   storage/index.ts
 *     · cachedStorageService    — let; bound to config signature at first call
 *     · cachedSignature         — let string; paired with above
 *
 * MUTABLE — reset required (Tier 2 — residual set added 2026-04-21)
 *   services/tool-cache.ts
 *     · _defaultCache           — let; process-level tool result cache; stale
 *                                  entries survive between tests in same file
 *
 *   adapters/codex-models.ts
 *     · cached                  — let; timed OpenAI model list; fingerprinted by
 *                                  API key so key changes between tests miss
 *
 *   adapters/cursor-models.ts
 *     · cached                  — let; timed Cursor CLI model list
 *     · cursorModelsRunner       — let fn; tests can swap the runner via
 *                                  setCursorModelsRunnerForTests; must be
 *                                  restored so real CLI is never called in CI
 *
 *   log-redaction.ts
 *     · cachedCurrentUserCandidates — let; reads OS username/homedir on first
 *                                  call; wrong values in containers vs. dev
 *
 *   lib/error-tracking.ts
 *     · errorCount / lastErrorAt — let counters; accumulate across tests so
 *                                  assertions on getErrorStats() are order-dependent
 *
 *   board-claim.ts
 *     · activeChallenge         — let; challenge token issued in one test leaks
 *                                  into claim-route tests that follow
 *
 *   routes/sidebar-badges.ts
 *     · badgeCache              — Map; 30 s TTL; a cached response from test A
 *                                  can satisfy test B's request and suppress the
 *                                  downstream service call the assertion expects
 *
 *   routes/setup.ts
 *     · rateLimitMap            — Map; per-IP sliding window; tests that hammer
 *                                  the setup route can exhaust the limit and cause
 *                                  subsequent tests to receive unexpected 429s
 *
 *   routes/support.ts
 *     · ticketRateBuckets       — Map; same pattern as rateLimitMap
 *
 *   routes/sse.ts
 *     · clients                 — Map<companyId, Set<Response>>; a stale open
 *                                  connection from test A can receive SSE events
 *                                  emitted during test B
 *
 *   bridges/telegram.ts
 *     · bots                    — Map<companyId, BotInstance>; a running bot
 *                                  registered in test A can answer companyId
 *                                  lookups during test B
 *
 * IMMUTABLE / SAFELY MOCKED — no reset needed
 *   services/activity-log.ts      PLUGIN_EVENT_SET  (ReadonlySet, frozen)
 *   services/agent-instructions.ts IGNORED_* Sets   (frozen enum sets)
 *   services/agent-reflection.ts  KEYWORD_STOP_WORDS (frozen)
 *   services/channels.ts          STOP_WORDS         (frozen)
 *   services/issues.ts            TERMINAL_HEARTBEAT_RUN_STATUSES (frozen)
 *   services/model-council.ts     _C_SUITE_ROLES     (frozen)
 *   services/plugin-host-services.ts ALLOWED_PROTOCOLS, PINO_RESERVED_KEYS (frozen)
 *   services/routines.ts          _TERMINAL_ISSUE_STATUSES (frozen)
 *   services/secrets.ts           HTTP_PROVIDER_TYPES (frozen)
 *   services/session-state.ts     DRIFT_STOP_WORDS   (frozen)
 *   middleware/board-mutation-guard.ts SAFE_METHODS   (frozen)
 *   routes/authz.ts               (purely functional — no module state)
 *
 * ── Reset strategy ──────────────────────────────────────────────────────────
 *
 * Each mutable module exposes a `_resetSingletonsForTest()` function that the
 * setup file invokes from a global `beforeEach`. The function is co-located
 * with the module state it clears, keeping the reset logic next to the state
 * it governs. The naming convention (`_reset*`) signals test-infrastructure
 * intent and makes the export easy to grep.
 *
 * For callers that always mock these modules via `vi.mock`, the reset is a
 * cheap no-op (the real module never loaded). For the small number of tests
 * that import the real module, the reset guarantees a clean baseline.
 */

// Dynamic imports are deferred to runtime so this setup file compiles even
// when the server package's own imports are not yet fully resolved. Each
// import is guarded so a missing or mocked module cannot break unrelated tests.

beforeEach(async () => {
  await Promise.all([
    // ── Tier 1 (original set) ────────────────────────────────────────────────
    import("../../services/activity-log.js").then((m) => m._resetSingletonsForTest?.()).catch(() => undefined),

    import("../../services/heartbeat-scheduling.js").then((m) => m._resetSingletonsForTest?.()).catch(() => undefined),

    import("../../services/knowledge.js").then((m) => m._resetSingletonsForTest?.()).catch(() => undefined),

    import("../../services/live-events.js").then((m) => m._resetSingletonsForTest?.()).catch(() => undefined),

    import("../../services/playbook-chunk-cache.js").then((m) => m._resetSingletonsForTest?.()).catch(() => undefined),

    import("../../services/company-skills.js").then((m) => m._resetSingletonsForTest?.()).catch(() => undefined),

    import("../../services/workspace-runtime.js").then((m) => m._resetSingletonsForTest?.()).catch(() => undefined),

    import("../../services/run-log-store.js").then((m) => m._resetSingletonsForTest?.()).catch(() => undefined),

    import("../../services/workspace-operation-log-store.js")
      .then((m) => m._resetSingletonsForTest?.())
      .catch(() => undefined),

    import("../../storage/index.js").then((m) => m._resetSingletonsForTest?.()).catch(() => undefined),

    // ── Tier 2 (residual set — added 2026-04-21) ─────────────────────────────
    import("../../services/tool-cache.js").then((m) => m._resetSingletonsForTest?.()).catch(() => undefined),

    import("../../adapters/codex-models.js").then((m) => m._resetSingletonsForTest?.()).catch(() => undefined),

    import("../../adapters/cursor-models.js").then((m) => m._resetSingletonsForTest?.()).catch(() => undefined),

    import("../../log-redaction.js").then((m) => m._resetSingletonsForTest?.()).catch(() => undefined),

    import("../../lib/error-tracking.js").then((m) => m._resetSingletonsForTest?.()).catch(() => undefined),

    import("../../board-claim.js").then((m) => m._resetSingletonsForTest?.()).catch(() => undefined),

    import("../../routes/sidebar-badges.js").then((m) => m._resetSingletonsForTest?.()).catch(() => undefined),

    import("../../routes/setup.js").then((m) => m._resetSingletonsForTest?.()).catch(() => undefined),

    import("../../routes/support.js").then((m) => m._resetSingletonsForTest?.()).catch(() => undefined),

    import("../../routes/sse.js").then((m) => m._resetSingletonsForTest?.()).catch(() => undefined),

    import("../../bridges/telegram.js").then((m) => m._resetSingletonsForTest?.()).catch(() => undefined),
  ]);
});
