/**
 * Route-level tests for agent YAML export/import (Phase O.3).
 *
 * Tests:
 *  - Owner can export; operator/viewer get 403
 *  - Export returns text/yaml content-type
 *  - Export does not include API key values
 *  - Import with valid YAML creates agents and returns imported list
 *  - Import with broken reports_to references returns 422
 *  - Import with malformed YAML returns 422
 *  - Import requires owner; non-owner gets 403
 */

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Service mocks (hoisted before route import) ───────────────────────────────

const mockAgentInstructionsService = vi.hoisted(() => ({
  exportFiles: vi.fn(),
  materializeManagedBundle: vi.fn(),
}));

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  getMembership: vi.fn(),
  isInstanceAdmin: vi.fn(),
}));

const mockCompanySkillService = vi.hoisted(() => ({
  listRuntimeSkillEntries: vi.fn(),
}));

vi.mock("../services/index.js", async () => {
  const { makeFullServicesMock } = await import("./helpers/mock-services.js");
  return makeFullServicesMock({
    agentInstructionsService: () => mockAgentInstructionsService,
    agentService: () => mockAgentService,
    accessService: () => mockAccessService,
    companySkillService: () => mockCompanySkillService,
  });
});

// ── Static imports (after mock registration) ──────────────────────────────────

import { errorHandler } from "../middleware/index.js";
import { agentYamlRoutes } from "../routes/agent-yaml-io.js";

// ── Test constants ────────────────────────────────────────────────────────────

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const AGENT_ID = "33333333-3333-4333-8333-333333333333";

const FAKE_AGENT_ROW = {
  id: AGENT_ID,
  companyId: COMPANY_ID,
  name: "Director of Operations",
  role: "director",
  title: "COO",
  status: "idle",
  adapterType: "anthropic-api",
  adapterConfig: {
    model: "claude-opus-4-6",
    ironworksSkillSync: { desiredSkills: ["skill-alpha"] },
  },
  runtimeConfig: {},
  reportsTo: null,
  permissions: {},
  icon: null,
  capabilities: null,
  budgetMonthlyCents: 0,
  spentMonthlyCents: 0,
  department: null,
  employmentType: "full_time",
  hiredAt: new Date(),
  hiredByUserId: null,
  hiredByAgentId: null,
  contractEndAt: null,
  contractEndCondition: null,
  contractProjectId: null,
  contractBudgetCents: null,
  contractSpentCents: 0,
  pauseReason: null,
  pausedAt: null,
  lastHeartbeatAt: null,
  metadata: null,
  onboardingContextIds: [],
  performanceScore: null,
  systemPrompt: null,
  agentInstructions: null,
  terminatedAt: null,
  terminationReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── Mock builders ─────────────────────────────────────────────────────────────

/**
 * Build a thenable Drizzle-style select chain mock.
 *
 * Drizzle query builders implement `.then(onFulfilled, onRejected)` so that
 * `await db.select()...` works. The mock must also implement this interface
 * to correctly invoke the route's callback (e.g. `.then(rows => rows[0])`).
 */
function makeSelectChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  // biome-ignore lint/suspicious/noThenProperty: test-only Drizzle query builder thenable mock
  chain.then = vi
    .fn()
    .mockImplementation((onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
    );
  return chain;
}

function makeInsertChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  chain.values = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockReturnValue(chain);
  // biome-ignore lint/suspicious/noThenProperty: test-only Drizzle query builder thenable mock
  chain.then = vi
    .fn()
    .mockImplementation((onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
    );
  return chain;
}

function makeUpdateChain() {
  const chain: Record<string, unknown> = {};
  chain.set = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  return chain;
}

/** Build an Express app with the agent YAML routes mounted. */
function buildApp(actor: Record<string, unknown>, fakeDb: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: test actor injection via request property
    (req as any).actor = actor;
    next();
  });
  // biome-ignore lint/suspicious/noExplicitAny: mock DB instance in tests
  app.use("/api/companies/:companyId/agents", agentYamlRoutes(fakeDb as any));
  app.use(errorHandler);
  return app;
}

// ── Shared actors ─────────────────────────────────────────────────────────────

const OWNER_ACTOR = {
  type: "board",
  userId: USER_ID,
  companyIds: [COMPANY_ID],
  isInstanceAdmin: false,
  source: "session",
};

const NON_OWNER_ACTOR = {
  type: "board",
  userId: USER_ID,
  companyIds: [COMPANY_ID],
  isInstanceAdmin: false,
  source: "session",
};

const INSTANCE_ADMIN_ACTOR = {
  type: "board",
  userId: USER_ID,
  companyIds: [COMPANY_ID],
  isInstanceAdmin: true,
  source: "session",
};

const VALID_IMPORT_YAML = [
  "version: 1",
  "exported_at: 2026-04-20T00:00:00Z",
  "agents:",
  "  - id_hint: test-agent",
  '    name: "Test Agent"',
  "    role: general",
  '    soul: "# Test Agent\\n\\nYou help."',
  "    adapter:",
  "      type: anthropic-api",
  "      model: claude-sonnet-4-6",
  "    skills: []",
  "    reports_to: null",
].join("\n");

// ── Export tests ──────────────────────────────────────────────────────────────

describe("agent YAML export route (POST /api/companies/:id/agents/export)", () => {
  beforeEach(() => {
    mockAgentInstructionsService.exportFiles.mockReset();
    mockAgentInstructionsService.exportFiles.mockResolvedValue({
      files: { "AGENTS.md": "# Director of Operations\n\nYou are the COO." },
      entryFile: "AGENTS.md",
      warnings: [],
    });
  });

  it("returns 200 YAML for company owner", async () => {
    const fakeDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(makeSelectChain([{ membershipRole: "owner" }]))
        .mockReturnValueOnce(makeSelectChain([FAKE_AGENT_ROW])),
    };

    const res = await request(buildApp(OWNER_ACTOR, fakeDb))
      .post(`/api/companies/${COMPANY_ID}/agents/export`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/yaml/);
    expect(res.text).toContain("version: 1");
    expect(res.text).toContain("agents:");
    expect(res.text).toContain("Director of Operations");
  });

  it("returns 403 for operator (non-owner board user)", async () => {
    const fakeDb = {
      select: vi.fn().mockReturnValue(makeSelectChain([{ membershipRole: "operator" }])),
    };

    const res = await request(buildApp(NON_OWNER_ACTOR, fakeDb))
      .post(`/api/companies/${COMPANY_ID}/agents/export`)
      .send({});

    expect(res.status).toBe(403);
    expect(mockAgentInstructionsService.exportFiles).not.toHaveBeenCalled();
  });

  it("returns 403 for viewer", async () => {
    const fakeDb = {
      select: vi.fn().mockReturnValue(makeSelectChain([{ membershipRole: "viewer" }])),
    };

    const res = await request(buildApp(OWNER_ACTOR, fakeDb))
      .post(`/api/companies/${COMPANY_ID}/agents/export`)
      .send({});

    expect(res.status).toBe(403);
  });

  it("allows instance admin to export without owner membership", async () => {
    // Instance admin: skips membership check, goes directly to agents query
    const fakeDb = {
      select: vi.fn().mockReturnValue(makeSelectChain([FAKE_AGENT_ROW])),
    };

    const res = await request(buildApp(INSTANCE_ADMIN_ACTOR, fakeDb))
      .post(`/api/companies/${COMPANY_ID}/agents/export`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.text).toContain("version: 1");
  });

  it("does NOT include API key values in exported YAML", async () => {
    const agentWithSecret = {
      ...FAKE_AGENT_ROW,
      adapterConfig: {
        model: "claude-opus-4-6",
        apiKey: "sk-ant-super-secret-key",
        ironworksSkillSync: { desiredSkills: [] },
      },
    };

    const fakeDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(makeSelectChain([{ membershipRole: "owner" }]))
        .mockReturnValueOnce(makeSelectChain([agentWithSecret])),
    };

    const res = await request(buildApp(OWNER_ACTOR, fakeDb))
      .post(`/api/companies/${COMPANY_ID}/agents/export`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.text).not.toContain("sk-ant-super-secret-key");
    expect(res.text).not.toContain("apiKey");
  });

  it("returns 404 when no agents match the requested IDs", async () => {
    const fakeDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(makeSelectChain([{ membershipRole: "owner" }]))
        .mockReturnValueOnce(makeSelectChain([])),
    };

    const res = await request(buildApp(OWNER_ACTOR, fakeDb))
      .post(`/api/companies/${COMPANY_ID}/agents/export`)
      .send({ agent_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"] });

    expect(res.status).toBe(404);
  });
});

// ── Import tests ──────────────────────────────────────────────────────────────

describe("agent YAML import route (POST /api/companies/:id/agents/import)", () => {
  beforeEach(() => {
    mockAgentInstructionsService.materializeManagedBundle.mockReset();
    mockAgentInstructionsService.materializeManagedBundle.mockResolvedValue({
      bundle: {},
      adapterConfig: {},
    });
  });

  it("returns 403 for non-owner board user", async () => {
    const fakeDb = {
      select: vi.fn().mockReturnValue(makeSelectChain([{ membershipRole: "operator" }])),
    };

    const res = await request(buildApp(NON_OWNER_ACTOR, fakeDb))
      .post(`/api/companies/${COMPANY_ID}/agents/import`)
      .send({ yaml: VALID_IMPORT_YAML, mode: "create" });

    expect(res.status).toBe(403);
  });

  it("returns 422 for malformed YAML that does not pass Zod validation", async () => {
    const fakeDb = {
      select: vi.fn().mockReturnValue(makeSelectChain([{ membershipRole: "owner" }])),
    };

    const res = await request(buildApp(OWNER_ACTOR, fakeDb))
      .post(`/api/companies/${COMPANY_ID}/agents/import`)
      .send({ yaml: "totally-not-a-valid-agent-document: yes", mode: "create" });

    expect(res.status).toBe(422);
  });

  it("returns 422 for YAML with broken reports_to reference", async () => {
    const brokenYaml = [
      "version: 1",
      "exported_at: 2026-04-20T00:00:00Z",
      "agents:",
      "  - id_hint: lonely-agent",
      '    name: "Lonely Agent"',
      "    role: general",
      '    soul: "# Lonely\\n\\nHi."',
      "    adapter:",
      "      type: anthropic-api",
      "      model: claude-sonnet-4-6",
      "    skills: []",
      "    reports_to: ghost-manager-that-does-not-exist",
    ].join("\n");

    const fakeDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(makeSelectChain([{ membershipRole: "owner" }]))
        .mockReturnValueOnce(makeSelectChain([])),
    };

    const res = await request(buildApp(OWNER_ACTOR, fakeDb))
      .post(`/api/companies/${COMPANY_ID}/agents/import`)
      .send({ yaml: brokenYaml, mode: "create" });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/reports_to/i);
  });

  it("creates agents and returns imported list for owner with valid YAML", async () => {
    const createdAgent = {
      ...FAKE_AGENT_ROW,
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      name: "Test Agent",
    };

    const fakeDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(makeSelectChain([{ membershipRole: "owner" }]))
        .mockReturnValueOnce(makeSelectChain([])),
      insert: vi.fn().mockReturnValue(makeInsertChain([createdAgent])),
      update: vi.fn().mockReturnValue(makeUpdateChain()),
    };

    const res = await request(buildApp(OWNER_ACTOR, fakeDb))
      .post(`/api/companies/${COMPANY_ID}/agents/import`)
      .send({ yaml: VALID_IMPORT_YAML, mode: "create" });

    expect(res.status).toBe(200);
    expect(res.body.imported).toHaveLength(1);
    expect(res.body.imported[0]).toMatchObject({
      id_hint: "test-agent",
      action: "created",
    });
    expect(res.body.errors).toEqual([]);
    expect(mockAgentInstructionsService.materializeManagedBundle).toHaveBeenCalledOnce();
  });
});
