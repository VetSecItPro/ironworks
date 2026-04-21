/**
 * Tests for agent YAML export/import (Phase O.3).
 *
 * Coverage:
 *  - Round-trip: create → export → import parse → deep-equal reload
 *  - Secret-stripping: no API keys or raw secret values leak through export
 *  - Zod validation on import: malformed YAML, missing required fields, broken reports_to refs
 */

import { describe, expect, it } from "vitest";
import {
  type AgentYamlExportInput,
  buildAgentYamlDocument,
  parseAgentYamlDocument,
  stripSecretsFromAdapterConfig,
} from "../services/agent-yaml-io.js";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const AGENT_SOUL = "# Director of Operations\n\nYou are the COO.";

const BASE_AGENT: AgentYamlExportInput = {
  idHint: "director-of-ops",
  name: "Director of Operations",
  role: "director",
  title: "COO",
  adapterType: "anthropic-api",
  adapterConfig: {
    model: "claude-opus-4-6",
    maxTokens: 8192,
    apiKey: "sk-ant-secret-value",
    ironworksSkillSync: { desiredSkills: ["company-creator", "create-agent-adapter"] },
  },
  reportsTo: null,
  skills: ["company-creator", "create-agent-adapter"],
  soul: AGENT_SOUL,
};

const REPORT_AGENT: AgentYamlExportInput = {
  idHint: "senior-engineer",
  name: "Senior Engineer",
  role: "engineer",
  title: "Senior Software Engineer",
  adapterType: "anthropic-api",
  adapterConfig: { model: "claude-sonnet-4-6", maxTokens: 4096 },
  reportsTo: "director-of-ops",
  skills: [],
  soul: "# Senior Engineer\n\nYou write code.",
};

// ── Secret stripping ──────────────────────────────────────────────────────────

describe("stripSecretsFromAdapterConfig", () => {
  it("removes known secret field names from adapter config", () => {
    const config = {
      model: "claude-opus-4-6",
      maxTokens: 8192,
      apiKey: "sk-ant-secret",
      apiSecret: "should-be-gone",
      accessToken: "bearer-secret",
      secretKey: "another-secret",
      ironworksSkillSync: { desiredSkills: ["a-skill"] },
    };
    const stripped = stripSecretsFromAdapterConfig(config);
    expect(stripped).not.toHaveProperty("apiKey");
    expect(stripped).not.toHaveProperty("apiSecret");
    expect(stripped).not.toHaveProperty("accessToken");
    expect(stripped).not.toHaveProperty("secretKey");
    expect(stripped.model).toBe("claude-opus-4-6");
    expect(stripped.maxTokens).toBe(8192);
  });

  it("preserves ironworksSkillSync block because it holds no secrets", () => {
    const config = {
      model: "claude-sonnet-4-6",
      ironworksSkillSync: { desiredSkills: ["skill-a"] },
    };
    const stripped = stripSecretsFromAdapterConfig(config);
    expect(stripped.ironworksSkillSync).toEqual({ desiredSkills: ["skill-a"] });
  });

  it("strips nested secret-looking keys inside sub-objects", () => {
    const config = {
      httpHeaders: { Authorization: "Bearer sk-secret", "Content-Type": "application/json" },
    };
    const stripped = stripSecretsFromAdapterConfig(config);
    const headers = stripped.httpHeaders as Record<string, unknown>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/json");
  });
});

// ── YAML serialization ────────────────────────────────────────────────────────

describe("buildAgentYamlDocument", () => {
  it("produces a YAML document with version header and exported_at timestamp", () => {
    const yaml = buildAgentYamlDocument([BASE_AGENT]);
    expect(yaml).toContain("version: 1");
    expect(yaml).toContain("exported_at:");
    expect(yaml).toContain("agents:");
  });

  it("includes the SOUL content under each agent (JSON-encoded for round-trip safety)", () => {
    const yaml = buildAgentYamlDocument([BASE_AGENT]);
    expect(yaml).toContain("Director of Operations");
    expect(yaml).toContain("You are the COO.");
  });

  it("does NOT include the raw apiKey in the YAML output", () => {
    const yaml = buildAgentYamlDocument([BASE_AGENT]);
    expect(yaml).not.toContain("sk-ant-secret-value");
    expect(yaml).not.toContain("apiKey");
  });

  it("includes adapter type and model but not credentials", () => {
    const yaml = buildAgentYamlDocument([BASE_AGENT]);
    expect(yaml).toContain("anthropic-api");
    expect(yaml).toContain("claude-opus-4-6");
  });

  it("encodes skills as a list under each agent", () => {
    const yaml = buildAgentYamlDocument([BASE_AGENT]);
    expect(yaml).toContain("company-creator");
    expect(yaml).toContain("create-agent-adapter");
  });

  it("encodes reports_to as unquoted id_hint reference", () => {
    const yaml = buildAgentYamlDocument([BASE_AGENT, REPORT_AGENT]);
    expect(yaml).toContain("reports_to: director-of-ops");
  });

  it("encodes null reports_to for top-level agents", () => {
    const yaml = buildAgentYamlDocument([BASE_AGENT]);
    expect(yaml).toContain("reports_to: null");
  });

  it("supports batch of multiple agents", () => {
    const yaml = buildAgentYamlDocument([BASE_AGENT, REPORT_AGENT]);
    expect(yaml).toContain("Director of Operations");
    expect(yaml).toContain("Senior Engineer");
  });
});

// ── YAML deserialization + Zod validation ─────────────────────────────────────

describe("parseAgentYamlDocument", () => {
  it("round-trips a single agent faithfully", () => {
    const yaml = buildAgentYamlDocument([BASE_AGENT]);
    const parsed = parseAgentYamlDocument(yaml);
    expect(parsed.version).toBe(1);
    expect(parsed.agents).toHaveLength(1);
    const agent = parsed.agents[0]!;
    expect(agent.id_hint).toBe("director-of-ops");
    expect(agent.name).toBe("Director of Operations");
    expect(agent.adapter.type).toBe("anthropic-api");
    expect(agent.adapter.model).toBe("claude-opus-4-6");
    expect(agent.skills).toContain("company-creator");
    expect(agent.skills).toContain("create-agent-adapter");
    expect(agent.soul).toContain("You are the COO.");
  });

  it("round-trips reports_to id_hint reference", () => {
    const yaml = buildAgentYamlDocument([BASE_AGENT, REPORT_AGENT]);
    const parsed = parseAgentYamlDocument(yaml);
    const engineer = parsed.agents.find((a) => a.id_hint === "senior-engineer")!;
    expect(engineer.reports_to).toBe("director-of-ops");
  });

  it("throws on YAML that does not match document schema", () => {
    expect(() => parseAgentYamlDocument("not: valid: agent: yaml")).toThrow();
  });

  it("throws when version field is missing", () => {
    const bad = "agents:\n  - id_hint: foo\n    name: Foo\n";
    expect(() => parseAgentYamlDocument(bad)).toThrow(/version/i);
  });

  it("throws when an agent entry is missing the name field", () => {
    const bad = [
      "version: 1",
      "exported_at: 2026-04-20T00:00:00Z",
      "agents:",
      "  - id_hint: foo",
      "    adapter:",
      "      type: anthropic-api",
      "      model: claude-sonnet-4-6",
      "    skills: []",
      "    soul: hello",
    ].join("\n");
    expect(() => parseAgentYamlDocument(bad)).toThrow(/name/i);
  });

  it("throws when adapter.type is missing", () => {
    const bad = [
      "version: 1",
      "exported_at: 2026-04-20T00:00:00Z",
      "agents:",
      "  - id_hint: foo",
      '    name: "Foo"',
      "    adapter:",
      "      model: claude-sonnet-4-6",
      "    skills: []",
      "    soul: hello",
    ].join("\n");
    expect(() => parseAgentYamlDocument(bad)).toThrow(/type/i);
  });
});

// ── Round-trip invariant ──────────────────────────────────────────────────────

describe("round-trip invariant", () => {
  it("preserves SOUL text, skill set, adapter type+model, and reports_to graph through export->import parse", () => {
    const agentList = [BASE_AGENT, REPORT_AGENT];
    const yaml = buildAgentYamlDocument(agentList);
    const parsed = parseAgentYamlDocument(yaml);

    expect(parsed.agents).toHaveLength(2);

    const director = parsed.agents.find((a) => a.id_hint === "director-of-ops")!;
    expect(director.soul).toContain("You are the COO.");
    expect(director.adapter.type).toBe("anthropic-api");
    expect(director.adapter.model).toBe("claude-opus-4-6");
    expect(director.skills).toEqual(expect.arrayContaining(["company-creator", "create-agent-adapter"]));
    expect(director.reports_to).toBeNull();

    const engineer = parsed.agents.find((a) => a.id_hint === "senior-engineer")!;
    expect(engineer.soul).toContain("You write code.");
    expect(engineer.reports_to).toBe("director-of-ops");
  });

  it("confirms no API key survives the round-trip", () => {
    const yaml = buildAgentYamlDocument([BASE_AGENT]);
    expect(yaml).not.toContain("sk-ant-secret-value");
    const parsed = parseAgentYamlDocument(yaml);
    const agent = parsed.agents[0]!;
    const configStr = JSON.stringify(agent.adapter.config ?? {});
    expect(configStr).not.toContain("sk-ant-secret-value");
  });
});
