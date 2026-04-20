import { describe, expect, it } from "vitest";
import { getSkillSnapshot, injectSkillsIntoSystemPrompt } from "../skills.js";

describe("getSkillSnapshot", () => {
  it("returns mode: system-prompt-injected for poe_api adapter (G.6)", () => {
    // "unsupported" was misleading: skills ARE supported via system prompt injection.
    // "system-prompt-injected" is the accurate mode for stateless HTTP adapters.
    const snapshot = getSkillSnapshot({ config: { model: "claude-sonnet-4-6" } });
    expect(snapshot.mode).toBe("system-prompt-injected");
    expect(snapshot.adapterType).toBe("poe_api");
    expect(snapshot.supported).toBe(true);
  });

  it("returns empty desiredSkills when systemPromptSkills not configured", () => {
    const snapshot = getSkillSnapshot({ config: { model: "gpt-4o" } });
    expect(snapshot.desiredSkills).toEqual([]);
  });

  it("returns desiredSkills from systemPromptSkills config field", () => {
    const snapshot = getSkillSnapshot({
      config: { model: "gpt-4o", systemPromptSkills: ["ironworks", "atlas"] },
    });
    expect(snapshot.desiredSkills).toEqual(["ironworks", "atlas"]);
  });
});

describe("injectSkillsIntoSystemPrompt", () => {
  it("returns base prompt unchanged when no skill keys provided", () => {
    const result = injectSkillsIntoSystemPrompt("You are a helpful assistant.", []);
    expect(result).toBe("You are a helpful assistant.");
  });

  it("appends skill content to system prompt when keys provided", () => {
    const skills = [{ key: "ironworks", content: "## IronWorks API\nUse GET /api/agents/me..." }];
    const result = injectSkillsIntoSystemPrompt("Base prompt.", skills);
    expect(result).toContain("Base prompt.");
    expect(result).toContain("IronWorks API");
    expect(result).toContain("GET /api/agents/me");
  });

  it("injects multiple skills in order", () => {
    const skills = [
      { key: "skill-a", content: "SKILL_A_CONTENT" },
      { key: "skill-b", content: "SKILL_B_CONTENT" },
    ];
    const result = injectSkillsIntoSystemPrompt("Base.", skills);
    const aIdx = result.indexOf("SKILL_A_CONTENT");
    const bIdx = result.indexOf("SKILL_B_CONTENT");
    expect(aIdx).toBeLessThan(bIdx);
  });
});
