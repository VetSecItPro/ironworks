/**
 * Agent YAML export/import routes (Phase O.3).
 *
 * Export: POST /api/companies/:companyId/agents/export
 *   Body: { agent_ids?: string[] } OR query param ?agent_id=<uuid>
 *   Returns: YAML document (text/yaml)
 *
 * Import: POST /api/companies/:companyId/agents/import
 *   Body: { yaml: string, mode: 'create' | 'upsert' }
 *   Returns: { imported: [{ id_hint, id, action }], errors: [] }
 *
 * Both routes require owner membership or instance-admin access because
 * the export surfaces full agent prompts (SOUL content) and org structure.
 */

import { readIronworksSkillSyncPreference } from "@ironworksai/adapter-utils/server-utils";
import type { Db } from "@ironworksai/db";
import { agents as agentsTable, companyMemberships } from "@ironworksai/db";
import { and, eq, inArray } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { forbidden, notFound, unprocessable } from "../errors.js";
import { validate } from "../middleware/validate.js";
import {
  type AgentYamlEntry,
  type AgentYamlExportInput,
  buildAgentYamlDocument,
  findBrokenReportsToRefs,
  parseAgentYamlDocument,
} from "../services/agent-yaml-io.js";
import { agentInstructionsService } from "../services/index.js";
import { assertCompanyAccess } from "./authz.js";

// ── Validation schemas ────────────────────────────────────────────────────────

const exportBodySchema = z.object({
  agent_ids: z.array(z.string().uuid()).optional(),
});

const importBodySchema = z.object({
  yaml: z.string().min(1, "yaml body is required"),
  mode: z.enum(["create", "upsert"]),
});

// ── Owner check ───────────────────────────────────────────────────────────────

/**
 * Assert that the requesting board user is an owner of the company, or that
 * the actor is an instance admin or system actor.
 *
 * Stricter than `assertCanWrite` because this operation surfaces full
 * agent prompts (SOUL content) and organizational structure.
 */
async function assertOwner(req: Parameters<typeof assertCompanyAccess>[0], companyId: string, db: Db): Promise<void> {
  assertCompanyAccess(req, companyId);

  // System-level actors always pass
  if (req.actor.type === "agent") return;
  if (req.actor.type === "board" && req.actor.source === "local_implicit") return;
  if (req.actor.type === "board" && req.actor.isInstanceAdmin) return;

  if (req.actor.type !== "board" || !req.actor.userId) {
    throw forbidden("Owner access required for agent YAML export/import");
  }

  const membership = await db
    .select({ membershipRole: companyMemberships.membershipRole })
    .from(companyMemberships)
    .where(
      and(
        eq(companyMemberships.companyId, companyId),
        eq(companyMemberships.principalType, "user"),
        eq(companyMemberships.principalId, req.actor.userId),
        eq(companyMemberships.status, "active"),
      ),
    )
    .then((rows) => rows[0] ?? null);

  if (membership?.membershipRole !== "owner") {
    throw forbidden("Only company owners can export or import agent YAML");
  }
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function agentYamlRoutes(db: Db) {
  const router = Router({ mergeParams: true });
  const instructions = agentInstructionsService();

  // ── Export ────────────────────────────────────────────────────────────────

  /**
   * POST /api/companies/:companyId/agents/export
   *
   * Accepts:
   *   - Query: ?agent_id=<uuid>  (single agent)
   *   - Body: { agent_ids: string[] }  (batch)
   *   - Body: {}  (all agents in company)
   *
   * Returns YAML with Content-Disposition set for browser download.
   */
  router.post("/export", validate(exportBodySchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertOwner(req, companyId, db);

    const querySingleId = req.query.agent_id as string | undefined;
    const bodyIds = req.body.agent_ids as string[] | undefined;

    let agentIds: string[] | null = null;
    if (querySingleId) {
      agentIds = [querySingleId];
    } else if (bodyIds && bodyIds.length > 0) {
      agentIds = bodyIds;
    }

    const rows =
      agentIds !== null
        ? await db
            .select()
            .from(agentsTable)
            .where(and(eq(agentsTable.companyId, companyId), inArray(agentsTable.id, agentIds)))
        : await db.select().from(agentsTable).where(eq(agentsTable.companyId, companyId));

    if (rows.length === 0) {
      throw notFound("No agents found matching the requested IDs");
    }

    const { normalizeAgentUrlKey } = await import("@ironworksai/shared");
    const idToHint = new Map<string, string>(rows.map((r) => [r.id, normalizeAgentUrlKey(r.name) ?? r.id]));

    const exportInputs: AgentYamlExportInput[] = await Promise.all(
      rows.map(async (row) => {
        // Resolve SOUL content from the managed instructions bundle
        const { files, entryFile } = await instructions.exportFiles({
          id: row.id,
          companyId: row.companyId,
          name: row.name,
          adapterConfig: row.adapterConfig,
        });
        const soul = files[entryFile] ?? "";

        // Resolve desired skills from adapterConfig.ironworksSkillSync
        const adapterConfig =
          typeof row.adapterConfig === "object" && row.adapterConfig !== null && !Array.isArray(row.adapterConfig)
            ? (row.adapterConfig as Record<string, unknown>)
            : {};
        const { desiredSkills } = readIronworksSkillSyncPreference(adapterConfig);

        // Map the reportsTo UUID to an id_hint for portability
        const reportsToHint = row.reportsTo ? (idToHint.get(row.reportsTo) ?? row.reportsTo) : null;

        return {
          idHint: idToHint.get(row.id) ?? row.id,
          name: row.name,
          role: row.role,
          title: row.title ?? null,
          adapterType: row.adapterType,
          adapterConfig,
          reportsTo: reportsToHint,
          skills: desiredSkills,
          soul,
        };
      }),
    );

    const yaml = buildAgentYamlDocument(exportInputs);
    const filename = `agents-export-${Date.now()}.yaml`;

    res.setHeader("Content-Type", "text/yaml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(yaml);
  });

  // ── Import ────────────────────────────────────────────────────────────────

  /**
   * POST /api/companies/:companyId/agents/import
   *
   * Parses the YAML document, validates all reports_to references, and
   * inserts/upserts agents.
   *
   * `mode: 'create'` always inserts (name deduplication via normalizeAgentUrlKey).
   * `mode: 'upsert'` matches existing agents by id_hint (urlKey) and updates.
   *
   * Returns { imported: [{ id_hint, id, action }], errors: [] } on success.
   * Returns 422 if any reports_to reference cannot be resolved.
   */
  router.post("/import", validate(importBodySchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertOwner(req, companyId, db);

    const { yaml, mode } = req.body as { yaml: string; mode: "create" | "upsert" };

    // Parse + Zod-validate (throws 422 on any validation error)
    const doc = parseAgentYamlDocument(yaml);

    const { normalizeAgentUrlKey } = await import("@ironworksai/shared");
    const existingRows = await db.select().from(agentsTable).where(eq(agentsTable.companyId, companyId));

    const existingByHint = new Map<string, (typeof existingRows)[number]>(
      existingRows.map((r) => [normalizeAgentUrlKey(r.name) ?? r.id, r]),
    );

    // Validate reports_to references
    const existingHints = new Set(existingByHint.keys());
    const brokenRefs = findBrokenReportsToRefs(doc.agents, existingHints);
    if (brokenRefs.length > 0) {
      throw unprocessable(
        `Import failed: unresolvable reports_to references: ${brokenRefs.join(", ")}. ` +
          "Include the referenced agents in the same import, or ensure they already exist in the target company.",
      );
    }

    // Process agents in dependency order (managers before reports)
    const ordered = topologicalSort(doc.agents);

    const imported: Array<{ id_hint: string; id: string; action: string }> = [];
    const importedHintToId = new Map<string, string>();

    for (const entry of ordered) {
      const existing = mode === "upsert" ? (existingByHint.get(entry.id_hint) ?? null) : null;

      let reportsToId: string | null = null;
      if (entry.reports_to) {
        reportsToId = importedHintToId.get(entry.reports_to) ?? existingByHint.get(entry.reports_to)?.id ?? null;
      }

      if (existing && mode === "upsert") {
        await db
          .update(agentsTable)
          .set({
            name: entry.name,
            role: entry.role,
            title: entry.title ?? null,
            adapterType: entry.adapter.type,
            adapterConfig: buildAdapterConfig(entry),
            reportsTo: reportsToId,
            updatedAt: new Date(),
          })
          .where(eq(agentsTable.id, existing.id));

        await materializeSoul(instructions, existing, entry.soul);
        imported.push({ id_hint: entry.id_hint, id: existing.id, action: "updated" });
        importedHintToId.set(entry.id_hint, existing.id);
      } else {
        const created = await db
          .insert(agentsTable)
          .values({
            companyId,
            name: entry.name,
            role: entry.role,
            title: entry.title ?? null,
            adapterType: entry.adapter.type,
            adapterConfig: buildAdapterConfig(entry),
            reportsTo: reportsToId,
          })
          .returning()
          .then((rows) => rows[0]);

        if (!created) {
          throw unprocessable(`Failed to create agent ${entry.id_hint}`);
        }

        await materializeSoul(instructions, created, entry.soul);
        imported.push({ id_hint: entry.id_hint, id: created.id, action: "created" });
        importedHintToId.set(entry.id_hint, created.id);
        existingByHint.set(normalizeAgentUrlKey(created.name) ?? created.id, created);
      }
    }

    res.json({ imported, errors: [] });
  });

  return router;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build the adapterConfig record to persist for an imported agent.
 * Merges the adapter model back into the config object and
 * writes the desired skills into the ironworksSkillSync block.
 */
function buildAdapterConfig(entry: AgentYamlEntry): Record<string, unknown> {
  const base: Record<string, unknown> = { ...((entry.adapter.config ?? {}) as Record<string, unknown>) };
  if (entry.adapter.model) {
    base.model = entry.adapter.model;
  }
  if (entry.skills && entry.skills.length > 0) {
    base.ironworksSkillSync = { desiredSkills: entry.skills };
  }
  return base;
}

/**
 * Write the SOUL text as a managed instructions bundle for the agent.
 * No-ops if soul is empty to avoid creating empty files.
 */
async function materializeSoul(
  instructionsSvc: ReturnType<typeof agentInstructionsService>,
  agent: { id: string; companyId: string; name: string; adapterConfig: unknown },
  soul: string,
): Promise<void> {
  const body = soul.trim();
  if (!body) return;

  await instructionsSvc.materializeManagedBundle(
    {
      id: agent.id,
      companyId: agent.companyId,
      name: agent.name,
      adapterConfig:
        typeof agent.adapterConfig === "object" && agent.adapterConfig !== null && !Array.isArray(agent.adapterConfig)
          ? (agent.adapterConfig as Record<string, unknown>)
          : {},
    },
    { "AGENTS.md": body },
    { replaceExisting: true, entryFile: "AGENTS.md" },
  );
}

/**
 * Sort agents so that each agent appears after its manager.
 * Agents without a reports_to come first.
 * O(n^2) — fine for typical fleet sizes (<= 100 agents per import).
 */
function topologicalSort(agentEntries: AgentYamlEntry[]): AgentYamlEntry[] {
  const placed = new Set<string>();
  const result: AgentYamlEntry[] = [];
  let remaining = [...agentEntries];
  let pass = 0;

  while (remaining.length > 0 && pass < agentEntries.length + 1) {
    pass++;
    const next: AgentYamlEntry[] = [];
    for (const agent of remaining) {
      if (!agent.reports_to || placed.has(agent.reports_to)) {
        result.push(agent);
        placed.add(agent.id_hint);
      } else {
        next.push(agent);
      }
    }
    remaining = next;
  }

  // Any remaining agents have unresolvable intra-doc refs (caught by caller).
  result.push(...remaining);
  return result;
}
