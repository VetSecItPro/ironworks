import { describe, expect, it } from "vitest";
import { appendMcpToolsAdvisory, getMcpToolsAdvisorySection } from "../server-utils.js";

describe("getMcpToolsAdvisorySection", () => {
  it("returns empty string when context is null/undefined", () => {
    expect(getMcpToolsAdvisorySection(null)).toBe("");
    expect(getMcpToolsAdvisorySection(undefined)).toBe("");
  });

  it("returns empty string when ironworksMcpTools is missing or non-string", () => {
    expect(getMcpToolsAdvisorySection({})).toBe("");
    expect(getMcpToolsAdvisorySection({ ironworksMcpTools: 123 })).toBe("");
    expect(getMcpToolsAdvisorySection({ ironworksMcpTools: null })).toBe("");
  });

  it("returns empty string when ironworksMcpTools is empty/whitespace", () => {
    expect(getMcpToolsAdvisorySection({ ironworksMcpTools: "" })).toBe("");
    expect(getMcpToolsAdvisorySection({ ironworksMcpTools: "   \n  " })).toBe("");
  });

  it("includes the advisory header and the tool catalog when present", () => {
    const tools = "## External Tools (MCP)\n\n### Filesystem\n- `mcp__Filesystem__read_file` — Read a file";
    const out = getMcpToolsAdvisorySection({ ironworksMcpTools: tools });
    expect(out).toContain("Available MCP Tools (advisory only)");
    expect(out).toContain("cannot dispatch them");
    expect(out).toContain("mcp__Filesystem__read_file");
  });
});

describe("appendMcpToolsAdvisory", () => {
  it("returns prompt unchanged when no MCP tools in context", () => {
    expect(appendMcpToolsAdvisory("base prompt", {})).toBe("base prompt");
    expect(appendMcpToolsAdvisory("base prompt", null)).toBe("base prompt");
  });

  it("appends advisory section after the existing prompt with separator", () => {
    const out = appendMcpToolsAdvisory("base prompt", {
      ironworksMcpTools: "### Server\n- `mcp__S__t`",
    });
    expect(out.startsWith("base prompt\n\n")).toBe(true);
    expect(out).toContain("Available MCP Tools (advisory only)");
    expect(out).toContain("mcp__S__t");
  });

  it("returns just the advisory section when prompt is empty", () => {
    const out = appendMcpToolsAdvisory("", {
      ironworksMcpTools: "### S\n- `mcp__S__t`",
    });
    expect(out).toContain("Available MCP Tools (advisory only)");
    expect(out).not.toMatch(/^\n\n/);
  });

  it("uses a custom separator when provided", () => {
    const out = appendMcpToolsAdvisory("base", { ironworksMcpTools: "tools" }, "\n---\n");
    expect(out.startsWith("base\n---\n")).toBe(true);
  });
});
