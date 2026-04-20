/**
 * Skill management for openai_api adapter.
 *
 * OpenAI's HTTP API is stateless — it cannot sync skill files to disk like CLI adapters.
 * The skill sync mode is "unsupported" (R18 mitigation: honest reporting to IronWorks).
 *
 * Skills listed in config.systemPromptSkills are injected as text into the system prompt
 * at execute time. This module provides the snapshot + injection helpers.
 */

import type { AdapterSkillSnapshot } from "@ironworksai/adapter-utils";

const ADAPTER_TYPE = "openai_api";

export interface SkillEntry {
  key: string;
  content: string;
}

export interface SkillSnapshotContext {
  config: Record<string, unknown>;
}

/**
 * Return the skill snapshot for openai_api. Always reports mode "unsupported" because
 * the HTTP API cannot receive skill files; desiredSkills reflects what the agent wants
 * injected into the system prompt instead.
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
              "OpenAI API does not support native skill file sync — contents are inlined as text.",
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
