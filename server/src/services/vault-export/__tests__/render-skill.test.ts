import { describe, expect, it } from "vitest";
import { type CompanySkill, renderSkill, slugifySkillName } from "../render-skill.js";

function makeSkill(overrides: Partial<CompanySkill> = {}): CompanySkill {
  const base: CompanySkill = {
    id: "00000000-0000-0000-0000-0000000000d1",
    companyId: "00000000-0000-0000-0000-0000000000aa",
    key: "code-review",
    slug: "code-review",
    name: "Code Review",
    description: "Reviews PRs.",
    markdown: "# Code Review\n\nDo the thing.",
    sourceType: "local_path",
    sourceLocator: null,
    sourceRef: null,
    trustLevel: "markdown_only",
    compatibility: "compatible",
    fileInventory: [],
    metadata: null,
    origin: "authored",
    recipeId: null,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
  };
  return { ...base, ...overrides };
}

describe("slugifySkillName", () => {
  it("lower-cases and dash-collapses", () => {
    expect(slugifySkillName("Code Review", "fallback")).toBe("code-review");
  });
  it("strips dangerous chars", () => {
    expect(slugifySkillName("Foo/Bar:baz", "fallback")).toBe("foo-bar-baz");
  });
  it("falls back to slug column when name collapses to empty", () => {
    expect(slugifySkillName("///", "code-review")).toBe("code-review");
  });
});

describe("renderSkill", () => {
  it("renders all canonical frontmatter fields and the markdown body", () => {
    const skill = makeSkill({
      sourceLocator: "skills/code-review",
      sourceRef: "main",
    });
    const result = renderSkill(skill);

    expect(result.path).toBe("skills/code-review.md");
    expect(result.content).toContain("type: skill");
    expect(result.content).toContain("title: Code Review");
    expect(result.content).toContain("key: code-review");
    expect(result.content).toContain("slug: code-review");
    expect(result.content).toContain("source_type: local_path");
    expect(result.content).toContain("source_locator: skills/code-review");
    expect(result.content).toContain("source_ref: main");
    expect(result.content).toContain("trust_level: markdown_only");
    expect(result.content).toContain("compatibility: compatible");
    expect(result.content).toContain("origin: authored");
    expect(result.content).toContain("# Code Review\n\nDo the thing.");
  });

  it("omits null source_locator/source_ref fields", () => {
    const skill = makeSkill({ sourceLocator: null, sourceRef: null });
    const result = renderSkill(skill);
    expect(result.content).not.toContain("source_locator");
    expect(result.content).not.toContain("source_ref");
  });

  it("path uses sanitized name slug, not the slug column verbatim", () => {
    const skill = makeSkill({
      name: "Weird Name!!",
      slug: "weird-name", // already-correct fallback
    });
    const result = renderSkill(skill);
    expect(result.path).toBe("skills/weird-name.md");
  });

  it("falls back to slug column when name has only symbols", () => {
    const skill = makeSkill({ name: "////", slug: "fallback-skill" });
    const result = renderSkill(skill);
    expect(result.path).toBe("skills/fallback-skill.md");
  });

  it("handles empty markdown gracefully", () => {
    const skill = makeSkill({ markdown: "" });
    const result = renderSkill(skill);
    expect(result.content.endsWith("---\n\n\n")).toBe(true);
  });
});
