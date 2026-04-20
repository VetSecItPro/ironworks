/**
 * G.2 — Registry test: all four HTTP adapters must be registered and resolvable.
 *
 * Why: the registry is the single dispatch point for all adapter invocations. An
 * unregistered adapter silently falls back to the process adapter, producing
 * confusing "process exited 127" errors instead of a clear "adapter not found".
 */
import { describe, expect, it } from "vitest";
import { findServerAdapter, getServerAdapter, listServerAdapters } from "../adapters/registry.js";

const HTTP_ADAPTER_TYPES = ["poe_api", "anthropic_api", "openai_api", "openrouter_api"] as const;

describe("HTTP adapter registry (G.2)", () => {
  for (const adapterType of HTTP_ADAPTER_TYPES) {
    it(`findServerAdapter("${adapterType}") returns the registered module`, () => {
      const adapter = findServerAdapter(adapterType);
      expect(adapter).not.toBeNull();
      expect(adapter?.type).toBe(adapterType);
    });

    it(`getServerAdapter("${adapterType}") does not fall back to process adapter`, () => {
      const adapter = getServerAdapter(adapterType);
      // If the type is unregistered, getServerAdapter returns the process adapter as fallback.
      // Verify we are NOT falling back.
      expect(adapter.type).toBe(adapterType);
    });

    it(`${adapterType} exposes required execute and testEnvironment functions`, () => {
      const adapter = findServerAdapter(adapterType);
      expect(adapter).not.toBeNull();
      expect(typeof adapter?.execute).toBe("function");
      expect(typeof adapter?.testEnvironment).toBe("function");
    });

    it(`${adapterType} sets supportsLocalAgentJwt: false (HTTP adapters never use local JWT)`, () => {
      const adapter = findServerAdapter(adapterType);
      expect(adapter?.supportsLocalAgentJwt).toBe(false);
    });
  }

  it("listServerAdapters() includes all four HTTP adapters — no duplicates", () => {
    const all = listServerAdapters();
    const types = all.map((a) => a.type);

    for (const t of HTTP_ADAPTER_TYPES) {
      expect(types).toContain(t);
      // Duplicate registration would cause silent last-wins behaviour
      expect(types.filter((x) => x === t)).toHaveLength(1);
    }
  });
});
