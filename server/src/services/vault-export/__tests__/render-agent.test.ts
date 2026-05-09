import { describe, expect, it } from "vitest";
import { type Agent, type RecentRunSummary, renderAgentProfile, slugifyAgentName } from "../render-agent.js";

/**
 * Minimal Agent factory. Fills every column the row type requires with a
 * sane default so individual tests only override what they care about.
 * Avoids `as any` while staying terse.
 */
function makeAgent(overrides: Partial<Agent> = {}): Agent {
  const base: Agent = {
    id: "00000000-0000-0000-0000-0000000000a1",
    companyId: "00000000-0000-0000-0000-0000000000aa",
    name: "Atlas Engineer",
    role: "engineer",
    title: null,
    icon: null,
    status: "idle",
    reportsTo: null,
    capabilities: null,
    adapterType: "process",
    adapterConfig: {},
    runtimeConfig: {},
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    pauseReason: null,
    pausedAt: null,
    permissions: {},
    lastHeartbeatAt: null,
    metadata: null,
    employmentType: "full_time",
    hiredAt: new Date("2026-04-01T00:00:00.000Z"),
    hiredByUserId: null,
    hiredByAgentId: null,
    contractEndAt: null,
    contractEndCondition: null,
    contractProjectId: null,
    contractBudgetCents: null,
    contractSpentCents: 0,
    terminatedAt: null,
    terminationReason: null,
    department: null,
    onboardingContextIds: [],
    performanceScore: null,
    systemPrompt: null,
    agentInstructions: null,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
  };
  return { ...base, ...overrides };
}

describe("slugifyAgentName", () => {
  const cases: Array<[string, string]> = [
    ["Atlas Engineer", "atlas-engineer"],
    ["UPPER CASE", "upper-case"],
    ["foo/bar:baz", "foo-bar-baz"],
    ["  weird   spaces  ", "weird-spaces"],
    ["multi---dash", "multi-dash"],
  ];
  for (const [input, expected] of cases) {
    it(`maps '${input}' → '${expected}'`, () => {
      expect(slugifyAgentName(input, "fallback1")).toBe(expected);
    });
  }

  it("falls back to id-prefix on all-symbol names", () => {
    expect(slugifyAgentName("///", "abcdef1234567890")).toBe("abcdef12");
  });
});

describe("renderAgentProfile", () => {
  it("renders frontmatter + H1 + recent-runs section", () => {
    const agent = makeAgent({
      name: "Atlas Engineer",
      title: "Lead",
      department: "engineering",
      reportsTo: "00000000-0000-0000-0000-0000000000ab",
      systemPrompt: "You are an engineer.",
    });
    const recentRuns: RecentRunSummary[] = [
      {
        id: "11111111-2222-3333-4444-555555555555",
        startedAt: new Date("2026-05-01T10:00:00.000Z"),
        finishedAt: new Date("2026-05-01T10:30:00.000Z"),
      },
    ];

    const result = renderAgentProfile({ agent, recentRuns });

    expect(result.path).toBe("agents/atlas-engineer/profile.md");
    expect(result.content).toContain("type: agent");
    expect(result.content).toContain("name: Atlas Engineer");
    expect(result.content).toContain("agent_title: Lead");
    expect(result.content).toContain("department: engineering");
    expect(result.content).toContain("reports_to: 00000000-0000-0000-0000-0000000000ab");
    expect(result.content).toContain("# Atlas Engineer");
    expect(result.content).toContain("You are an engineer.");
    expect(result.content).toContain("## Recent Runs");
    expect(result.content).toContain("[[agents/atlas-engineer/runs/2026-05-01/11111111]]");
  });

  it("omits optional null fields and Recent Runs when no runs", () => {
    const agent = makeAgent({
      name: "Bare Agent",
      title: null,
      department: null,
      reportsTo: null,
      agentInstructions: null,
      systemPrompt: null,
      capabilities: null,
    });

    const result = renderAgentProfile({ agent, recentRuns: [] });

    expect(result.content).not.toContain("agent_title");
    expect(result.content).not.toContain("department:");
    expect(result.content).not.toContain("reports_to:");
    expect(result.content).not.toContain("## Recent Runs");
  });

  it("prefers agentInstructions over systemPrompt over capabilities", () => {
    const agent = makeAgent({
      agentInstructions: "INSTRUCTIONS",
      systemPrompt: "PROMPT",
      capabilities: "CAPS",
    });
    const result = renderAgentProfile({ agent, recentRuns: [] });
    expect(result.content).toContain("INSTRUCTIONS");
    expect(result.content).not.toContain("PROMPT");
    expect(result.content).not.toContain("CAPS");
  });

  it("truncates very long descriptions with marker", () => {
    const agent = makeAgent({ systemPrompt: "x".repeat(3000) });
    const result = renderAgentProfile({ agent, recentRuns: [] });
    expect(result.content).toContain("_(truncated)_");
    // Should contain only the first 2000 x's, not all 3000
    expect(result.content).toContain("x".repeat(2000));
    expect(result.content).not.toContain("x".repeat(2001));
  });

  it("sanitizes dangerous chars in agent name → safe path", () => {
    const agent = makeAgent({ name: 'Mal/icious"Name' });
    const result = renderAgentProfile({ agent, recentRuns: [] });
    expect(result.path).toBe("agents/mal-icious-name/profile.md");
  });

  it("uses startedAt anchor when finishedAt missing", () => {
    const agent = makeAgent({ name: "RunAgent" });
    const recentRuns: RecentRunSummary[] = [
      {
        id: "abcdef12-3456-7890-1234-000000000000",
        startedAt: new Date("2026-04-15T08:00:00.000Z"),
        finishedAt: null,
      },
    ];
    const result = renderAgentProfile({ agent, recentRuns });
    expect(result.content).toContain("[[agents/runagent/runs/2026-04-15/abcdef12]]");
  });
});
