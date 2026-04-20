/**
 * Skill management for anthropic_api adapter.
 *
 * Anthropic's HTTP API is stateless — it cannot sync skill files to disk like CLI adapters.
 * Skills listed in config.systemPromptSkills are injected as text into the system prompt
 * at execute time. The skill sync mode is "system-prompt-injected" (G.6: accurate
 * representation — skills ARE supported, just via prompt injection not file sync).
 */

import type { AdapterSkillSnapshot } from "@ironworksai/adapter-utils";

const ADAPTER_TYPE = "anthropic_api";

export interface SkillEntry {
  key: string;
  content: string;
}

export interface SkillSnapshotContext {
  config: Record<string, unknown>;
}

/**
 * Return the skill snapshot for anthropic_api. Reports mode "system-prompt-injected"
 * because skills are injected as text into the system prompt at execute time.
 * The desiredSkills list reflects what the agent wants injected.
 */
export function getSkillSnapshot(ctx: SkillSnapshotContext): AdapterSkillSnapshot {
  const systemPromptSkills = extractSystemPromptSkills(ctx.config);

  return {
    adapterType: ADAPTER_TYPE,
    supported: true,
    mode: "system-prompt-injected",
    desiredSkills: systemPromptSkills,
    entries: [],
    warnings:
      systemPromptSkills.length > 0
        ? [
            `Skills [${systemPromptSkills.join(", ")}] will be injected into the system prompt. ` +
              "Anthropic API does not support native skill file sync — contents are inlined as text.",
          ]
        : [],
  };
}

/**
 * Append skill contents to a base system prompt. Each skill is separated by a
 * section header so the LLM can parse individual skills from the combined context.
 */
export function injectSkillsIntoSystemPrompt(basePrompt: string, skills: SkillEntry[]): string {
  if (skills.length === 0) return basePrompt;
  const sections = skills.map((skill) => `\n\n---\n## Skill: ${skill.key}\n\n${skill.content}`);
  return `${basePrompt}${sections.join("")}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function extractSystemPromptSkills(config: Record<string, unknown>): string[] {
  const raw = config.systemPromptSkills;
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim());
}
