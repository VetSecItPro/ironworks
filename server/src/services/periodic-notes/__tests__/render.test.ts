import { describe, expect, it } from "vitest";
import { renderCostRollupBody, renderDecisionBody, renderRunBody } from "../render.js";

const T0 = new Date("2026-05-08T12:00:00.000Z");
const T1 = new Date("2026-05-08T12:05:30.000Z");

describe("renderRunBody", () => {
  it("renders a succeeded run with cost + linked issue + summary", () => {
    const out = renderRunBody({
      agentSlug: "code-reviewer",
      agentTitle: "Code Reviewer",
      runId: "run_abc123",
      status: "succeeded",
      startedAt: T0,
      completedAt: T1,
      costUsd: 0.42,
      linkedIssueRef: "ABC-123",
      linkedIssueSlug: "abc-123-fix-login",
      summary: "Fixed the broken login flow.",
    });
    expect(out).toContain("# Run `run_abc123`");
    expect(out).toContain("[[code-reviewer|Code Reviewer]]");
    expect(out).toContain("## Status");
    expect(out).toContain("- **Result:** succeeded");
    expect(out).toContain("- **Started:** 2026-05-08T12:00:00Z");
    expect(out).toContain("- **Completed:** 2026-05-08T12:05:30Z");
    expect(out).toContain("## Cost");
    expect(out).toContain("$0.42");
    expect(out).toContain("## Linked Issue");
    expect(out).toContain("[[abc-123-fix-login]] (ABC-123)");
    expect(out).toContain("## Summary");
    expect(out).toContain("Fixed the broken login flow.");
  });

  it("renders a failed run with no cost", () => {
    const out = renderRunBody({
      agentSlug: "writer",
      agentTitle: "Writer",
      runId: "run_x",
      status: "failed",
      startedAt: T0,
      completedAt: T1,
      costUsd: null,
      linkedIssueRef: null,
      linkedIssueSlug: null,
      summary: null,
    });
    expect(out).toContain("- **Result:** failed");
    expect(out).not.toContain("## Cost");
    expect(out).not.toContain("## Linked Issue");
    expect(out).not.toContain("## Summary");
  });

  it("renders a cancelled run with no linked issue", () => {
    const out = renderRunBody({
      agentSlug: null,
      agentTitle: "Some Agent",
      runId: "run_c",
      status: "cancelled",
      startedAt: T0,
      completedAt: T1,
      costUsd: 0,
      linkedIssueRef: null,
      linkedIssueSlug: null,
      summary: "Cancelled by user.",
    });
    expect(out).toContain("- **Result:** cancelled");
    // No agent slug → plain title, no wikilink wrapping.
    expect(out).toContain("Some Agent");
    expect(out).not.toContain("[[");
    expect(out).toContain("$0.00");
    expect(out).not.toContain("## Linked Issue");
    expect(out).toContain("## Summary");
  });

  it("omits summary section gracefully when null", () => {
    const out = renderRunBody({
      agentSlug: "a",
      agentTitle: "A",
      runId: "r",
      status: "timed_out",
      startedAt: T0,
      completedAt: T1,
      costUsd: 1.5,
      linkedIssueRef: "X-1",
      linkedIssueSlug: null,
      summary: null,
    });
    expect(out).not.toContain("## Summary");
    // linkedIssueSlug null → plain text reference, not wikilink.
    expect(out).toContain("- X-1");
    expect(out).not.toMatch(/\[\[X-1\]\]/);
  });

  it("emits wikilink for linked issue when slug present, plain text when null", () => {
    const withSlug = renderRunBody({
      agentSlug: "a",
      agentTitle: "A",
      runId: "r",
      status: "succeeded",
      startedAt: T0,
      completedAt: T1,
      costUsd: null,
      linkedIssueRef: "ABC-9",
      linkedIssueSlug: "abc-9-thing",
      summary: null,
    });
    expect(withSlug).toContain("[[abc-9-thing]] (ABC-9)");

    const noSlug = renderRunBody({
      agentSlug: "a",
      agentTitle: "A",
      runId: "r",
      status: "succeeded",
      startedAt: T0,
      completedAt: T1,
      costUsd: null,
      linkedIssueRef: "ABC-9",
      linkedIssueSlug: null,
      summary: null,
    });
    expect(noSlug).toContain("- ABC-9");
    expect(noSlug).not.toContain("[[abc-9");
  });
});

describe("renderDecisionBody", () => {
  it("renders a decision with all context populated", () => {
    const out = renderDecisionBody({
      decisionId: "dec_1",
      rationale: "We chose X because Y.",
      status: "accepted",
      contextIssueSlug: "abc-1",
      decidedByAgentSlug: "ceo",
      projectSlug: "proj-alpha",
      alternatives: ["Use Y", "Do nothing"],
      consequences: ["Faster ship", "More lock-in"],
    });
    expect(out).toContain("# Decision `dec_1`");
    expect(out).toContain("- **Status:** accepted");
    expect(out).toContain("## Context");
    expect(out).toContain("- **Issue:** [[abc-1]]");
    expect(out).toContain("- **Decided by:** [[ceo]]");
    expect(out).toContain("- **Project:** [[proj-alpha]]");
    expect(out).toContain("## Rationale");
    expect(out).toContain("We chose X because Y.");
    expect(out).toContain("## Alternatives");
    expect(out).toContain("- Use Y");
    expect(out).toContain("- Do nothing");
    expect(out).toContain("## Consequences");
    expect(out).toContain("- Faster ship");
  });

  it("renders a decision with no project (null projectSlug)", () => {
    const out = renderDecisionBody({
      decisionId: "dec_2",
      rationale: "Because.",
      status: "proposed",
      contextIssueSlug: "i-1",
      decidedByAgentSlug: "agent-a",
      projectSlug: null,
      alternatives: null,
      consequences: null,
    });
    expect(out).toContain("- **Issue:** [[i-1]]");
    expect(out).toContain("- **Decided by:** [[agent-a]]");
    expect(out).not.toContain("**Project:**");
  });

  it("omits alternatives + consequences when null", () => {
    const out = renderDecisionBody({
      decisionId: "dec_3",
      rationale: null,
      status: "superseded",
      contextIssueSlug: null,
      decidedByAgentSlug: null,
      projectSlug: null,
      alternatives: null,
      consequences: null,
    });
    expect(out).not.toContain("## Alternatives");
    expect(out).not.toContain("## Consequences");
    expect(out).not.toContain("## Context");
    expect(out).not.toContain("## Rationale");
    expect(out).toContain("- **Status:** superseded");
  });

  it("omits empty-array alternatives + consequences", () => {
    const out = renderDecisionBody({
      decisionId: "dec_4",
      rationale: "r",
      status: "deprecated",
      contextIssueSlug: null,
      decidedByAgentSlug: null,
      projectSlug: null,
      alternatives: [],
      consequences: [],
    });
    expect(out).not.toContain("## Alternatives");
    expect(out).not.toContain("## Consequences");
  });

  it("emits wikilinks for issue, agent, project", () => {
    const out = renderDecisionBody({
      decisionId: "dec_5",
      rationale: "r",
      status: "accepted",
      contextIssueSlug: "ctx-issue",
      decidedByAgentSlug: "decider-bot",
      projectSlug: "the-project",
      alternatives: ["a"],
      consequences: ["c"],
    });
    expect(out).toMatch(/\[\[ctx-issue\]\]/);
    expect(out).toMatch(/\[\[decider-bot\]\]/);
    expect(out).toMatch(/\[\[the-project\]\]/);
  });
});

describe("renderCostRollupBody", () => {
  const start = new Date("2026-05-04T00:00:00.000Z");
  const end = new Date("2026-05-10T23:59:59.000Z");

  it("renders weekly with both agent + provider data", () => {
    const out = renderCostRollupBody({
      granularity: "weekly",
      periodStart: start,
      periodEnd: end,
      totalUsd: 12.34,
      byAgent: [
        { agentSlug: "writer", totalUsd: 7.5 },
        { agentSlug: "reviewer", totalUsd: 4.84 },
      ],
      byProvider: [
        { provider: "anthropic", totalUsd: 10.0 },
        { provider: "openai", totalUsd: 2.34 },
      ],
    });
    expect(out).toContain("# Weekly Cost Rollup");
    expect(out).toContain("**Period:** 2026-05-04 to 2026-05-10");
    expect(out).toContain("**Total:** $12.34");
    expect(out).toContain("## By Agent");
    expect(out).toContain("| [[writer]] | $7.50 |");
    expect(out).toContain("| [[reviewer]] | $4.84 |");
    expect(out).toContain("## By Provider");
    expect(out).toContain("| anthropic | $10.00 |");
    expect(out).toContain("| openai | $2.34 |");
    expect(out).toContain("| Agent / Provider | Cost (USD) |");
  });

  it("renders monthly with single agent", () => {
    const out = renderCostRollupBody({
      granularity: "monthly",
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-31T00:00:00.000Z"),
      totalUsd: 1234.56,
      byAgent: [{ agentSlug: "solo", totalUsd: 1234.56 }],
      byProvider: [],
    });
    expect(out).toContain("# Monthly Cost Rollup");
    expect(out).toContain("**Total:** $1234.56");
    expect(out).toContain("| [[solo]] | $1234.56 |");
    expect(out).not.toContain("## By Provider");
  });

  it("renders empty period message when no data", () => {
    const out = renderCostRollupBody({
      granularity: "weekly",
      periodStart: start,
      periodEnd: end,
      totalUsd: 0,
      byAgent: [],
      byProvider: [],
    });
    expect(out).toContain("No costs recorded for this period.");
    expect(out).not.toContain("## By Agent");
    expect(out).not.toContain("## By Provider");
    // Total line is suppressed for empty periods.
    expect(out).not.toContain("**Total:**");
  });

  it("formats currency consistently: $0.00, $1.50, $1234.56", () => {
    const out = renderCostRollupBody({
      granularity: "weekly",
      periodStart: start,
      periodEnd: end,
      totalUsd: 1236.06,
      byAgent: [
        { agentSlug: "a", totalUsd: 0 },
        { agentSlug: "b", totalUsd: 1.5 },
        { agentSlug: "c", totalUsd: 1234.56 },
      ],
      byProvider: [],
    });
    expect(out).toContain("| [[a]] | $0.00 |");
    expect(out).toContain("| [[b]] | $1.50 |");
    expect(out).toContain("| [[c]] | $1234.56 |");
  });

  it("uses different headers for weekly vs monthly", () => {
    const weekly = renderCostRollupBody({
      granularity: "weekly",
      periodStart: start,
      periodEnd: end,
      totalUsd: 0,
      byAgent: [],
      byProvider: [],
    });
    const monthly = renderCostRollupBody({
      granularity: "monthly",
      periodStart: start,
      periodEnd: end,
      totalUsd: 0,
      byAgent: [],
      byProvider: [],
    });
    expect(weekly).toContain("# Weekly Cost Rollup");
    expect(weekly).not.toContain("# Monthly Cost Rollup");
    expect(monthly).toContain("# Monthly Cost Rollup");
    expect(monthly).not.toContain("# Weekly Cost Rollup");
  });
});
