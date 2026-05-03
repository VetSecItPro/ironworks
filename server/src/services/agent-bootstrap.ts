import type { Db } from "@ironworksai/db";
import { autoJoinAgentChannels } from "./channels.js";
import {
  loadDefaultAgentInstructionsBundle,
  resolveDefaultAgentInstructionsBundleRole,
} from "./default-agent-instructions.js";
import type { accessService, agentInstructionsService, agentService } from "./index.js";
import { ensureLibraryAgentFolder } from "./playbook-execution.js";

// Adapter types whose new agents get a managed AGENTS.md/SOUL.md/HEARTBEAT.md/TOOLS.md
// bundle materialized to disk on creation. Mirrors the table inside agentRoutes; kept
// here so the onboard orchestrator can apply the same policy without reaching into
// the route module.
const DEFAULT_MANAGED_INSTRUCTIONS_ADAPTER_TYPES = new Set([
  "claude_local",
  "codex_local",
  "gemini_local",
  "opencode_local",
  "cursor",
  "pi_local",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type AgentInstructionsSvc = ReturnType<typeof agentInstructionsService>;
type AgentSvc = ReturnType<typeof agentService>;
type AccessSvc = ReturnType<typeof accessService>;

export type MaterializeAgentLike = {
  id: string;
  companyId: string;
  name: string;
  role: string;
  adapterType: string;
  adapterConfig: unknown;
};

/**
 * Write the default 4-file managed instructions bundle to the agent's workspace
 * and update its adapterConfig to point at the materialized root. Skips when the
 * adapter type doesn't manage instructions on disk, or when the caller already
 * supplied an explicit bundle config (so we don't clobber custom paths).
 */
export async function materializeDefaultInstructionsBundleForNewAgent<T extends MaterializeAgentLike>(
  agent: T,
  deps: { agents: AgentSvc; instructions: AgentInstructionsSvc },
): Promise<T> {
  if (!DEFAULT_MANAGED_INSTRUCTIONS_ADAPTER_TYPES.has(agent.adapterType)) {
    return agent;
  }

  const adapterConfig = asRecord(agent.adapterConfig) ?? {};
  const hasExplicitInstructionsBundle =
    Boolean(asNonEmptyString(adapterConfig.instructionsBundleMode)) ||
    Boolean(asNonEmptyString(adapterConfig.instructionsRootPath)) ||
    Boolean(asNonEmptyString(adapterConfig.instructionsEntryFile)) ||
    Boolean(asNonEmptyString(adapterConfig.instructionsFilePath)) ||
    Boolean(asNonEmptyString(adapterConfig.agentsMdPath));
  if (hasExplicitInstructionsBundle) {
    return agent;
  }

  const promptTemplate = typeof adapterConfig.promptTemplate === "string" ? adapterConfig.promptTemplate : "";
  const files =
    promptTemplate.trim().length === 0
      ? await loadDefaultAgentInstructionsBundle(resolveDefaultAgentInstructionsBundleRole(agent.role))
      : { "AGENTS.md": promptTemplate };
  const materialized = await deps.instructions.materializeManagedBundle(agent, files, {
    entryFile: "AGENTS.md",
    replaceExisting: false,
  });
  const nextAdapterConfig = { ...materialized.adapterConfig };
  delete nextAdapterConfig.promptTemplate;

  const updated = await deps.agents.update(agent.id, { adapterConfig: nextAdapterConfig });
  return (updated as T | null) ?? { ...agent, adapterConfig: nextAdapterConfig };
}

/**
 * Grant the new agent the standard tasks:assign permission via the access service.
 * Mirrors the inline closure that previously lived in agents route setup; lifted so
 * the onboard orchestrator can apply identical post-create permissions without
 * duplicating the call sequence.
 */
export async function applyDefaultAgentTaskAssignGrant(
  companyId: string,
  agentId: string,
  grantedByUserId: string | null,
  deps: { access: AccessSvc },
): Promise<void> {
  await deps.access.ensureMembership(companyId, "agent", agentId, "member", "active");
  await deps.access.setPrincipalPermission(companyId, "agent", agentId, "tasks:assign", true, grantedByUserId);
}

/**
 * Run all four post-create embellishments for a freshly created agent in the
 * tolerant pattern: each step is independently try/catch'd so a single
 * filesystem or permission failure cannot defeat the others. Caller still owns
 * the DB transaction commit; this runs strictly after.
 */
export async function applyAgentPostCreateEmbellishments(
  agent: MaterializeAgentLike,
  options: {
    db: Db;
    agents: AgentSvc;
    access: AccessSvc;
    instructions: AgentInstructionsSvc;
    grantedByUserId: string | null;
    department?: string;
    logger: { warn: (obj: unknown, msg?: string) => void };
  },
): Promise<MaterializeAgentLike> {
  let current: MaterializeAgentLike = agent;
  try {
    current = await materializeDefaultInstructionsBundleForNewAgent(agent, {
      agents: options.agents,
      instructions: options.instructions,
    });
  } catch (err) {
    options.logger.warn(
      { err, agentId: agent.id, companyId: agent.companyId },
      "Non-fatal: instructions bundle materialization failed",
    );
  }
  try {
    await applyDefaultAgentTaskAssignGrant(agent.companyId, agent.id, options.grantedByUserId, {
      access: options.access,
    });
  } catch (err) {
    options.logger.warn(
      { err, agentId: agent.id, companyId: agent.companyId },
      "Non-fatal: default tasks:assign grant failed",
    );
  }
  try {
    await ensureLibraryAgentFolder(agent.companyId, current.name, options.db);
  } catch (err) {
    options.logger.warn(
      { err, agentId: agent.id, companyId: agent.companyId },
      "Non-fatal: library folder creation failed",
    );
  }
  try {
    await autoJoinAgentChannels(options.db, agent.companyId, agent.id, options.department);
  } catch (err) {
    options.logger.warn({ err, agentId: agent.id, companyId: agent.companyId }, "Non-fatal: auto-join channels failed");
  }
  return current;
}
