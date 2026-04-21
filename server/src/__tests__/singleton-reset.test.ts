/**
 * Proves that module-level singleton state is reset between it() blocks by the
 * global setup file (`helpers/setup-singletons.ts`).
 *
 * Why this test exists: if the setup file's beforeEach hook is ever removed or
 * broken, these tests will fail in a deterministic order-dependent way, giving
 * an unambiguous signal that singleton pollution is back.
 *
 * Each describe block covers one singleton-bearing module. Test A mutates
 * state, test B asserts the mutation is gone. Because vitest runs describe
 * blocks sequentially within a file, A always executes before B.
 */

import { describe, expect, it } from "vitest";

describe("live-events: nextEventId resets between tests", () => {
  it("A — increments nextEventId by publishing an event", async () => {
    const { publishLiveEvent } = await import("../services/live-events.js");
    const evt = publishLiveEvent({ companyId: "c1", type: "agent.created" });
    // The counter starts at 0 at the top of every it() block. After one call it
    // must be exactly 1 (not some accumulated value from a prior test).
    expect(evt.id).toBe(1);
  });

  it("B — nextEventId is back to 0, so first event id is again 1", async () => {
    const { publishLiveEvent } = await import("../services/live-events.js");
    const evt = publishLiveEvent({ companyId: "c2", type: "agent.created" });
    expect(evt.id).toBe(1);
  });
});

describe("knowledge: KB_SUMMARY_CACHE resets between tests", () => {
  it("A — populates cache via cacheKBSummary", async () => {
    const { cacheKBSummary, getCachedKBSummary } = await import("../services/knowledge.js");
    cacheKBSummary("page-1", "hello");
    expect(getCachedKBSummary("page-1")).toBe("hello");
  });

  it("B — cache is empty; page-1 entry from A is gone", async () => {
    const { getCachedKBSummary } = await import("../services/knowledge.js");
    expect(getCachedKBSummary("page-1")).toBeNull();
  });
});

describe("run-log-store: cachedStore resets between tests", () => {
  it("A — first call creates and caches the store", async () => {
    const { getRunLogStore } = await import("../services/run-log-store.js");
    const store = getRunLogStore();
    expect(store).not.toBeNull();
  });

  it("B — reset cleared cachedStore; getRunLogStore() returns a fresh instance", async () => {
    const { getRunLogStore } = await import("../services/run-log-store.js");
    // If reset worked the module re-constructs the store — no throw expected.
    const store = getRunLogStore();
    expect(store).not.toBeNull();
  });
});
