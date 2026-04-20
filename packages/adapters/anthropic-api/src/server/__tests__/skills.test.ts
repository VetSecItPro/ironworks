import { describe, expect, it } from "vitest";
import { getSkillSnapshot, injectSkillsIntoSystemPrompt } from "../skills.js";

describe("getSkillSnapshot", () => {
  it("returns mode: system-prompt-injected (G.6 — honest reporting of actual injection path)", () => {
    // "unsupported" was misleading: skills ARE supported via system prompt injection.
    // "system-prompt-injected" is the accurate mode for stateless HTTP adapters.
    const snapshot = getSkillSnapshot({ config: { model: "claude-sonnet-4-6" } });
    expect(snapshot.mode).toBe("system-prompt-injected");
    expect(snapshot.supported).toBe(true);
  });

  it("returns adapterType: anthropic_api", () => {
    const snapshot = getSkillSnapshot({ config: {} });
    expect(snapshot.adapterType).toBe("anthropic_api");
  });

  it("populates desiredSkills from config.systemPromptSkills", () => {
    const snapshot = getSkillSnapshot({
      config: { systemPromptSkills: ["ironworks", "atlas"] },
    });
    expect(snapshot.desiredSkills).toEqual(["ironworks", "atlas"]);
  });

  it("returns empty desiredSkills when systemPromptSkills is not set", () => {
    const snapshot = getSkillSnapshot({ config: {} });
    expect(snapshot.desiredSkills).toEqual([]);
  });

  it("includes warning when systemPromptSkills is non-empty", () => {
    const snapshot = getSkillSnapshot({
      config: { systemPromptSkills: ["ironworks"] },
    });
    expect(snapshot.warnings.length).toBeGreaterThan(0);
  });

  it("has no warnings when no skills configured", () => {
    const snapshot = getSkillSnapshot({ config: {} });
    expect(snapshot.warnings).toEqual([]);
  });
});

describe("injectSkillsIntoSystemPrompt", () => {
  it("returns base prompt unchanged when no skills provided", () => {
    const result = injectSkillsIntoSystemPrompt("You are helpful.", []);
    expect(result).toBe("You are helpful.");
  });

  it("appends skill content sections to base prompt", () => {
    const result = injectSkillsIntoSystemPrompt("You are helpful.", [
      { key: "ironworks", content: "IronWorks context here." },
    ]);
    expect(result).toContain("You are helpful.");
    expect(result).toContain("ironworks");
    expect(result).toContain("IronWorks context here.");
  });

  it("appends multiple skills in order", () => {
    const result = injectSkillsIntoSystemPrompt("Base.", [
      { key: "skill-a", content: "Content A" },
      { key: "skill-b", content: "Content B" },
    ]);
    expect(result.indexOf("skill-a")).toBeLessThan(result.indexOf("skill-b"));
  });
});
