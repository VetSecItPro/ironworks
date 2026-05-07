import { randomUUID } from "node:crypto";
import type { Db } from "@ironworksai/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkHourlyCircuitBreaker,
  filterCooledDownAgents,
  recordAgentResponse,
  selectRespondingAgents,
} from "./channel-router.js";

vi.mock("../middleware/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ── Mock helpers ────────────────────────────────────────────────────────────

type StateRow = {
  id: string;
  channelId: string;
  companyId: string;
  agentResponseCount: number;
  windowStart: Date;
  lastHumanMessageAt: Date | null;
  lastAgentMessageAt: Date | null;
  hourlyAgentResponseCount: number;
  hourlyWindowStart: Date;
  agentLastRespondedAt: Record<string, string>;
  createdAt: Date;
};

type IdleAgent = { id: string; name: string; role: string; department: string };

interface MockDbState {
  state: StateRow | null;
  idleAgents: IdleAgent[];
  inserts: Array<{ table: string; values: Record<string, unknown> }>;
  updates: Array<{ table: string; set: Record<string, unknown>; whereChannelId: string | null }>;
}

/**
 * Hand-rolled drizzle mock that distinguishes the two distinct selects in the
 * router: state row (no column projection) vs idle agents (column projection).
 * Drizzle's `db.select()` with no args returns all columns; with an object arg
 * returns just those columns. We branch on that to return the right rows.
 */
function makeRouterDb(state: MockDbState): Db {
  const db = {
    select: vi.fn((cols?: unknown) => {
      const isStateQuery = cols === undefined;
      const rows = isStateQuery ? (state.state ? [state.state] : []) : state.idleAgents;
      const fromChain = {
        from: vi.fn(() => ({
          where: vi.fn(() => {
            // Thenable contract: `await db.select().from().where()` resolves to rows.
            // biome-ignore lint/suspicious/noThenProperty: drizzle thenable test contract
            return { then: (resolve: (v: unknown[]) => unknown) => resolve(rows) };
          }),
        })),
      };
      return fromChain;
    }),
    insert: vi.fn((_table: unknown) => ({
      values: vi.fn((values: Record<string, unknown>) => {
        state.inserts.push({ table: "channel_response_state", values });
        // Persist into in-memory state for follow-up reads in the same test.
        state.state = {
          id: randomUUID(),
          channelId: String(values.channelId ?? ""),
          companyId: String(values.companyId ?? ""),
          agentResponseCount: (values.agentResponseCount as number) ?? 0,
          windowStart: (values.windowStart as Date) ?? new Date(),
          lastHumanMessageAt: (values.lastHumanMessageAt as Date | null) ?? null,
          lastAgentMessageAt: (values.lastAgentMessageAt as Date | null) ?? null,
          hourlyAgentResponseCount: (values.hourlyAgentResponseCount as number) ?? 0,
          hourlyWindowStart: (values.hourlyWindowStart as Date) ?? new Date(),
          agentLastRespondedAt: (values.agentLastRespondedAt as Record<string, string>) ?? {},
          createdAt: new Date(),
        };
        return Promise.resolve();
      }),
    })),
    update: vi.fn((_table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(() => {
          state.updates.push({ table: "channel_response_state", set: values, whereChannelId: null });
          if (state.state) {
            state.state = { ...state.state, ...(values as Partial<StateRow>) };
          }
          return Promise.resolve();
        }),
      })),
    })),
    // biome-ignore lint/suspicious/noExplicitAny: test mock of Db type erases full Drizzle interface
  } as any;
  return db as Db;
}

function makeStateRow(overrides: Partial<StateRow> = {}): StateRow {
  const now = new Date();
  return {
    id: randomUUID(),
    channelId: randomUUID(),
    companyId: randomUUID(),
    agentResponseCount: 0,
    windowStart: now,
    lastHumanMessageAt: null,
    lastAgentMessageAt: null,
    hourlyAgentResponseCount: 0,
    hourlyWindowStart: now,
    agentLastRespondedAt: {},
    createdAt: now,
    ...overrides,
  };
}

function makeAgent(overrides: Partial<IdleAgent> = {}): IdleAgent {
  return {
    id: randomUUID(),
    name: "Marcus",
    role: "CEO",
    department: "leadership",
    ...overrides,
  };
}

// ── Pure helper unit tests ──────────────────────────────────────────────────

describe("checkHourlyCircuitBreaker", () => {
  it("allows when state is null", () => {
    expect(checkHourlyCircuitBreaker(null)).toBe(true);
  });

  it("allows when window has expired (>60 min)", () => {
    const ancient = new Date(Date.now() - 61 * 60 * 1000);
    const state = makeStateRow({ hourlyAgentResponseCount: 999, hourlyWindowStart: ancient });
    expect(checkHourlyCircuitBreaker(state)).toBe(true);
  });

  it("allows when count is below the 20 limit", () => {
    const state = makeStateRow({ hourlyAgentResponseCount: 19 });
    expect(checkHourlyCircuitBreaker(state)).toBe(true);
  });

  it("blocks when count reaches 20 within the window", () => {
    const state = makeStateRow({ hourlyAgentResponseCount: 20 });
    expect(checkHourlyCircuitBreaker(state)).toBe(false);
  });
});

describe("filterCooledDownAgents", () => {
  it("filters out an agent whose last response was within 5 min", () => {
    const agentId = randomUUID();
    const fourMinAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();
    const state = makeStateRow({ agentLastRespondedAt: { [agentId]: fourMinAgo } });
    const agents = [makeAgent({ id: agentId, name: "Marcus" }), makeAgent({ name: "Diane" })];
    const result = filterCooledDownAgents(agents, state);
    expect(result.map((a) => a.name)).toEqual(["Diane"]);
  });

  it("allows the agent after 5+ min have elapsed", () => {
    const agentId = randomUUID();
    const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const state = makeStateRow({ agentLastRespondedAt: { [agentId]: sixMinAgo } });
    const agents = [makeAgent({ id: agentId, name: "Marcus" })];
    const result = filterCooledDownAgents(agents, state);
    expect(result).toHaveLength(1);
  });

  it("passes through unchanged when state is null", () => {
    const agents = [makeAgent({ name: "Marcus" })];
    expect(filterCooledDownAgents(agents, null)).toEqual(agents);
  });
});

// ── selectRespondingAgents integration tests ────────────────────────────────

describe("selectRespondingAgents — per-agent cooldown", () => {
  const channelId = randomUUID();
  const companyId = randomUUID();

  it("filters out an agent whose agent_last_responded_at is within 5 min", async () => {
    const marcus = makeAgent({ name: "Marcus", role: "CEO", department: "leadership" });
    const diane = makeAgent({ name: "Diane", role: "CFO", department: "leadership" });
    const fourMinAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();
    const db = makeRouterDb({
      state: makeStateRow({
        channelId,
        companyId,
        agentLastRespondedAt: { [marcus.id]: fourMinAgo },
      }),
      idleAgents: [marcus, diane],
      inserts: [],
      updates: [],
    });

    const result = await selectRespondingAgents(db, channelId, "leadership", companyId, "what about strategy?", null);
    expect(result.map((a) => a.agentName)).not.toContain("Marcus");
  });

  it("allows the same agent after 5+ min have elapsed", async () => {
    const marcus = makeAgent({ name: "Marcus", role: "CEO", department: "leadership" });
    const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const db = makeRouterDb({
      state: makeStateRow({
        channelId,
        companyId,
        agentLastRespondedAt: { [marcus.id]: sixMinAgo },
      }),
      idleAgents: [marcus],
      inserts: [],
      updates: [],
    });

    const result = await selectRespondingAgents(db, channelId, "leadership", companyId, "what about strategy?", null);
    expect(result.some((a) => a.agentId === marcus.id)).toBe(true);
  });

  it("applies cooldown filter even for @mentioned agents", async () => {
    const marcus = makeAgent({ name: "Marcus", role: "CEO", department: "leadership" });
    const fourMinAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();
    const db = makeRouterDb({
      state: makeStateRow({
        channelId,
        companyId,
        agentLastRespondedAt: { [marcus.id]: fourMinAgo },
      }),
      idleAgents: [marcus],
      inserts: [],
      updates: [],
    });

    const result = await selectRespondingAgents(db, channelId, "leadership", companyId, "@Marcus thoughts?", null);
    expect(result).toEqual([]);
  });
});

describe("selectRespondingAgents — hourly circuit breaker", () => {
  const channelId = randomUUID();
  const companyId = randomUUID();

  it("returns [] when hourly_agent_response_count >= 20 and window is fresh", async () => {
    const marcus = makeAgent({ name: "Marcus", role: "CEO", department: "leadership" });
    const db = makeRouterDb({
      state: makeStateRow({
        channelId,
        companyId,
        hourlyAgentResponseCount: 20,
        hourlyWindowStart: new Date(),
      }),
      idleAgents: [marcus],
      inserts: [],
      updates: [],
    });

    const result = await selectRespondingAgents(db, channelId, "leadership", companyId, "any thoughts?", null);
    expect(result).toEqual([]);
  });

  it("resumes when hourly_window_start is older than 60 min", async () => {
    const marcus = makeAgent({ name: "Marcus", role: "CEO", department: "leadership" });
    const ancient = new Date(Date.now() - 61 * 60 * 1000);
    const db = makeRouterDb({
      state: makeStateRow({
        channelId,
        companyId,
        hourlyAgentResponseCount: 999,
        hourlyWindowStart: ancient,
      }),
      idleAgents: [marcus],
      inserts: [],
      updates: [],
    });

    const result = await selectRespondingAgents(db, channelId, "leadership", companyId, "any thoughts?", null);
    expect(result.some((a) => a.agentId === marcus.id)).toBe(true);
  });

  it("applies circuit breaker even for @mentioned agents", async () => {
    const marcus = makeAgent({ name: "Marcus", role: "CEO", department: "leadership" });
    const db = makeRouterDb({
      state: makeStateRow({
        channelId,
        companyId,
        hourlyAgentResponseCount: 20,
        hourlyWindowStart: new Date(),
      }),
      idleAgents: [marcus],
      inserts: [],
      updates: [],
    });

    const result = await selectRespondingAgents(db, channelId, "leadership", companyId, "@Marcus thoughts?", null);
    expect(result).toEqual([]);
  });
});

// ── recordAgentResponse tests ───────────────────────────────────────────────

describe("recordAgentResponse", () => {
  const channelId = randomUUID();
  const companyId = randomUUID();
  let agentId: string;

  beforeEach(() => {
    agentId = randomUUID();
  });

  it("records agent_last_responded_at[agentId] = now (insert path)", async () => {
    const state: MockDbState = { state: null, idleAgents: [], inserts: [], updates: [] };
    const db = makeRouterDb(state);

    await recordAgentResponse(db, channelId, companyId, agentId);

    expect(state.inserts).toHaveLength(1);
    const map = state.inserts[0].values.agentLastRespondedAt as Record<string, string>;
    expect(map[agentId]).toBeDefined();
    expect(Date.now() - new Date(map[agentId]).getTime()).toBeLessThan(2000);
  });

  it("records agent_last_responded_at[agentId] = now (update path)", async () => {
    const existing = makeStateRow({
      channelId,
      companyId,
      hourlyAgentResponseCount: 5,
      agentLastRespondedAt: {},
    });
    const state: MockDbState = { state: existing, idleAgents: [], inserts: [], updates: [] };
    const db = makeRouterDb(state);

    await recordAgentResponse(db, channelId, companyId, agentId);

    expect(state.updates).toHaveLength(1);
    const map = state.updates[0].set.agentLastRespondedAt as Record<string, string>;
    expect(map[agentId]).toBeDefined();
  });

  it("increments hourly_agent_response_count", async () => {
    const existing = makeStateRow({
      channelId,
      companyId,
      hourlyAgentResponseCount: 7,
      hourlyWindowStart: new Date(Date.now() - 5 * 60 * 1000),
    });
    const state: MockDbState = { state: existing, idleAgents: [], inserts: [], updates: [] };
    const db = makeRouterDb(state);

    await recordAgentResponse(db, channelId, companyId, agentId);

    expect(state.updates[0].set.hourlyAgentResponseCount).toBe(8);
  });

  it("resets hourly_agent_response_count to 1 when window has expired", async () => {
    const ancient = new Date(Date.now() - 61 * 60 * 1000);
    const existing = makeStateRow({
      channelId,
      companyId,
      hourlyAgentResponseCount: 99,
      hourlyWindowStart: ancient,
    });
    const state: MockDbState = { state: existing, idleAgents: [], inserts: [], updates: [] };
    const db = makeRouterDb(state);

    await recordAgentResponse(db, channelId, companyId, agentId);

    expect(state.updates[0].set.hourlyAgentResponseCount).toBe(1);
    // hourlyWindowStart should also be reset to ~now
    const newStart = state.updates[0].set.hourlyWindowStart as Date;
    expect(Date.now() - newStart.getTime()).toBeLessThan(2000);
  });

  it("prunes agent_last_responded_at entries older than 60 min", async () => {
    const staleAgentId = randomUUID();
    const freshAgentId = randomUUID();
    const oldIso = new Date(Date.now() - 61 * 60 * 1000).toISOString();
    const recentIso = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const existing = makeStateRow({
      channelId,
      companyId,
      agentLastRespondedAt: { [staleAgentId]: oldIso, [freshAgentId]: recentIso },
    });
    const state: MockDbState = { state: existing, idleAgents: [], inserts: [], updates: [] };
    const db = makeRouterDb(state);

    await recordAgentResponse(db, channelId, companyId, agentId);

    const map = state.updates[0].set.agentLastRespondedAt as Record<string, string>;
    expect(map[staleAgentId]).toBeUndefined();
    expect(map[freshAgentId]).toBeDefined();
    expect(map[agentId]).toBeDefined();
  });
});

// ── Integration: 21 successive messages → exactly 20 wakeups ────────────────

describe("integration: hourly circuit breaker hard cap", () => {
  it("21 messages with router accepting all → 21st blocks via circuit breaker", async () => {
    const channelId = randomUUID();
    const companyId = randomUUID();
    // Use 21 distinct agents so per-agent cooldown never fires.
    const agentList = Array.from({ length: 21 }, (_, i) =>
      makeAgent({ name: `Agent${i}`, role: "engineer", department: "engineering" }),
    );
    const state: MockDbState = {
      state: null,
      idleAgents: [],
      inserts: [],
      updates: [],
    };
    const db = makeRouterDb(state);

    let wakeups = 0;
    for (let i = 0; i < 21; i++) {
      // Only present the i-th agent as the lone idle candidate so the router
      // picks them deterministically and we exercise the counter monotonically.
      state.idleAgents = [agentList[i]];

      const result = await selectRespondingAgents(
        db,
        channelId,
        "engineering",
        companyId,
        // Use a body that earns score >= 3 for an engineer in #engineering:
        // dept match (+3) hits the threshold without requiring keywords.
        "code update incoming",
        null,
      );
      if (result.length > 0) {
        wakeups++;
        await recordAgentResponse(db, channelId, companyId, result[0].agentId);
      }
      // Reset 10-min counter so the existing soft cap never fires (it would
      // block at 3). In production this happens on every human message.
      if (state.state) {
        state.state.agentResponseCount = 0;
        state.state.windowStart = new Date();
      }
    }

    expect(wakeups).toBe(20);
    expect(state.state?.hourlyAgentResponseCount).toBe(20);
  });
});
