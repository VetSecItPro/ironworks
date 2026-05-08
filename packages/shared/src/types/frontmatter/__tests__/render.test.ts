import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { renderFrontmatter } from "../render.js";
import type {
  AgentFrontmatter,
  DecisionFrontmatter,
  IssueFrontmatter,
  KnowledgeFrontmatter,
  ProjectFrontmatter,
  RunFrontmatter,
  SkillFrontmatter,
} from "../index.js";

const ts = "2026-05-08T12:00:00.000Z";

describe("renderFrontmatter", () => {
  it("wraps output in --- delimiters with trailing newline", () => {
    const fm: KnowledgeFrontmatter = {
      id: "k1",
      type: "knowledge",
      title: "Hello",
      created_at: ts,
      updated_at: ts,
      slug: "hello",
      auto_generated: false,
      revision_number: 1,
    };
    const out = renderFrontmatter(fm);
    expect(out.startsWith("---\n")).toBe(true);
    expect(out.endsWith("---\n")).toBe(true);
  });

  it("emits valid YAML that parses back to an object containing the input keys", () => {
    const fm: DecisionFrontmatter = {
      id: "d1",
      type: "decision",
      title: "Use Postgres",
      created_at: ts,
      updated_at: ts,
      decision_id: "ADR-001",
      status: "accepted",
      alternatives_considered: ["MySQL", "SQLite"],
      consequences: ["Single source of truth"],
    };
    const out = renderFrontmatter(fm);
    const inner = out.replace(/^---\n/, "").replace(/---\n$/, "");
    const parsed = yaml.load(inner) as Record<string, unknown>;
    expect(parsed.id).toBe("d1");
    expect(parsed.type).toBe("decision");
    expect(parsed.alternatives_considered).toEqual(["MySQL", "SQLite"]);
  });

  it("omits undefined optional fields entirely (does not emit `key: null`)", () => {
    const fm: KnowledgeFrontmatter = {
      id: "k1",
      type: "knowledge",
      title: "T",
      created_at: ts,
      updated_at: ts,
      slug: "t",
      auto_generated: false,
      revision_number: 0,
      // tags, visibility, document_type, agent_id, project_id all undefined
    };
    const out = renderFrontmatter(fm);
    expect(out).not.toContain("tags:");
    expect(out).not.toContain("visibility:");
    expect(out).not.toContain("document_type:");
    expect(out).not.toContain("agent_id:");
    expect(out).not.toContain("null");
  });

  it("renders all 7 entity types without throwing", () => {
    const samples: Array<{ kind: string; fm: Parameters<typeof renderFrontmatter>[0] }> = [
      {
        kind: "knowledge",
        fm: {
          id: "k1",
          type: "knowledge",
          title: "K",
          created_at: ts,
          updated_at: ts,
          slug: "k",
          auto_generated: true,
          revision_number: 2,
        } satisfies KnowledgeFrontmatter,
      },
      {
        kind: "decision",
        fm: {
          id: "d1",
          type: "decision",
          title: "D",
          created_at: ts,
          updated_at: ts,
          decision_id: "ADR-1",
          status: "proposed",
        } satisfies DecisionFrontmatter,
      },
      {
        kind: "skill",
        fm: {
          id: "s1",
          type: "skill",
          title: "S",
          created_at: ts,
          updated_at: ts,
          key: "investigate",
          slug: "investigate",
          source_type: "local_path",
          trust_level: "markdown_only",
          compatibility: "compatible",
          origin: "authored",
        } satisfies SkillFrontmatter,
      },
      {
        kind: "agent",
        fm: {
          id: "a1",
          type: "agent",
          title: "A",
          created_at: ts,
          updated_at: ts,
          name: "Ada",
          role: "engineer",
          status: "idle",
          employment_type: "full_time",
          adapter_type: "process",
        } satisfies AgentFrontmatter,
      },
      {
        kind: "project",
        fm: {
          id: "p1",
          type: "project",
          title: "P",
          created_at: ts,
          updated_at: ts,
          name: "Memory upgrade",
          status: "active",
        } satisfies ProjectFrontmatter,
      },
      {
        kind: "issue",
        fm: {
          id: "i1",
          type: "issue",
          title: "Fix bug",
          created_at: ts,
          updated_at: ts,
          status: "in_progress",
          priority: "high",
          origin_kind: "manual",
        } satisfies IssueFrontmatter,
      },
      {
        kind: "run",
        fm: {
          id: "r1",
          type: "run",
          title: "Heartbeat #42",
          created_at: ts,
          updated_at: ts,
          agent_id: "a1",
          invocation_source: "scheduled",
          status: "succeeded",
        } satisfies RunFrontmatter,
      },
    ];
    for (const { fm } of samples) {
      const out = renderFrontmatter(fm);
      expect(out).toMatch(/^---\n[\s\S]+---\n$/);
    }
  });
});
