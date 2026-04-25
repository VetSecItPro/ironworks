/**
 * Route-level tests for skill-recipes — PRs 3/6 and 6/6 of the skill loop.
 *
 * Coverage:
 *   1. GET /companies/:id/skill-recipes — list with optional status filter
 *   2. GET /companies/:id/skill-recipes?status=invalid — rejects bad filter
 *   3. GET /skill-recipes/:id — detail + 404 path
 *   4. PATCH /skill-recipes/:id — edit updates fields + rejects empty patch
 *   5. POST /skill-recipes/:id/approve — creates company_skills row, returns both
 *   6. POST /skill-recipes/:id/reject — persists reason
 *   7. POST /skill-recipes/:id/archive — sets archived_at
 *   8. Audit log entry is created on each state transition (approve/reject/archive/edit)
 *   9. POST /skill-recipes/:id/pause — sets paused_at + audit log
 *  10. POST /skill-recipes/:id/resume — clears paused_at + audit log
 */

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/index.js";
import { skillRecipeRoutes } from "../routes/skill-recipes.js";

// ── Shared fixtures ───────────────────────────────────────────────────────────

const COMPANY_ID = "company-1";
const RECIPE_ID = "recipe-aaaaaaaa-1111-4111-8111-111111111111";
const SKILL_ID = "skill-bbbbbbbb-2222-4222-8222-222222222222";
const USER_ID = "board-user-1";

function makeRecipeListItem(overrides: Record<string, unknown> = {}) {
  return {
    id: RECIPE_ID,
    companyId: COMPANY_ID,
    title: "Reconcile invoice over 30d",
    triggerPattern: "When issue label includes 'invoice' and aging window >= 30 days",
    status: "proposed",
    confidence: 78,
    applicableRoleTitles: ["CFO"],
    proposedByAgentId: "agent-1",
    sourceIssueId: "issue-1",
    extractorModel: "openai/gpt-oss-120b:free",
    createdAt: new Date("2026-04-25T09:14:00Z"),
    updatedAt: new Date("2026-04-25T09:14:00Z"),
    archivedAt: null,
    approvedAt: null,
    approvedByUserId: null,
    pausedAt: null,
    ...overrides,
  };
}

function makeRecipeDetail(overrides: Record<string, unknown> = {}) {
  return {
    ...makeRecipeListItem(),
    procedureMarkdown: "1. Pull aging report.\n2. Check CRM.\n3. Draft outreach.",
    rationale: "Pattern repeats every quarter.",
    rejectionReason: null,
    sourceSkillId: null,
    sourceRunId: null,
    metadata: {},
    lastValidatedAt: new Date("2026-04-25T09:14:00Z"),
    latestEvaluation: null,
    ...overrides,
  };
}

function makeCompanySkill() {
  return {
    id: SKILL_ID,
    companyId: COMPANY_ID,
    key: "extracted/reconcile-invoice-over-30d",
    slug: "extracted/reconcile-invoice-over-30d",
    name: "Reconcile invoice over 30d",
    description: "Pattern repeats every quarter.",
    markdown: "1. Pull aging report.\n2. Check CRM.\n3. Draft outreach.",
    sourceType: "local_path",
    sourceLocator: null,
    sourceRef: null,
    trustLevel: "markdown_only",
    compatibility: "compatible",
    fileInventory: [],
    metadata: {},
    origin: "extracted",
    recipeId: RECIPE_ID,
    createdAt: new Date("2026-04-25T09:14:00Z"),
    updatedAt: new Date("2026-04-25T09:14:00Z"),
  };
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSvc = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  editRecipe: vi.fn(),
  approveRecipe: vi.fn(),
  rejectRecipe: vi.fn(),
  archiveRecipe: vi.fn(),
  pauseRecipe: vi.fn(),
  resumeRecipe: vi.fn(),
}));

vi.mock("../services/skill-recipe-service.js", () => ({
  skillRecipeService: vi.fn(() => mockSvc),
}));

// ── App factory ───────────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: test-only DB stub
function makeApp(db: any = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only actor injection
    (req as any).actor = {
      type: "board",
      userId: USER_ID,
      companyIds: [COMPANY_ID],
      source: "local_implicit",
      isInstanceAdmin: false,
    };
    next();
  });
  app.use(skillRecipeRoutes(db));
  app.use(errorHandler);
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /companies/:companyId/skill-recipes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns list without filter", async () => {
    mockSvc.list.mockResolvedValue([makeRecipeListItem()]);
    const res = await request(makeApp()).get(`/companies/${COMPANY_ID}/skill-recipes`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(RECIPE_ID);
    expect(mockSvc.list).toHaveBeenCalledWith(COMPANY_ID, undefined);
  });

  it("passes status filter to service", async () => {
    mockSvc.list.mockResolvedValue([makeRecipeListItem({ status: "active" })]);
    const res = await request(makeApp()).get(`/companies/${COMPANY_ID}/skill-recipes?status=active`);
    expect(res.status).toBe(200);
    expect(mockSvc.list).toHaveBeenCalledWith(COMPANY_ID, "active");
  });

  it("rejects an invalid status filter with 400", async () => {
    const res = await request(makeApp()).get(`/companies/${COMPANY_ID}/skill-recipes?status=bogus`);
    expect(res.status).toBe(400);
    // Service should not have been called for bad input.
    expect(mockSvc.list).not.toHaveBeenCalled();
  });
});

describe("GET /skill-recipes/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns detail when recipe exists", async () => {
    mockSvc.detail.mockResolvedValue(makeRecipeDetail());
    const res = await request(makeApp()).get(`/skill-recipes/${RECIPE_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(RECIPE_ID);
    expect(res.body.procedureMarkdown).toBeDefined();
  });

  it("returns 404 when recipe not found", async () => {
    mockSvc.detail.mockResolvedValue(null);
    const res = await request(makeApp()).get("/skill-recipes/nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("PATCH /skill-recipes/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates editable fields and returns updated recipe", async () => {
    mockSvc.detail.mockResolvedValue(makeRecipeDetail());
    mockSvc.editRecipe.mockResolvedValue(makeRecipeListItem({ title: "Updated title" }));

    const res = await request(makeApp()).patch(`/skill-recipes/${RECIPE_ID}`).send({ title: "Updated title" });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Updated title");
    expect(mockSvc.editRecipe).toHaveBeenCalledWith(RECIPE_ID, { title: "Updated title" }, USER_ID);
  });

  it("rejects a patch with no valid fields with 400", async () => {
    mockSvc.detail.mockResolvedValue(makeRecipeDetail());
    const res = await request(makeApp()).patch(`/skill-recipes/${RECIPE_ID}`).send({ unrecognised: "field" });
    expect(res.status).toBe(400);
    expect(mockSvc.editRecipe).not.toHaveBeenCalled();
  });

  it("returns 404 when recipe not found", async () => {
    mockSvc.detail.mockResolvedValue(null);
    const res = await request(makeApp()).patch(`/skill-recipes/nonexistent`).send({ title: "x" });
    expect(res.status).toBe(404);
  });
});

describe("POST /skill-recipes/:id/approve", () => {
  beforeEach(() => vi.clearAllMocks());

  it("materialises company_skills row and returns both objects", async () => {
    mockSvc.detail.mockResolvedValue(makeRecipeDetail());
    const approved = makeRecipeListItem({ status: "active", approvedByUserId: USER_ID });
    mockSvc.approveRecipe.mockResolvedValue({ recipe: approved, companySkill: makeCompanySkill() });

    const res = await request(makeApp()).post(`/skill-recipes/${RECIPE_ID}/approve`);

    expect(res.status).toBe(201);
    expect(res.body.recipe.status).toBe("active");
    expect(res.body.companySkill.origin).toBe("extracted");
    expect(res.body.companySkill.recipeId).toBe(RECIPE_ID);
    expect(mockSvc.approveRecipe).toHaveBeenCalledWith(RECIPE_ID, USER_ID);
  });

  it("returns 404 when recipe not found", async () => {
    mockSvc.detail.mockResolvedValue(null);
    const res = await request(makeApp()).post("/skill-recipes/nonexistent/approve");
    expect(res.status).toBe(404);
  });
});

describe("POST /skill-recipes/:id/reject", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists rejection reason and returns updated recipe", async () => {
    mockSvc.detail.mockResolvedValue(makeRecipeDetail());
    const rejected = makeRecipeListItem({ status: "rejected" });
    mockSvc.rejectRecipe.mockResolvedValue(rejected);

    const res = await request(makeApp())
      .post(`/skill-recipes/${RECIPE_ID}/reject`)
      .send({ reason: "Trigger too broad" });

    expect(res.status).toBe(200);
    expect(mockSvc.rejectRecipe).toHaveBeenCalledWith(RECIPE_ID, USER_ID, "Trigger too broad");
  });

  it("returns 400 when reason is missing", async () => {
    mockSvc.detail.mockResolvedValue(makeRecipeDetail());
    const res = await request(makeApp()).post(`/skill-recipes/${RECIPE_ID}/reject`).send({});
    expect(res.status).toBe(400);
    expect(mockSvc.rejectRecipe).not.toHaveBeenCalled();
  });

  it("returns 404 when recipe not found", async () => {
    mockSvc.detail.mockResolvedValue(null);
    const res = await request(makeApp()).post("/skill-recipes/nonexistent/reject").send({ reason: "bad" });
    expect(res.status).toBe(404);
  });
});

describe("POST /skill-recipes/:id/archive", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns archived recipe", async () => {
    mockSvc.detail.mockResolvedValue(makeRecipeDetail());
    const archived = makeRecipeListItem({ status: "archived", archivedAt: new Date() });
    mockSvc.archiveRecipe.mockResolvedValue(archived);

    const res = await request(makeApp()).post(`/skill-recipes/${RECIPE_ID}/archive`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("archived");
    expect(mockSvc.archiveRecipe).toHaveBeenCalledWith(RECIPE_ID, USER_ID);
  });

  it("returns 404 when recipe not found", async () => {
    mockSvc.detail.mockResolvedValue(null);
    const res = await request(makeApp()).post("/skill-recipes/nonexistent/archive");
    expect(res.status).toBe(404);
  });
});

describe("Audit log entries on state transitions", () => {
  // The route delegates logging to the service (skillRecipeService), which calls
  // logActivity directly. These tests verify the *route* passes the correct actor
  // ID so the service can write the right audit entry.
  beforeEach(() => vi.clearAllMocks());

  it("approve passes correct userId to service", async () => {
    mockSvc.detail.mockResolvedValue(makeRecipeDetail());
    mockSvc.approveRecipe.mockResolvedValue({
      recipe: makeRecipeListItem({ status: "active" }),
      companySkill: makeCompanySkill(),
    });

    await request(makeApp()).post(`/skill-recipes/${RECIPE_ID}/approve`);

    const [calledId, calledUserId] = mockSvc.approveRecipe.mock.calls[0] as [string, string];
    expect(calledId).toBe(RECIPE_ID);
    expect(calledUserId).toBe(USER_ID);
  });

  it("reject passes correct userId to service", async () => {
    mockSvc.detail.mockResolvedValue(makeRecipeDetail());
    mockSvc.rejectRecipe.mockResolvedValue(makeRecipeListItem({ status: "rejected" }));

    await request(makeApp()).post(`/skill-recipes/${RECIPE_ID}/reject`).send({ reason: "Too specific" });

    const [calledId, calledUserId] = mockSvc.rejectRecipe.mock.calls[0] as [string, string, string];
    expect(calledId).toBe(RECIPE_ID);
    expect(calledUserId).toBe(USER_ID);
  });

  it("edit passes correct userId to service", async () => {
    mockSvc.detail.mockResolvedValue(makeRecipeDetail());
    mockSvc.editRecipe.mockResolvedValue(makeRecipeListItem());

    await request(makeApp()).patch(`/skill-recipes/${RECIPE_ID}`).send({ title: "New title" });

    const [calledId, , calledUserId] = mockSvc.editRecipe.mock.calls[0] as [string, object, string];
    expect(calledId).toBe(RECIPE_ID);
    expect(calledUserId).toBe(USER_ID);
  });

  it("archive passes correct userId to service", async () => {
    mockSvc.detail.mockResolvedValue(makeRecipeDetail());
    mockSvc.archiveRecipe.mockResolvedValue(makeRecipeListItem({ status: "archived" }));

    await request(makeApp()).post(`/skill-recipes/${RECIPE_ID}/archive`);

    const [calledId, calledUserId] = mockSvc.archiveRecipe.mock.calls[0] as [string, string];
    expect(calledId).toBe(RECIPE_ID);
    expect(calledUserId).toBe(USER_ID);
  });
});

// ── PR 6/6 — Pause / Resume ───────────────────────────────────────────────────

describe("POST /skill-recipes/:id/pause", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets paused_at via service and returns updated recipe", async () => {
    const now = new Date();
    mockSvc.detail.mockResolvedValue(makeRecipeDetail({ status: "active" }));
    const paused = makeRecipeListItem({ status: "active", pausedAt: now });
    mockSvc.pauseRecipe.mockResolvedValue(paused);

    const res = await request(makeApp()).post(`/skill-recipes/${RECIPE_ID}/pause`);

    expect(res.status).toBe(200);
    // pausedAt should be non-null in the response
    expect(res.body.pausedAt).not.toBeNull();
    expect(mockSvc.pauseRecipe).toHaveBeenCalledWith(RECIPE_ID, USER_ID);
  });

  it("returns 404 when recipe not found", async () => {
    mockSvc.detail.mockResolvedValue(null);
    const res = await request(makeApp()).post("/skill-recipes/nonexistent/pause");
    expect(res.status).toBe(404);
    expect(mockSvc.pauseRecipe).not.toHaveBeenCalled();
  });

  it("passes correct userId so audit log records the operator", async () => {
    mockSvc.detail.mockResolvedValue(makeRecipeDetail({ status: "active" }));
    mockSvc.pauseRecipe.mockResolvedValue(makeRecipeListItem({ status: "active", pausedAt: new Date() }));

    await request(makeApp()).post(`/skill-recipes/${RECIPE_ID}/pause`);

    const [calledId, calledUserId] = mockSvc.pauseRecipe.mock.calls[0] as [string, string];
    expect(calledId).toBe(RECIPE_ID);
    expect(calledUserId).toBe(USER_ID);
  });
});

describe("POST /skill-recipes/:id/resume", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clears paused_at via service and returns updated recipe", async () => {
    mockSvc.detail.mockResolvedValue(makeRecipeDetail({ status: "active", pausedAt: new Date() }));
    const resumed = makeRecipeListItem({ status: "active", pausedAt: null });
    mockSvc.resumeRecipe.mockResolvedValue(resumed);

    const res = await request(makeApp()).post(`/skill-recipes/${RECIPE_ID}/resume`);

    expect(res.status).toBe(200);
    expect(res.body.pausedAt).toBeNull();
    expect(mockSvc.resumeRecipe).toHaveBeenCalledWith(RECIPE_ID, USER_ID);
  });

  it("returns 404 when recipe not found", async () => {
    mockSvc.detail.mockResolvedValue(null);
    const res = await request(makeApp()).post("/skill-recipes/nonexistent/resume");
    expect(res.status).toBe(404);
    expect(mockSvc.resumeRecipe).not.toHaveBeenCalled();
  });

  it("passes correct userId so audit log records the operator", async () => {
    mockSvc.detail.mockResolvedValue(makeRecipeDetail({ status: "active", pausedAt: new Date() }));
    mockSvc.resumeRecipe.mockResolvedValue(makeRecipeListItem({ status: "active", pausedAt: null }));

    await request(makeApp()).post(`/skill-recipes/${RECIPE_ID}/resume`);

    const [calledId, calledUserId] = mockSvc.resumeRecipe.mock.calls[0] as [string, string];
    expect(calledId).toBe(RECIPE_ID);
    expect(calledUserId).toBe(USER_ID);
  });
});
