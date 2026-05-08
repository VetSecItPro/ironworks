import { describe, expect, it } from "vitest";
import type {
  AgentFrontmatter,
  AnyFrontmatter,
  DecisionFrontmatter,
  IssueFrontmatter,
  KnowledgeFrontmatter,
  ProjectFrontmatter,
  RunFrontmatter,
  SkillFrontmatter,
} from "../index.js";
import { parseFrontmatter } from "../parse.js";
import { renderFrontmatter } from "../render.js";

const ts = "2026-05-08T12:00:00.000Z";

const samples: AnyFrontmatter[] = [
  {
    id: "k1",
    type: "knowledge",
    title: "Knowledge entry",
    created_at: ts,
    updated_at: ts,
    tags: ["docs", "memory"],
    visibility: "company",
    slug: "knowledge-entry",
    document_type: "guide",
    department: "engineering",
    deliverable_status: "draft",
    auto_generated: true,
    revision_number: 3,
    agent_id: "agent-1",
    project_id: "project-1",
  } satisfies KnowledgeFrontmatter,
  {
    id: "d1",
    type: "decision",
    title: "Adopt Postgres pgvector",
    created_at: ts,
    updated_at: ts,
    decision_id: "ADR-001",
    status: "accepted",
    context_issue_id: "issue-1",
    decided_by_agent_id: "agent-1",
    alternatives_considered: ["Pinecone", "Weaviate"],
    consequences: ["Single store", "No external dep"],
  } satisfies DecisionFrontmatter,
  {
    id: "s1",
    type: "skill",
    title: "investigate",
    created_at: ts,
    updated_at: ts,
    key: "investigate",
    slug: "investigate",
    source_type: "local_path",
    source_locator: "/skills/investigate",
    source_ref: "main",
    trust_level: "verified",
    compatibility: "compatible",
    origin: "authored",
  } satisfies SkillFrontmatter,
  {
    id: "a1",
    type: "agent",
    title: "Ada",
    created_at: ts,
    updated_at: ts,
    name: "Ada",
    role: "engineer",
    agent_title: "Senior Engineer",
    status: "idle",
    reports_to: "agent-mgr",
    department: "platform",
    employment_type: "full_time",
    adapter_type: "claude_local",
  } satisfies AgentFrontmatter,
  {
    id: "p1",
    type: "project",
    title: "Memory Upgrade",
    created_at: ts,
    updated_at: ts,
    name: "Memory Upgrade",
    status: "active",
    goal_id: "goal-1",
    lead_agent_id: "agent-1",
    target_date: "2026-06-01",
    archived: false,
  } satisfies ProjectFrontmatter,
  {
    id: "i1",
    type: "issue",
    title: "Wire embedding worker",
    created_at: ts,
    updated_at: ts,
    status: "in_progress",
    priority: "high",
    identifier: "ENG-123",
    issue_number: 123,
    project_id: "project-1",
    parent_id: "issue-parent",
    assignee_agent_id: "agent-1",
    origin_kind: "manual",
    target_date: ts,
    depends_on: ["issue-2", "issue-3"],
  } satisfies IssueFrontmatter,
  {
    id: "r1",
    type: "run",
    title: "Heartbeat #42",
    created_at: ts,
    updated_at: ts,
    agent_id: "agent-1",
    invocation_source: "scheduled",
    trigger_detail: "cron: */5 * * * *",
    status: "succeeded",
    started_at: ts,
    finished_at: ts,
    exit_code: 0,
  } satisfies RunFrontmatter,
];

describe("renderFrontmatter -> parseFrontmatter round-trip", () => {
  for (const fm of samples) {
    it(`round-trips ${fm.type}`, () => {
      const rendered = renderFrontmatter(fm);
      const md = `${rendered}# Body\n\nSome content.`;
      const { fm: parsed, body } = parseFrontmatter(md);
      expect(parsed).toBeDefined();
      expect(parsed).toEqual(fm);
      expect(body).toBe("# Body\n\nSome content.");
    });
  }

  it("body is preserved verbatim when concatenated with rendered frontmatter", () => {
    const fm = samples[0];
    const body = "Line A\nLine B\n\n## Section\n\n- item 1\n- item 2\n";
    const md = renderFrontmatter(fm) + body;
    const result = parseFrontmatter(md);
    expect(result.body).toBe(body);
  });
});
