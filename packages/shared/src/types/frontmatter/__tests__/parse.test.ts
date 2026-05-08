import { describe, expect, it } from "vitest";
import type { KnowledgeFrontmatter } from "../index.js";
import { parseFrontmatter } from "../parse.js";

describe("parseFrontmatter", () => {
  it("parses a document with frontmatter into fm + body", () => {
    const md = [
      "---",
      "id: k1",
      "type: knowledge",
      "title: Hello",
      "created_at: '2026-05-08T12:00:00.000Z'",
      "updated_at: '2026-05-08T12:00:00.000Z'",
      "slug: hello",
      "auto_generated: false",
      "revision_number: 1",
      "---",
      "Body line 1",
      "Body line 2",
    ].join("\n");
    const { fm, body } = parseFrontmatter<KnowledgeFrontmatter>(md);
    expect(fm).toBeDefined();
    expect(fm?.id).toBe("k1");
    expect(fm?.type).toBe("knowledge");
    expect(fm?.auto_generated).toBe(false);
    expect(fm?.revision_number).toBe(1);
    expect(body).toBe("Body line 1\nBody line 2");
  });

  it("returns fm: undefined and full body when no frontmatter is present", () => {
    const md = "# Just a heading\n\nNo frontmatter here.";
    const { fm, body } = parseFrontmatter(md);
    expect(fm).toBeUndefined();
    expect(body).toBe(md);
  });

  it("returns fm: undefined for malformed YAML and preserves original body", () => {
    const md = ["---", "id: k1", "  bad: : indent", "tags: [unclosed", "---", "Body"].join("\n");
    const { fm, body } = parseFrontmatter(md);
    expect(fm).toBeUndefined();
    expect(body).toBe(md);
  });

  it("returns fm: undefined when frontmatter parses to a non-object scalar", () => {
    const md = ["---", "just a string", "---", "Body"].join("\n");
    const { fm, body } = parseFrontmatter(md);
    expect(fm).toBeUndefined();
    expect(body).toBe(md);
  });

  it("handles empty body after frontmatter delimiter", () => {
    const md = ["---", "id: k1", "type: knowledge", "title: T", "---"].join("\n");
    const { fm, body } = parseFrontmatter(md);
    expect(fm).toBeDefined();
    expect(body).toBe("");
  });

  it("does not match a `---` block in the middle of a document", () => {
    const md = "Intro paragraph\n---\nid: k1\n---\nMore body";
    const { fm, body } = parseFrontmatter(md);
    expect(fm).toBeUndefined();
    expect(body).toBe(md);
  });
});
