import { describe, expect, it } from "vitest";
import { getObsidianConfigFiles } from "../obsidian-config.js";

describe("getObsidianConfigFiles", () => {
  it("emits exactly two files at the .obsidian/ prefix", () => {
    const files = getObsidianConfigFiles();
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.path).sort()).toEqual([".obsidian/app.json", ".obsidian/community-plugins.json"]);
  });

  it("app.json contains the spec-fixed keys", () => {
    const files = getObsidianConfigFiles();
    const appJson = files.find((f) => f.path === ".obsidian/app.json");
    expect(appJson).toBeDefined();
    const parsed = JSON.parse(appJson!.content) as Record<string, unknown>;
    expect(parsed).toEqual({
      useMarkdownLinks: false,
      newLinkFormat: "shortest",
      alwaysUpdateLinks: true,
    });
  });

  it("community-plugins.json is an empty array", () => {
    const files = getObsidianConfigFiles();
    const plugins = files.find((f) => f.path === ".obsidian/community-plugins.json");
    expect(plugins).toBeDefined();
    const parsed = JSON.parse(plugins!.content) as unknown;
    expect(parsed).toEqual([]);
  });

  it("each file ends with a trailing newline", () => {
    for (const file of getObsidianConfigFiles()) {
      expect(file.content.endsWith("\n")).toBe(true);
    }
  });
});
