/**
 * Tests for provider-secret-resolver.ts.
 *
 * The resolver has three outcomes: workspace DB row, env fallback, none.
 * We mock the DB and env vars per-test to exercise each branch.
 */

import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Vault mock ───────────────────────────────────────────────────────────────

const mockDecryptSecret = vi.fn();

vi.mock("../services/secrets-vault.js", () => ({
  decryptSecret: mockDecryptSecret,
  encryptSecret: vi.fn(),
  getKeyLastFour: vi.fn(),
}));

// ── Drizzle mock ─────────────────────────────────────────────────────────────

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();

// Drizzle fluent chain — each method returns the same chain object.
const chain = {
  select: mockSelect,
  from: mockFrom,
  where: mockWhere,
  limit: mockLimit,
};

mockSelect.mockReturnValue(chain);
mockFrom.mockReturnValue(chain);
mockWhere.mockReturnValue(chain);
// Default: empty result (no DB row)
mockLimit.mockResolvedValue([]);

const mockDb = { select: mockSelect } as unknown as import("@ironworksai/db").Db;

// ── Helpers ──────────────────────────────────────────────────────────────────

const COMPANY_ID = randomBytes(16).toString("hex");

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: randomBytes(16).toString("hex"),
    companyId: COMPANY_ID,
    provider: "anthropic_api",
    encryptedKey: Buffer.alloc(32),
    encryptedDek: Buffer.alloc(32),
    dekIv: Buffer.alloc(12),
    dekAuthTag: Buffer.alloc(16),
    keyIv: Buffer.alloc(12),
    keyAuthTag: Buffer.alloc(16),
    keyLastFour: "cdef",
    lastTestStatus: "pass",
    lastTestedAt: new Date("2026-04-01T00:00:00Z"),
    createdAt: new Date(),
    updatedAt: new Date(),
    disabledAt: null,
    ...overrides,
  };
}

let envBackup: Record<string, string | undefined> = {};

function setEnv(key: string, value: string | undefined) {
  envBackup[key] = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function restoreEnv() {
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  envBackup = {};
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("resolveProviderSecret", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue(chain);
    mockFrom.mockReturnValue(chain);
    mockWhere.mockReturnValue(chain);
    mockLimit.mockResolvedValue([]);
    mockDecryptSecret.mockReturnValue("sk-ant-decrypted-key");
  });

  afterEach(() => {
    restoreEnv();
  });

  it("returns workspace source when an active DB row exists", async () => {
    const { resolveProviderSecret } = await import("../services/provider-secret-resolver.js");
    mockLimit.mockResolvedValue([makeRow()]);

    const result = await resolveProviderSecret(mockDb, COMPANY_ID, "anthropic_api");

    expect(result.source).toBe("workspace");
    expect(result.apiKey).toBe("sk-ant-decrypted-key");
    expect(result.keyLastFour).toBe("cdef");
    expect(result.lastTestStatus).toBe("pass");
  });

  it("falls through to env when no DB row exists", async () => {
    const { resolveProviderSecret } = await import("../services/provider-secret-resolver.js");
    mockLimit.mockResolvedValue([]);
    setEnv("ADAPTER_ANTHROPIC_API_KEY", "sk-ant-env-key");

    const result = await resolveProviderSecret(mockDb, COMPANY_ID, "anthropic_api");

    expect(result.source).toBe("env");
    expect(result.apiKey).toBe("sk-ant-env-key");
    expect(result.keyLastFour).toBeNull();
  });

  it("returns none when both DB row and env are absent", async () => {
    const { resolveProviderSecret } = await import("../services/provider-secret-resolver.js");
    mockLimit.mockResolvedValue([]);
    setEnv("ADAPTER_ANTHROPIC_API_KEY", undefined);

    const result = await resolveProviderSecret(mockDb, COMPANY_ID, "anthropic_api");

    expect(result.source).toBe("none");
    expect(result.apiKey).toBeNull();
  });

  it("skips disabled rows and falls through to env", async () => {
    const { resolveProviderSecret } = await import("../services/provider-secret-resolver.js");
    // The resolver queries with isNull(disabledAt) so disabled rows are excluded
    // by the DB query itself. Mock returns empty to simulate that filter.
    mockLimit.mockResolvedValue([]);
    setEnv("ADAPTER_ANTHROPIC_API_KEY", "sk-ant-fallback");

    const result = await resolveProviderSecret(mockDb, COMPANY_ID, "anthropic_api");

    expect(result.source).toBe("env");
    expect(result.apiKey).toBe("sk-ant-fallback");
  });
});
