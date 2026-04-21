/**
 * Agent YAML export/import logic (Phase O.3).
 *
 * Exports a set of agents as a YAML document capturing SOUL.md content,
 * adapter type+model+config (minus secrets), skills, and reporting lines.
 * Enables "clone my fleet for a client" and git-versioned agent configs.
 *
 * Security invariant: API keys, tokens, and any secret-looking value are
 * stripped from adapterConfig before serialization. Only adapter type,
 * model identifier, and non-secret config survive into the YAML.
 */

import { z } from "zod";
import { unprocessable } from "../errors.js";
import { parseYamlFrontmatter } from "./company-portability-shared.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Caller-supplied shape for one agent being exported. */
export interface AgentYamlExportInput {
  idHint: string;
  name: string;
  role: string;
  title: string | null;
  adapterType: string;
  adapterConfig: Record<string, unknown>;
  /** id_hint of the manager, or null for top-level agents. */
  reportsTo: string | null;
  skills: string[];
  soul: string;
}

// ── Secret stripping ──────────────────────────────────────────────────────────

/**
 * Field-name patterns that unambiguously indicate a secret value.
 * Matched against lowercased key names (exact or suffix match).
 *
 * Why a blocklist rather than allowlist: adapter configs are extensible and
 * the set of non-secret fields is unbounded; secret field names are small and stable.
 */
const SECRET_FIELD_PATTERNS = [
  "apikey",
  "apisecret",
  "accesstoken",
  "secretkey",
  "secret",
  "password",
  "passwd",
  "token",
  "credential",
  "privatekey",
  "clientsecret",
  "authtoken",
  "authorization",
  "bearertoken",
] as const;

function isSecretFieldName(key: string): boolean {
  const lower = key.toLowerCase();
  return SECRET_FIELD_PATTERNS.some((pattern) => lower === pattern || lower.endsWith(pattern));
}

/**
 * Recursively strips secret-looking fields from an adapter config object.
 * Returns a new object; never mutates the input.
 */
export function stripSecretsFromAdapterConfig(config: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (isSecretFieldName(key)) continue;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      result[key] = stripSecretsFromAdapterConfig(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ── YAML serialization ────────────────────────────────────────────────────────

/**
 * Serialize a scalar value for inline YAML use.
 *
 * Plain alphanumeric/dash/underscore/dot identifiers are written unquoted
 * for readability. All other strings are JSON-encoded to safely handle
 * special characters, colons, quotes, and embedded newlines.
 */
function yamlScalar(value: string | number | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  // Plain identifier: safe to write unquoted
  if (/^[a-zA-Z0-9_\-./]+$/.test(value)) return value;
  return JSON.stringify(value);
}

/**
 * Serialize a multi-line string (e.g. SOUL content) as a JSON-quoted scalar
 * so that the existing `parseYamlScalar` engine can round-trip it faithfully.
 *
 * Block literal (`|`) syntax would be cleaner in the file but requires a
 * more complex parser. JSON encoding keeps us on the existing parser path.
 */
function yamlMultilineString(value: string): string {
  return JSON.stringify(value);
}

/**
 * Serialize an array of strings as a compact YAML list.
 * Returns the literal "[]" for empty arrays, otherwise one `- item` per line.
 */
function yamlStringList(items: string[], baseIndent: string): string {
  if (items.length === 0) return "[]";
  return `\n${items.map((item) => `${baseIndent}  - ${yamlScalar(item)}`).join("\n")}`;
}

/**
 * Serialize a plain object as indented YAML key-value pairs.
 * Nested objects/arrays are JSON-encoded to keep the format simple.
 */
function yamlInlineConfig(config: Record<string, unknown>, baseIndent: string): string {
  const entries = Object.entries(config);
  if (entries.length === 0) return "{}";
  const lines = entries.map(([k, v]) => {
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      return `${baseIndent}  ${k}: ${JSON.stringify(v)}`;
    }
    if (Array.isArray(v)) {
      return `${baseIndent}  ${k}: ${JSON.stringify(v)}`;
    }
    return `${baseIndent}  ${k}: ${yamlScalar(v as string | number | boolean | null)}`;
  });
  return `\n${lines.join("\n")}`;
}

/**
 * Build a YAML document from a list of export inputs.
 *
 * The comment block at the top documents the secret-stripping guarantee
 * so consumers reading the file understand why keys are absent.
 */
export function buildAgentYamlDocument(agentList: AgentYamlExportInput[]): string {
  const exportedAt = new Date().toISOString();
  const lines: string[] = [
    "# Agent YAML export",
    "# IMPORTANT: API keys, tokens, and other credentials are intentionally",
    "# omitted from this file. Only adapter type, model, and non-secret config",
    "# fields are exported. Credentials must be re-configured after import.",
    `version: 1`,
    `exported_at: ${exportedAt}`,
    `agents:`,
  ];

  for (const agent of agentList) {
    const strippedConfig = stripSecretsFromAdapterConfig(agent.adapterConfig);

    // Extract model from config if present (commonly stored as adapterConfig.model)
    const model =
      typeof strippedConfig.model === "string"
        ? strippedConfig.model
        : typeof strippedConfig.defaultModel === "string"
          ? strippedConfig.defaultModel
          : null;

    // Build config block excluding the model key (promoted to adapter.model)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { model: _modelField, defaultModel: _defaultModelField, ...restConfig } = strippedConfig;

    lines.push(`  - id_hint: ${yamlScalar(agent.idHint)}`);
    lines.push(`    name: ${yamlMultilineString(agent.name)}`);
    lines.push(`    role: ${yamlScalar(agent.role)}`);
    if (agent.title !== null) {
      lines.push(`    title: ${yamlMultilineString(agent.title)}`);
    }
    lines.push(`    soul: ${yamlMultilineString(agent.soul)}`);
    lines.push(`    adapter:`);
    lines.push(`      type: ${yamlScalar(agent.adapterType)}`);
    if (model !== null) {
      lines.push(`      model: ${yamlScalar(model)}`);
    }
    const configEntries = Object.entries(restConfig);
    if (configEntries.length > 0) {
      lines.push(`      config:${yamlInlineConfig(restConfig, "      ")}`);
    }
    const skillsList = yamlStringList(agent.skills, "    ");
    lines.push(`    skills:${skillsList}`);
    const reportsTo = agent.reportsTo !== null ? yamlScalar(agent.reportsTo) : "null";
    lines.push(`    reports_to: ${reportsTo}`);
  }

  return `${lines.join("\n")}\n`;
}

// ── Zod schema for parsed YAML ────────────────────────────────────────────────

const agentYamlAdapterSchema = z.object({
  type: z.string().min(1, "adapter.type is required"),
  model: z.string().min(1).nullable().optional(),
  config: z.record(z.unknown()).optional().default({}),
});

const agentYamlEntrySchema = z.object({
  id_hint: z.string().min(1, "id_hint is required"),
  name: z.string().min(1, "name is required"),
  role: z.string().min(1).optional().default("general"),
  title: z.string().nullable().optional(),
  soul: z.string().optional().default(""),
  adapter: agentYamlAdapterSchema,
  skills: z.array(z.string().min(1)).optional().default([]),
  reports_to: z.string().nullable().optional().default(null),
});

const agentYamlDocumentSchema = z.object({
  version: z.literal(1, { errorMap: () => ({ message: "version must be 1" }) }),
  exported_at: z.string().optional(),
  agents: z.array(agentYamlEntrySchema).min(1, "agents list must not be empty"),
});

export type AgentYamlEntry = z.infer<typeof agentYamlEntrySchema>;
export type AgentYamlDocument = z.infer<typeof agentYamlDocumentSchema>;

// ── YAML deserialization ──────────────────────────────────────────────────────

/**
 * Parse a YAML string produced by `buildAgentYamlDocument` (or compatible
 * hand-authored files) and validate with Zod.
 *
 * The parser reuses the existing `parseYamlFrontmatter` engine from
 * company-portability-shared. That engine handles flat key-value pairs
 * at each nesting level and JSON-encoded values.
 *
 * Throws with a descriptive message on validation failure.
 */
export function parseAgentYamlDocument(raw: string): AgentYamlDocument {
  // Strip comment lines before parsing
  const stripped = raw
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");

  let parsed: Record<string, unknown>;
  try {
    parsed = parseYamlFrontmatter(stripped);
  } catch (err) {
    throw unprocessable(`Invalid YAML: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Post-process agent entries: normalize adapter.config JSON-encoded strings
  const rawAgents = parsed.agents;
  if (Array.isArray(rawAgents)) {
    parsed = {
      ...parsed,
      agents: rawAgents.map((entry) => normalizeAgentEntry(entry)),
    };
  }

  const result = agentYamlDocumentSchema.safeParse(parsed);
  if (!result.success) {
    const firstError = result.error.errors[0];
    const field = firstError?.path.join(".") ?? "unknown";
    const msg = firstError?.message ?? "Validation failed";
    throw unprocessable(`Invalid agent YAML at '${field}': ${msg}`);
  }

  return result.data;
}

/**
 * Normalize a raw parsed agent entry into the shape Zod expects.
 * Decodes any JSON-encoded string values within adapter.config back to
 * their original object/array types.
 */
function normalizeAgentEntry(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return raw;
  }
  const entry = raw as Record<string, unknown>;

  const adapter = entry.adapter;
  if (typeof adapter === "object" && adapter !== null && !Array.isArray(adapter)) {
    const adapterRecord = adapter as Record<string, unknown>;
    const config = adapterRecord.config;
    if (typeof config === "object" && config !== null && !Array.isArray(config)) {
      const configRecord = config as Record<string, unknown>;
      const normalizedConfig: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(configRecord)) {
        normalizedConfig[k] = tryDecodeJsonString(v);
      }
      return {
        ...entry,
        adapter: { ...adapterRecord, config: normalizedConfig },
      };
    }
  }

  return entry;
}

function tryDecodeJsonString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // not JSON, return as-is
    }
  }
  return value;
}

// ── Import validation helpers ─────────────────────────────────────────────────

/**
 * Validate that all `reports_to` references within an import document either
 * resolve to another agent in the document or are null.
 *
 * Returns the list of broken reference strings (empty = valid).
 */
export function findBrokenReportsToRefs(agentEntries: AgentYamlEntry[], existingIdHints: Set<string>): string[] {
  const docHints = new Set(agentEntries.map((a) => a.id_hint));
  const broken: string[] = [];
  for (const agent of agentEntries) {
    const ref = agent.reports_to;
    if (!ref) continue;
    if (docHints.has(ref) || existingIdHints.has(ref)) continue;
    broken.push(`${agent.id_hint} -> ${ref}`);
  }
  return broken;
}
