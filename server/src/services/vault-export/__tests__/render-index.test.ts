import { describe, expect, it } from "vitest";
import { renderIndex } from "../render-index.js";

describe("renderIndex", () => {
  const baseInput = {
    companyName: "Acme Co",
    generatedAt: new Date("2026-05-08T12:34:56.000Z"),
    counts: {
      knowledgePages: 42,
      decisions: 7,
      agents: 3,
      issues: 12,
      skills: 5,
    },
  };

  it("emits index.md path", () => {
    const file = renderIndex(baseInput);
    expect(file.path).toBe("index.md");
  });

  it("emits frontmatter with type=index, title, generated_at", () => {
    const file = renderIndex(baseInput);
    expect(file.content).toMatch(/^---\n/);
    expect(file.content).toContain("type: index");
    expect(file.content).toContain('title: "Acme Co Vault"');
    expect(file.content).toContain("generated_at: 2026-05-08T12:34:56.000Z");
  });

  it("escapes title double-quotes + backslashes", () => {
    const file = renderIndex({
      ...baseInput,
      companyName: 'Acme "Co" \\labs',
    });
    expect(file.content).toContain('title: "Acme \\"Co\\" \\\\labs Vault"');
  });

  it("renders all six TOC sections", () => {
    const file = renderIndex(baseInput);
    expect(file.content).toContain("[[knowledge/]]");
    expect(file.content).toContain("[[decisions/]]");
    expect(file.content).toContain("[[agents/]]");
    expect(file.content).toContain("[[issues/]]");
    expect(file.content).toContain("[[finance/cost-rollups/]]");
    expect(file.content).toContain("[[skills/]]");
  });

  it("renders all five count rows", () => {
    const file = renderIndex(baseInput);
    expect(file.content).toContain("Knowledge pages: 42");
    expect(file.content).toContain("Decisions: 7");
    expect(file.content).toContain("Agents: 3");
    expect(file.content).toContain("Issues: 12");
    expect(file.content).toContain("Skills: 5");
  });

  it("uses the date portion of generatedAt in the body sentence", () => {
    const file = renderIndex(baseInput);
    expect(file.content).toContain("exported from Ironworks on 2026-05-08.");
  });

  it("renders zero counts cleanly", () => {
    const file = renderIndex({
      ...baseInput,
      counts: { knowledgePages: 0, decisions: 0, agents: 0, issues: 0, skills: 0 },
    });
    expect(file.content).toContain("Knowledge pages: 0");
    expect(file.content).toContain("Skills: 0");
  });
});
