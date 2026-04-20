/**
 * Tests for Phase G.14: HTTP adapters wire to the provider secret resolver
 * via resolveAdapterConfigForRuntime.
 *
 * We test that:
 *   1. A config.apiKey already present is honoured (legacy path, no DB hit).
 *   2. A missing config.apiKey for an HTTP adapter triggers resolver lookup.
 *   3. Resolver "none" result leaves apiKey absent (adapter surfaces its own error).
 *   4. Non-HTTP adapters are not affected.
 *   5. Disabled workspace row falls through (resolver returns env or none).
 */

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Resolver mock ────────────────────────────────────────────────────────────

const mockResolveProviderSecret = vi.hoisted(() => vi.fn());

vi.mock("../services/provider-secret-resolver.js", () => ({
  resolveProviderSecret: mockResolveProviderSecret,
}));

// ── Existing secrets infrastructure mock (unchanged) ─────────────────────────

vi.mock("../secrets/provider-registry.js", () => ({
  getSecretProvider: vi.fn(() => ({ resolveVersion: vi.fn(), createVersion: vi.fn() })),
  listSecretProviders: vi.fn(() => []),
}));

vi.mock("@ironworksai/db", () => ({
  companySecrets: {},
  companySecretVersions: {},
  workspaceProviderSecrets: {},
}));

// ── Test setup ────────────────────────────────────────────────────────────────

const COMPANY_ID = randomUUID();

// Minimal DB mock — secrets.ts uses it for companySecrets queries
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: vi.fn().mockReturnThis(),
  // biome-ignore lint/suspicious/noThenProperty: test mock drizzle thenable contract
  then: vi.fn().mockImplementation((resolve: (v: unknown[]) => unknown) => resolve([])),
} as unknown as import("@ironworksai/db").Db;

describe("resolveAdapterConfigForRuntime (G.14)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("honours config.apiKey when already present (legacy path, no resolver call)", async () => {
    const { secretService } = await import("../services/secrets.js");
    const svc = secretService(mockDb);

    const result = await svc.resolveAdapterConfigForRuntime(
      COMPANY_ID,
      { apiKey: "sk-ant-already-set" },
      { adapterType: "anthropic_api" },
    );

    // Resolver must NOT be called when config already has a key
    expect(mockResolveProviderSecret).not.toHaveBeenCalled();
    expect(result.config.apiKey).toBe("sk-ant-already-set");
  });

  it("injects workspace key when config has no apiKey for an HTTP adapter", async () => {
    mockResolveProviderSecret.mockResolvedValue({
      source: "workspace",
      apiKey: "sk-ant-from-db",
      lastTestStatus: "pass",
      lastTestedAt: new Date(),
      keyLastFour: "m-db",
    });

    const { secretService } = await import("../services/secrets.js");
    const svc = secretService(mockDb);

    const result = await svc.resolveAdapterConfigForRuntime(
      COMPANY_ID,
      { model: "claude-sonnet-4-5" },
      { adapterType: "anthropic_api" },
    );

    expect(mockResolveProviderSecret).toHaveBeenCalledWith(mockDb, COMPANY_ID, "anthropic_api");
    expect(result.config.apiKey).toBe("sk-ant-from-db");
    expect(result.secretKeys.has("apiKey")).toBe(true);
  });

  it("leaves apiKey absent when resolver returns none (adapter surfaces its own error)", async () => {
    mockResolveProviderSecret.mockResolvedValue({
      source: "none",
      apiKey: null,
      lastTestStatus: null,
      lastTestedAt: null,
      keyLastFour: null,
    });

    const { secretService } = await import("../services/secrets.js");
    const svc = secretService(mockDb);

    const result = await svc.resolveAdapterConfigForRuntime(COMPANY_ID, {}, { adapterType: "openai_api" });

    expect(result.config.apiKey).toBeUndefined();
    expect(result.secretKeys.has("apiKey")).toBe(false);
  });

  it("does not call resolver for non-HTTP adapters (e.g. claude_local)", async () => {
    const { secretService } = await import("../services/secrets.js");
    const svc = secretService(mockDb);

    await svc.resolveAdapterConfigForRuntime(COMPANY_ID, {}, { adapterType: "claude_local" });

    expect(mockResolveProviderSecret).not.toHaveBeenCalled();
  });

  it("does not call resolver when no adapterType is supplied (backward compat)", async () => {
    const { secretService } = await import("../services/secrets.js");
    const svc = secretService(mockDb);

    await svc.resolveAdapterConfigForRuntime(COMPANY_ID, {});

    expect(mockResolveProviderSecret).not.toHaveBeenCalled();
  });

  it("resolves poe_api adapter from env fallback when DB row has disabled_at", async () => {
    // Resolver already handles disabled_at filtering — it returns env source
    mockResolveProviderSecret.mockResolvedValue({
      source: "env",
      apiKey: "poe-key-from-env",
      lastTestStatus: null,
      lastTestedAt: null,
      keyLastFour: null,
    });

    const { secretService } = await import("../services/secrets.js");
    const svc = secretService(mockDb);

    const result = await svc.resolveAdapterConfigForRuntime(COMPANY_ID, {}, { adapterType: "poe_api" });

    expect(result.config.apiKey).toBe("poe-key-from-env");
  });
});
