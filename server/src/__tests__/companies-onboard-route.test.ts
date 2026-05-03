/**
 * Integration tests for POST /api/companies/onboard.
 *
 * The onboard route is the wizard's terminal Launch action: it must be
 * atomic from the user's perspective. Either every dependent row commits,
 * or the company is wiped and the client sees no partial state.
 *
 * Two scenarios:
 *   1. Happy path: full wizard payload commits a company, agents, project,
 *      and primary issue.
 *   2. Rollback: a forced mid-flight failure leaves zero rows behind.
 */

import { randomUUID } from "node:crypto";
import { agents, companies, companySecrets, createDb, goals, issues, projects } from "@ironworksai/db";
import { eq, sql } from "drizzle-orm";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/error-handler.js";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";

// We force a rollback by patching a service to throw on the project insert.
// Hoisted so vi.mock can read it.
const failureToggle = vi.hoisted(() => ({ shouldFailProjectCreate: false }));

vi.mock("../services/index.js", async () => {
  const actual = await vi.importActual<typeof import("../services/index.js")>("../services/index.js");
  return {
    ...actual,
    projectService: (db: Parameters<typeof actual.projectService>[0]) => {
      const real = actual.projectService(db);
      return {
        ...real,
        create: async (...args: Parameters<typeof real.create>) => {
          if (failureToggle.shouldFailProjectCreate) {
            throw new Error("Forced project create failure for rollback test");
          }
          return real.create(...args);
        },
      };
    },
  };
});

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres onboard route tests: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("POST /api/companies/onboard", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("ironworks-onboard-route-");
    db = createDb(tempDb.connectionString);
  }, 30_000);

  afterEach(async () => {
    failureToggle.shouldFailProjectCreate = false;
    // Per-test reset: TRUNCATE every public table with CASCADE so we don't
    // have to maintain an FK-ordered delete list as the schema evolves.
    await db.execute(sql`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '_drizzle%') LOOP
          EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
        END LOOP;
      END $$;
    `);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function createApp() {
    const { companyRoutes } = await import("../routes/companies.js");
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      // local_implicit + isInstanceAdmin satisfies the assertBoard +
      // instance-admin gates the route requires.
      // biome-ignore lint/suspicious/noExplicitAny: actor is attached by upstream auth middleware in production
      (req as any).actor = {
        type: "board",
        userId: "test-admin",
        companyIds: [],
        isInstanceAdmin: true,
        source: "local_implicit",
      };
      next();
    });
    app.use("/api/companies", companyRoutes(db));
    app.use(errorHandler);
    return app;
  }

  function basePayload(overrides: Record<string, unknown> = {}) {
    return {
      companyName: `Acme ${randomUUID().slice(0, 6)}`,
      companyGoal: "Ship faster\nWithin 90 days",
      llmProvider: "openrouter",
      llmAuthMode: "subscription",
      llmApiKey: "",
      llmSecretName: "OPENROUTER_API_KEY",
      step2Mode: "manual",
      rosterItems: [],
      agentName: "Founder CEO",
      adapterType: "openrouter_api",
      adapterConfig: {},
      primaryTask: { title: "Welcome", description: "First task" },
      extraTasks: [],
      ...overrides,
    };
  }

  it("creates company + goal + agent + project + issue atomically on success", async () => {
    const app = await createApp();
    const res = await request(app).post("/api/companies/onboard").send(basePayload());

    expect(res.status).toBe(201);
    expect(res.body.companyId).toBeTruthy();
    expect(res.body.companyPrefix).toBeTruthy();
    expect(res.body.companyGoalId).toBeTruthy();
    expect(res.body.primaryAgentId).toBeTruthy();
    expect(res.body.projectId).toBeTruthy();
    expect(res.body.primaryIssueRef).toBeTruthy();

    const companyId = res.body.companyId as string;

    const companyRows = await db.select().from(companies).where(eq(companies.id, companyId));
    expect(companyRows).toHaveLength(1);
    const goalRows = await db.select().from(goals).where(eq(goals.companyId, companyId));
    expect(goalRows).toHaveLength(1);
    expect(goalRows[0]!.title).toBe("Ship faster");
    expect(goalRows[0]!.description).toBe("Within 90 days");
    const agentRows = await db.select().from(agents).where(eq(agents.companyId, companyId));
    expect(agentRows).toHaveLength(1);
    expect(agentRows[0]!.role).toBe("ceo");
    const projectRows = await db.select().from(projects).where(eq(projects.companyId, companyId));
    expect(projectRows).toHaveLength(1);
    const issueRows = await db.select().from(issues).where(eq(issues.companyId, companyId));
    expect(issueRows).toHaveLength(1);
    expect(issueRows[0]!.title).toBe("Welcome");
  });

  it("rolls back the entire company when a mid-flight insert fails", async () => {
    const app = await createApp();
    failureToggle.shouldFailProjectCreate = true;

    const res = await request(app).post("/api/companies/onboard").send(basePayload());

    expect(res.status).toBeGreaterThanOrEqual(500);

    const companyRows = await db.select().from(companies);
    expect(companyRows).toHaveLength(0);
    const goalRows = await db.select().from(goals);
    expect(goalRows).toHaveLength(0);
    const agentRows = await db.select().from(agents);
    expect(agentRows).toHaveLength(0);
    const projectRows = await db.select().from(projects);
    expect(projectRows).toHaveLength(0);
    const issueRows = await db.select().from(issues);
    expect(issueRows).toHaveLength(0);
  });

  it("does not persist a secret when llmApiKey is empty in api_key mode", async () => {
    const app = await createApp();
    const res = await request(app)
      .post("/api/companies/onboard")
      .send(basePayload({ llmAuthMode: "api_key", llmApiKey: "" }));

    expect(res.status).toBe(201);
    const secretRows = await db.select().from(companySecrets);
    expect(secretRows).toHaveLength(0);
  });
});
