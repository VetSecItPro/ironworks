/**
 * G.1 — Exhaustive type test: all four HTTP adapter types must appear in AGENT_ADAPTER_TYPES.
 *
 * Why: AGENT_ADAPTER_TYPES is the authoritative discriminant used by the server registry,
 * DB schema, and Zod validators. If a new adapter type is missing, downstream schemas
 * silently reject valid payloads and the registry falls back to the process adapter.
 */
import { AGENT_ADAPTER_TYPES } from "@ironworksai/shared";
import { describe, expect, it } from "vitest";

describe("AGENT_ADAPTER_TYPES union — HTTP adapter types (G.1)", () => {
  it("includes poe_api", () => {
    expect(AGENT_ADAPTER_TYPES).toContain("poe_api");
  });

  it("includes anthropic_api", () => {
    expect(AGENT_ADAPTER_TYPES).toContain("anthropic_api");
  });

  it("includes openai_api", () => {
    expect(AGENT_ADAPTER_TYPES).toContain("openai_api");
  });

  it("includes openrouter_api", () => {
    expect(AGENT_ADAPTER_TYPES).toContain("openrouter_api");
  });

  it("retains all legacy adapter types", () => {
    const legacy = [
      "process",
      "http",
      "claude_local",
      "codex_local",
      "opencode_local",
      "pi_local",
      "cursor",
      "openclaw_gateway",
      "hermes_local",
      "ollama_cloud",
    ] as const;
    for (const t of legacy) {
      expect(AGENT_ADAPTER_TYPES).toContain(t);
    }
  });
});
