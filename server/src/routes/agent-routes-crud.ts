import { randomUUID } from "node:crypto";
import { runClaudeLogin } from "@ironworksai/adapter-claude-local/server";
import { readIronworksSkillSyncPreference } from "@ironworksai/adapter-utils/server-utils";
import type { Db } from "@ironworksai/db";
import { agents as agentsTable, issues as issuesTable } from "@ironworksai/db";
import {
  agentSkillSyncSchema,
  createAgentKeySchema,
  DEPARTMENTS,
  type Department,
  resetAgentSessionSchema,
  testAdapterEnvironmentSchema,
  updateAgentInstructionsBundleSchema,
  updateAgentInstructionsPathSchema,
  updateAgentPermissionsSchema,
  updateAgentSchema,
  upsertAgentInstructionsFileSchema,
  wakeAgentSchema,
} from "@ironworksai/shared";
import { and, eq, sql } from "drizzle-orm";
import { Router } from "express";
import { findServerAdapter, listAdapterModels } from "../adapters/index.js";
import { unprocessable } from "../errors.js";
import { logger } from "../middleware/logger.js";
import { validate } from "../middleware/validate.js";
import { redactEventPayload } from "../redaction.js";
import {
  createEmploymentHistoryEntry,
  issueService,
  logActivity,
  syncInstructionsBundleConfigFromFilePath,
} from "../services/index.js";
import { onboardingMetrics } from "../services/performance-score.js";
import {
  listVersions as listPromptVersions,
  rollback as rollbackPromptVersion,
  snapshotPromptVersion,
} from "../services/prompt-versions.js";
import {
  buildAgentRouteContext,
  DEFAULT_INSTRUCTIONS_PATH_KEYS,
  KNOWN_INSTRUCTIONS_BUNDLE_KEYS,
  KNOWN_INSTRUCTIONS_PATH_KEYS,
} from "./agent-route-helpers.js";
import { assertBoard, assertCanWrite, assertCompanyAccess, getActorInfo } from "./authz.js";

export function agentCrudRoutes(db: Db): Router {
  const router = Router();
  const ctx = buildAgentRouteContext(db);
  const {
    svc,
    access,
    heartbeat,
    secretsSvc,
    instructions,
    companySkills,
    strictSecretsMode,
    buildAgentDetail,
    assertCanReadConfigurations,
    actorCanReadConfigurationsForCompany,
    assertCanUpdateAgent,
    assertCanReadAgent,
    normalizeAgentReference,
    asRecord,
    asNonEmptyString,
    preserveInstructionsBundleConfig,
    applyCreateDefaultsByAdapterType,
    assertAdapterConfigConstraints,
    resolveInstructionsFilePath,
    assertCanManageInstructionsPath,
    summarizeAgentUpdateDetails,
    buildUnsupportedSkillSnapshot,
    buildRuntimeSkillConfig,
    resolveDesiredSkillAssignment,
    redactAgentConfiguration,
    redactConfigRevision,
  } = ctx;

  // Per-agent wakeup rate limit: track last invocation timestamp per agent ID.
  // Requests within 60 seconds of the previous wakeup for the same agent are rejected.
  const agentLastWakeup = new Map<string, number>();
  const WAKEUP_RATE_LIMIT_MS = 60_000;

  router.param("id", async (req, _res, next, rawId) => {
    try {
      req.params.id = await normalizeAgentReference(req, String(rawId));
      next();
    } catch (err) {
      next(err);
    }
  });

  router.get("/companies/:companyId/adapters/:type/models", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const type = req.params.type as string;
    const models = await listAdapterModels(type);
    res.json(models);
  });

  router.post(
    "/companies/:companyId/adapters/:type/test-environment",
    validate(testAdapterEnvironmentSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const type = req.params.type as string;
      await assertCanReadConfigurations(req, companyId);

      const adapter = findServerAdapter(type);
      if (!adapter) {
        res.status(404).json({ error: `Unknown adapter type: ${type}` });
        return;
      }

      const inputAdapterConfig = (req.body?.adapterConfig ?? {}) as Record<string, unknown>;
      const normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
        companyId,
        inputAdapterConfig,
        { strictMode: strictSecretsMode },
      );
      const { config: runtimeAdapterConfig } = await secretsSvc.resolveAdapterConfigForRuntime(
        companyId,
        normalizedAdapterConfig,
      );

      const result = await adapter.testEnvironment({
        companyId,
        adapterType: type,
        config: runtimeAdapterConfig,
      });

      res.json(result);
    },
  );

  router.get("/agents/:id/skills", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanReadConfigurations(req, agent.companyId);

    const adapter = findServerAdapter(agent.adapterType);
    if (!adapter?.listSkills) {
      const preference = readIronworksSkillSyncPreference(agent.adapterConfig as Record<string, unknown>);
      const runtimeSkillEntries = await companySkills.listRuntimeSkillEntries(agent.companyId, {
        materializeMissing: false,
      });
      const requiredSkills = runtimeSkillEntries.filter((entry) => entry.required).map((entry) => entry.key);
      res.json(
        buildUnsupportedSkillSnapshot(
          agent.adapterType,
          Array.from(new Set([...requiredSkills, ...preference.desiredSkills])),
        ),
      );
      return;
    }

    const { config: runtimeConfig } = await secretsSvc.resolveAdapterConfigForRuntime(
      agent.companyId,
      agent.adapterConfig,
    );
    const runtimeSkillConfig = await buildRuntimeSkillConfig(agent.companyId, agent.adapterType, runtimeConfig);
    const snapshot = await adapter.listSkills({
      agentId: agent.id,
      companyId: agent.companyId,
      adapterType: agent.adapterType,
      config: runtimeSkillConfig,
    });
    res.json(snapshot);
  });

  router.post("/agents/:id/skills/sync", validate(agentSkillSyncSchema), async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanUpdateAgent(req, agent);

    const requestedSkills = Array.from(
      new Set((req.body.desiredSkills as string[]).map((value) => value.trim()).filter(Boolean)),
    );
    const {
      adapterConfig: nextAdapterConfig,
      desiredSkills,
      runtimeSkillEntries,
    } = await resolveDesiredSkillAssignment(
      agent.companyId,
      agent.adapterType,
      agent.adapterConfig as Record<string, unknown>,
      requestedSkills,
    );
    if (!desiredSkills || !runtimeSkillEntries) {
      throw unprocessable("Skill sync requires desiredSkills.");
    }
    const actor = getActorInfo(req);
    const updated = await svc.update(
      agent.id,
      {
        adapterConfig: nextAdapterConfig,
      },
      {
        recordRevision: {
          createdByAgentId: actor.agentId,
          createdByUserId: actor.actorType === "user" ? actor.actorId : null,
          source: "skill-sync",
        },
      },
    );
    if (!updated) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const adapter = findServerAdapter(updated.adapterType);
    const { config: runtimeConfig } = await secretsSvc.resolveAdapterConfigForRuntime(
      updated.companyId,
      updated.adapterConfig,
    );
    const runtimeSkillConfig = {
      ...runtimeConfig,
      ironworksRuntimeSkills: runtimeSkillEntries,
    };
    const snapshot = adapter?.syncSkills
      ? await adapter.syncSkills(
          {
            agentId: updated.id,
            companyId: updated.companyId,
            adapterType: updated.adapterType,
            config: runtimeSkillConfig,
          },
          desiredSkills,
        )
      : adapter?.listSkills
        ? await adapter.listSkills({
            agentId: updated.id,
            companyId: updated.companyId,
            adapterType: updated.adapterType,
            config: runtimeSkillConfig,
          })
        : buildUnsupportedSkillSnapshot(updated.adapterType, desiredSkills);

    await logActivity(db, {
      companyId: updated.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "agent.skills_synced",
      entityType: "agent",
      entityId: updated.id,
      agentId: actor.agentId,
      runId: actor.runId,
      details: {
        adapterType: updated.adapterType,
        desiredSkills,
        mode: snapshot.mode,
        supported: snapshot.supported,
        entryCount: snapshot.entries.length,
        warningCount: snapshot.warnings.length,
      },
    });

    res.json(snapshot);
  });

  router.get("/companies/:companyId/agent-configurations", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCanReadConfigurations(req, companyId);
    const rows = await svc.list(companyId);
    res.json(rows.map((row) => redactAgentConfiguration(row)));
  });

  router.get("/agents/me", async (req, res) => {
    if (req.actor.type !== "agent" || !req.actor.agentId) {
      res.status(401).json({ error: "Agent authentication required" });
      return;
    }
    const agent = await svc.getById(req.actor.agentId);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json(await buildAgentDetail(agent));
  });

  router.get("/agents/me/inbox-lite", async (req, res) => {
    if (req.actor.type !== "agent" || !req.actor.agentId || !req.actor.companyId) {
      res.status(401).json({ error: "Agent authentication required" });
      return;
    }

    const issuesSvc = issueService(db);
    const rows = await issuesSvc.list(req.actor.companyId, {
      assigneeAgentId: req.actor.agentId,
      status: "todo,in_progress,blocked",
    });

    res.json(
      rows.map((issue) => ({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        status: issue.status,
        priority: issue.priority,
        projectId: issue.projectId,
        goalId: issue.goalId,
        parentId: issue.parentId,
        updatedAt: issue.updatedAt,
        activeRun: issue.activeRun,
      })),
    );
  });

  /**
   * GET /api/agents/:id/inbox-lite
   * Returns minimal inbox data for the given agent (issue IDs, titles, status only).
   * Intended for the heartbeat to cheaply check active work without full payloads.
   */
  router.get("/agents/:id/inbox-lite", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, agent.companyId);

    const issuesSvc = issueService(db);
    const rows = await issuesSvc.list(agent.companyId, {
      assigneeAgentId: id,
      status: "todo,in_progress,blocked",
    });

    res.json(
      rows.map((issue) => ({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        status: issue.status,
        priority: issue.priority,
        projectId: issue.projectId,
        updatedAt: issue.updatedAt,
      })),
    );
  });

  router.get("/agents/:id", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, agent.companyId);
    if (req.actor.type === "agent" && req.actor.agentId !== id) {
      const canRead = await actorCanReadConfigurationsForCompany(req, agent.companyId);
      if (!canRead) {
        res.json(await buildAgentDetail(agent, { restricted: true }));
        return;
      }
    }
    res.json(await buildAgentDetail(agent));
  });

  router.get("/agents/:id/configuration", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanReadConfigurations(req, agent.companyId);
    res.json(redactAgentConfiguration(agent));
  });

  router.get("/agents/:id/config-revisions", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanReadConfigurations(req, agent.companyId);
    const revisions = await svc.listConfigRevisions(id);
    res.json(revisions.map((revision) => redactConfigRevision(revision)));
  });

  router.get("/agents/:id/config-revisions/:revisionId", async (req, res) => {
    const id = req.params.id as string;
    const revisionId = req.params.revisionId as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanReadConfigurations(req, agent.companyId);
    const revision = await svc.getConfigRevision(id, revisionId);
    if (!revision) {
      res.status(404).json({ error: "Revision not found" });
      return;
    }
    res.json(redactConfigRevision(revision));
  });

  router.post("/agents/:id/config-revisions/:revisionId/rollback", async (req, res) => {
    const id = req.params.id as string;
    const revisionId = req.params.revisionId as string;
    // SEC: config rollback is a privilege boundary — agents must not mutate their own (or peer agents') configs
    if (req.actor.type === "agent") {
      res.status(403).json({ error: "Agents cannot mutate agent config history; use a human-actor session." });
      return;
    }
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanUpdateAgent(req, existing);

    const actor = getActorInfo(req);
    const updated = await svc.rollbackConfigRevision(id, revisionId, {
      agentId: actor.agentId,
      userId: actor.actorType === "user" ? actor.actorId : null,
    });
    if (!updated) {
      res.status(404).json({ error: "Revision not found" });
      return;
    }

    await logActivity(db, {
      companyId: updated.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.config_rolled_back",
      entityType: "agent",
      entityId: updated.id,
      details: { revisionId },
    });

    res.json(updated);
  });

  router.get("/agents/:id/runtime-state", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, agent.companyId);

    const state = await heartbeat.getRuntimeState(id);
    res.json(state);
  });

  router.get("/agents/:id/onboarding-metrics", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, agent.companyId);
    const metrics = await onboardingMetrics(db, id);
    res.json(metrics);
  });

  router.get("/agents/:id/task-sessions", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, agent.companyId);

    const sessions = await heartbeat.listTaskSessions(id);
    res.json(
      sessions.map((session) => ({
        ...session,
        sessionParamsJson: redactEventPayload(session.sessionParamsJson ?? null),
      })),
    );
  });

  router.post("/agents/:id/runtime-state/reset-session", validate(resetAgentSessionSchema), async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanWrite(req, agent.companyId, db);

    const taskKey =
      typeof req.body.taskKey === "string" && req.body.taskKey.trim().length > 0 ? req.body.taskKey.trim() : null;
    const state = await heartbeat.resetRuntimeSession(id, { taskKey });

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "agent.runtime_session_reset",
      entityType: "agent",
      entityId: id,
      details: { taskKey: taskKey ?? null },
    });

    res.json(state);
  });

  router.patch("/agents/:id/permissions", validate(updateAgentPermissionsSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanWrite(req, existing.companyId, db);

    if (req.actor.type === "agent") {
      const actorAgent = req.actor.agentId ? await svc.getById(req.actor.agentId) : null;
      if (!actorAgent || actorAgent.companyId !== existing.companyId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (actorAgent.role !== "ceo") {
        res.status(403).json({ error: "Only CEO can manage permissions" });
        return;
      }
    }

    const agent = await svc.updatePermissions(id, req.body);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const effectiveCanAssignTasks =
      agent.role === "ceo" || Boolean(agent.permissions?.canCreateAgents) || req.body.canAssignTasks;
    await access.ensureMembership(agent.companyId, "agent", agent.id, "member", "active");
    await access.setPrincipalPermission(
      agent.companyId,
      "agent",
      agent.id,
      "tasks:assign",
      effectiveCanAssignTasks,
      req.actor.type === "board" ? (req.actor.userId ?? null) : null,
    );

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.permissions_updated",
      entityType: "agent",
      entityId: agent.id,
      details: {
        canCreateAgents: agent.permissions?.canCreateAgents ?? false,
        canAssignTasks: effectiveCanAssignTasks,
      },
    });

    res.json(await buildAgentDetail(agent));
  });

  router.patch("/agents/:id/instructions-path", validate(updateAgentInstructionsPathSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await assertCanManageInstructionsPath(req, existing);

    const existingAdapterConfig = asRecord(existing.adapterConfig) ?? {};
    const explicitKey = asNonEmptyString(req.body.adapterConfigKey);
    const defaultKey = DEFAULT_INSTRUCTIONS_PATH_KEYS[existing.adapterType] ?? null;
    const adapterConfigKey = explicitKey ?? defaultKey;
    if (!adapterConfigKey) {
      res.status(422).json({
        error: `No default instructions path key for adapter type '${existing.adapterType}'. Provide adapterConfigKey.`,
      });
      return;
    }

    const nextAdapterConfig: Record<string, unknown> = { ...existingAdapterConfig };
    if (req.body.path === null) {
      delete nextAdapterConfig[adapterConfigKey];
    } else {
      nextAdapterConfig[adapterConfigKey] = resolveInstructionsFilePath(req.body.path, existingAdapterConfig);
    }

    const syncedAdapterConfig = syncInstructionsBundleConfigFromFilePath(existing, nextAdapterConfig);
    const normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
      existing.companyId,
      syncedAdapterConfig,
      { strictMode: strictSecretsMode },
    );
    const actor = getActorInfo(req);
    const agent = await svc.update(
      id,
      { adapterConfig: normalizedAdapterConfig },
      {
        recordRevision: {
          createdByAgentId: actor.agentId,
          createdByUserId: actor.actorType === "user" ? actor.actorId : null,
          source: "instructions_path_patch",
        },
      },
    );
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const updatedAdapterConfig = asRecord(agent.adapterConfig) ?? {};
    const pathValue = asNonEmptyString(updatedAdapterConfig[adapterConfigKey]);

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.instructions_path_updated",
      entityType: "agent",
      entityId: agent.id,
      details: {
        adapterConfigKey,
        path: pathValue,
        cleared: req.body.path === null,
      },
    });

    res.json({
      agentId: agent.id,
      adapterType: agent.adapterType,
      adapterConfigKey,
      path: pathValue,
    });
  });

  router.get("/agents/:id/instructions-bundle", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanReadAgent(req, existing);
    res.json(await instructions.getBundle(existing));
  });

  router.patch("/agents/:id/instructions-bundle", validate(updateAgentInstructionsBundleSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanManageInstructionsPath(req, existing);

    const actor = getActorInfo(req);
    const { bundle, adapterConfig } = await instructions.updateBundle(existing, req.body);
    const normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
      existing.companyId,
      adapterConfig,
      { strictMode: strictSecretsMode },
    );
    await svc.update(
      id,
      { adapterConfig: normalizedAdapterConfig },
      {
        recordRevision: {
          createdByAgentId: actor.agentId,
          createdByUserId: actor.actorType === "user" ? actor.actorId : null,
          source: "instructions_bundle_patch",
        },
      },
    );

    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.instructions_bundle_updated",
      entityType: "agent",
      entityId: existing.id,
      details: {
        mode: bundle.mode,
        rootPath: bundle.rootPath,
        entryFile: bundle.entryFile,
        clearLegacyPromptTemplate: req.body.clearLegacyPromptTemplate === true,
      },
    });

    res.json(bundle);
  });

  router.get("/agents/:id/instructions-bundle/file", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanReadAgent(req, existing);

    const relativePath = typeof req.query.path === "string" ? req.query.path : "";
    if (!relativePath.trim()) {
      res.status(422).json({ error: "Query parameter 'path' is required" });
      return;
    }

    res.json(await instructions.readFile(existing, relativePath));
  });

  router.put("/agents/:id/instructions-bundle/file", validate(upsertAgentInstructionsFileSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanManageInstructionsPath(req, existing);

    const actor = getActorInfo(req);
    const result = await instructions.writeFile(existing, req.body.path, req.body.content, {
      clearLegacyPromptTemplate: req.body.clearLegacyPromptTemplate,
    });
    const normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
      existing.companyId,
      result.adapterConfig,
      { strictMode: strictSecretsMode },
    );
    await svc.update(
      id,
      { adapterConfig: normalizedAdapterConfig },
      {
        recordRevision: {
          createdByAgentId: actor.agentId,
          createdByUserId: actor.actorType === "user" ? actor.actorId : null,
          source: "instructions_bundle_file_put",
        },
      },
    );

    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.instructions_file_updated",
      entityType: "agent",
      entityId: existing.id,
      details: {
        path: result.file.path,
        size: result.file.size,
        clearLegacyPromptTemplate: req.body.clearLegacyPromptTemplate === true,
      },
    });

    res.json(result.file);
  });

  router.delete("/agents/:id/instructions-bundle/file", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanManageInstructionsPath(req, existing);

    const relativePath = typeof req.query.path === "string" ? req.query.path : "";
    if (!relativePath.trim()) {
      res.status(422).json({ error: "Query parameter 'path' is required" });
      return;
    }

    const actor = getActorInfo(req);
    const result = await instructions.deleteFile(existing, relativePath);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.instructions_file_deleted",
      entityType: "agent",
      entityId: existing.id,
      details: {
        path: relativePath,
      },
    });

    res.json(result.bundle);
  });

  router.patch("/agents/:id", validate(updateAgentSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanUpdateAgent(req, existing);

    if (Object.hasOwn(req.body, "permissions")) {
      res.status(422).json({ error: "Use /api/agents/:id/permissions for permission changes" });
      return;
    }

    // SEC-AUTH-001: Allowlist mutable fields to prevent mass assignment
    const ALLOWED_PATCH_FIELDS = new Set([
      "name",
      "role",
      "title",
      "icon",
      "reportsTo",
      "capabilities",
      "adapterType",
      "adapterConfig",
      "runtimeConfig",
      "replaceAdapterConfig",
      "budgetMonthlyCents",
      "status",
      "soulMd",
      "agentsMd",
      "department",
      "performanceScore",
      "systemPrompt",
      "agentInstructions",
    ]);
    const rawBody = req.body as Record<string, unknown>;
    const patchData: Record<string, unknown> = {};
    for (const key of Object.keys(rawBody)) {
      if (ALLOWED_PATCH_FIELDS.has(key)) patchData[key] = rawBody[key];
    }
    const replaceAdapterConfig = patchData.replaceAdapterConfig === true;
    delete patchData.replaceAdapterConfig;

    // Validate department if provided
    if (Object.hasOwn(patchData, "department") && patchData.department !== null) {
      if (typeof patchData.department !== "string" || !DEPARTMENTS.includes(patchData.department as Department)) {
        res.status(422).json({ error: `Invalid department. Must be one of: ${DEPARTMENTS.join(", ")}` });
        return;
      }
    }

    // Validate performanceScore if provided
    if (Object.hasOwn(patchData, "performanceScore") && patchData.performanceScore !== null) {
      const score = patchData.performanceScore;
      if (typeof score !== "number" || score < 0 || score > 100 || !Number.isInteger(score)) {
        res.status(422).json({ error: "performanceScore must be an integer between 0 and 100" });
        return;
      }
    }

    if (Object.hasOwn(patchData, "adapterConfig")) {
      const adapterConfig = asRecord(patchData.adapterConfig);
      if (!adapterConfig) {
        res.status(422).json({ error: "adapterConfig must be an object" });
        return;
      }
      const changingInstructionsPath = Object.keys(adapterConfig).some((key) => KNOWN_INSTRUCTIONS_PATH_KEYS.has(key));
      if (changingInstructionsPath) {
        await assertCanManageInstructionsPath(req, existing);
      }
      patchData.adapterConfig = adapterConfig;
    }

    const requestedAdapterType =
      typeof patchData.adapterType === "string" ? patchData.adapterType : existing.adapterType;
    const touchesAdapterConfiguration =
      Object.hasOwn(patchData, "adapterType") || Object.hasOwn(patchData, "adapterConfig");
    if (touchesAdapterConfiguration) {
      const existingAdapterConfig = asRecord(existing.adapterConfig) ?? {};
      const changingAdapterType =
        typeof patchData.adapterType === "string" && patchData.adapterType !== existing.adapterType;
      const requestedAdapterConfig = Object.hasOwn(patchData, "adapterConfig")
        ? (asRecord(patchData.adapterConfig) ?? {})
        : null;
      if (
        requestedAdapterConfig &&
        replaceAdapterConfig &&
        KNOWN_INSTRUCTIONS_BUNDLE_KEYS.some(
          (key) => existingAdapterConfig[key] !== undefined && requestedAdapterConfig[key] === undefined,
        )
      ) {
        await assertCanManageInstructionsPath(req, existing);
      }
      let rawEffectiveAdapterConfig = requestedAdapterConfig ?? existingAdapterConfig;
      if (requestedAdapterConfig && !changingAdapterType && !replaceAdapterConfig) {
        rawEffectiveAdapterConfig = { ...existingAdapterConfig, ...requestedAdapterConfig };
      }
      if (changingAdapterType) {
        // Preserve adapter-agnostic keys (env, cwd, etc.) from the existing config
        // when the adapter type changes. Without this, a PATCH that includes
        // adapterConfig but omits these keys would silently drop them.
        const ADAPTER_AGNOSTIC_KEYS = [
          "env",
          "cwd",
          "timeoutSec",
          "graceSec",
          "promptTemplate",
          "bootstrapPromptTemplate",
        ] as const;
        for (const key of ADAPTER_AGNOSTIC_KEYS) {
          if (rawEffectiveAdapterConfig[key] === undefined && existingAdapterConfig[key] !== undefined) {
            rawEffectiveAdapterConfig = { ...rawEffectiveAdapterConfig, [key]: existingAdapterConfig[key] };
          }
        }
        rawEffectiveAdapterConfig = preserveInstructionsBundleConfig(existingAdapterConfig, rawEffectiveAdapterConfig);
      }
      const effectiveAdapterConfig = applyCreateDefaultsByAdapterType(requestedAdapterType, rawEffectiveAdapterConfig);
      const normalizedEffectiveAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
        existing.companyId,
        effectiveAdapterConfig,
        { strictMode: strictSecretsMode },
      );
      patchData.adapterConfig = syncInstructionsBundleConfigFromFilePath(existing, normalizedEffectiveAdapterConfig);
    }
    if (touchesAdapterConfiguration && requestedAdapterType === "opencode_local") {
      const effectiveAdapterConfig = asRecord(patchData.adapterConfig) ?? {};
      await assertAdapterConfigConstraints(existing.companyId, requestedAdapterType, effectiveAdapterConfig);
    }

    const actor = getActorInfo(req);

    // ── Prompt version snapshot (REQ-09) ──
    // Before updating systemPrompt or agentInstructions, snapshot the current values.
    const isPromptChange = Object.hasOwn(patchData, "systemPrompt") || Object.hasOwn(patchData, "agentInstructions");
    if (isPromptChange) {
      try {
        await snapshotPromptVersion(db, {
          agentId: id,
          companyId: existing.companyId,
          currentSystemPrompt: existing.systemPrompt,
          currentAgentInstructions: existing.agentInstructions,
          changedByUserId: actor.actorType === "user" ? actor.actorId : null,
          changeSummary: null,
        });
      } catch (err) {
        logger.warn({ err, agentId: id }, "failed to snapshot prompt version before update");
      }
    }

    const agent = await svc.update(id, patchData, {
      recordRevision: {
        createdByAgentId: actor.agentId,
        createdByUserId: actor.actorType === "user" ? actor.actorId : null,
        source: "patch",
      },
    });
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.updated",
      entityType: "agent",
      entityId: agent.id,
      details: summarizeAgentUpdateDetails(patchData),
    });

    // Employment history: department change
    if (Object.hasOwn(patchData, "department") && agent.department !== existing.department) {
      createEmploymentHistoryEntry(db, {
        companyId: agent.companyId,
        agentId: agent.id,
        agentName: agent.name,
        eventType: "department_change",
        details: [
          `Department changed from "${existing.department ?? "unassigned"}" to "${agent.department ?? "unassigned"}".`,
        ].join("\n"),
      }).catch((err) =>
        logger.warn({ err, agentId: agent.id }, "failed to create employment history for department change"),
      );
    }

    // Employment history: significant performance score change (>10 points)
    if (
      Object.hasOwn(patchData, "performanceScore") &&
      typeof agent.performanceScore === "number" &&
      typeof existing.performanceScore === "number" &&
      Math.abs(agent.performanceScore - existing.performanceScore) > 10
    ) {
      createEmploymentHistoryEntry(db, {
        companyId: agent.companyId,
        agentId: agent.id,
        agentName: agent.name,
        eventType: "performance_review",
        details: [
          `Performance score changed from ${existing.performanceScore} to ${agent.performanceScore}.`,
          `Change: ${agent.performanceScore - existing.performanceScore > 0 ? "+" : ""}${agent.performanceScore - existing.performanceScore} points.`,
        ].join("\n"),
      }).catch((err) =>
        logger.warn({ err, agentId: agent.id }, "failed to create employment history for performance change"),
      );
    }

    // Lifecycle transition gate: pilot -> production when 5 completed issues threshold is crossed
    void (async () => {
      try {
        const PILOT_ISSUE_THRESHOLD = 5;
        const [countRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(issuesTable)
          .where(
            and(
              eq(issuesTable.companyId, agent.companyId),
              eq(issuesTable.assigneeAgentId, agent.id),
              eq(issuesTable.status, "done"),
            ),
          );
        const completedCount = Number(countRow?.count ?? 0);

        // Check if count just crossed the threshold (i.e., agent is still in pilot stage)
        // We use the metadata field to track whether we've already fired this transition.
        const metadataAny = (agent.metadata as Record<string, unknown> | null) ?? {};
        const alreadyPromoted = metadataAny.pilotThresholdMet === true;

        if (!alreadyPromoted && completedCount >= PILOT_ISSUE_THRESHOLD) {
          // Mark transition in metadata to prevent duplicate activity entries
          await db
            .update(agentsTable)
            .set({ metadata: { ...metadataAny, pilotThresholdMet: true }, updatedAt: new Date() })
            .where(eq(agentsTable.id, agent.id));

          await logActivity(db, {
            companyId: agent.companyId,
            actorType: "system",
            actorId: agent.id,
            agentId: agent.id,
            action: "agent.lifecycle_transition",
            entityType: "agent",
            entityId: agent.id,
            details: {
              from: "pilot",
              to: "production",
              trigger: `Completed ${completedCount} issues (threshold: ${PILOT_ISSUE_THRESHOLD})`,
              message: `Agent ${agent.name} has completed ${completedCount} issues and is ready to graduate from pilot to production.`,
            },
          });
        }
      } catch (err) {
        logger.warn({ err, agentId: agent.id }, "failed to check pilot lifecycle transition");
      }
    })();

    res.json(agent);
  });

  router.get("/agents/:id/keys", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const keys = await svc.listKeys(id);
    res.json(keys);
  });

  router.post("/agents/:id/keys", validate(createAgentKeySchema), async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const existingAgent = await svc.getById(id);
    if (!existingAgent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    // SEC-AUTH-HIGH-002: viewer-write protection — minting agent API keys is a write.
    await assertCanWrite(req, existingAgent.companyId, db);
    const key = await svc.createApiKey(id, req.body.name);

    const agent = await svc.getById(id);
    if (agent) {
      await logActivity(db, {
        companyId: agent.companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "agent.key_created",
        entityType: "agent",
        entityId: agent.id,
        details: { keyId: key.id, name: key.name },
      });
    }

    res.status(201).json(key);
  });

  router.delete("/agents/:id/keys/:keyId", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const keyId = req.params.keyId as string;
    const existingAgent = await svc.getById(id);
    if (!existingAgent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    // SEC-AUTH-HIGH-002: viewer-write protection — revoking agent API keys is a write.
    await assertCanWrite(req, existingAgent.companyId, db);
    const revoked = await svc.revokeKey(keyId);
    if (!revoked) {
      res.status(404).json({ error: "Key not found" });
      return;
    }
    res.json({ ok: true });
  });

  router.post("/agents/:id/wakeup", validate(wakeAgentSchema), async (req, res) => {
    const id = req.params.id as string;

    // Per-agent rate limit: reject if invoked within WAKEUP_RATE_LIMIT_MS of last wakeup.
    const lastWakeup = agentLastWakeup.get(id);
    if (lastWakeup !== undefined && Date.now() - lastWakeup < WAKEUP_RATE_LIMIT_MS) {
      res.status(429).json({ error: "Agent was invoked recently. Please wait before invoking again." });
      return;
    }
    agentLastWakeup.set(id, Date.now());

    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanWrite(req, agent.companyId, db);

    if (req.actor.type === "agent" && req.actor.agentId !== id) {
      res.status(403).json({ error: "Agent can only invoke itself" });
      return;
    }

    const run = await heartbeat.wakeup(id, {
      source: req.body.source,
      triggerDetail: req.body.triggerDetail ?? "manual",
      reason: req.body.reason ?? null,
      payload: req.body.payload ?? null,
      idempotencyKey: req.body.idempotencyKey ?? null,
      requestedByActorType: req.actor.type === "agent" ? "agent" : "user",
      requestedByActorId: req.actor.type === "agent" ? (req.actor.agentId ?? null) : (req.actor.userId ?? null),
      contextSnapshot: {
        triggeredBy: req.actor.type,
        actorId: req.actor.type === "agent" ? req.actor.agentId : req.actor.userId,
        forceFreshSession: req.body.forceFreshSession === true,
      },
    });

    if (!run) {
      res.status(202).json({ status: "skipped" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "heartbeat.invoked",
      entityType: "heartbeat_run",
      entityId: run.id,
      details: { agentId: id },
    });

    res.status(202).json(run);
  });

  router.post("/agents/:id/heartbeat/invoke", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanWrite(req, agent.companyId, db);

    if (req.actor.type === "agent" && req.actor.agentId !== id) {
      res.status(403).json({ error: "Agent can only invoke itself" });
      return;
    }

    const run = await heartbeat.invoke(
      id,
      "on_demand",
      {
        triggeredBy: req.actor.type,
        actorId: req.actor.type === "agent" ? req.actor.agentId : req.actor.userId,
      },
      "manual",
      {
        actorType: req.actor.type === "agent" ? "agent" : "user",
        actorId: req.actor.type === "agent" ? (req.actor.agentId ?? null) : (req.actor.userId ?? null),
      },
    );

    if (!run) {
      res.status(202).json({ status: "skipped" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "heartbeat.invoked",
      entityType: "heartbeat_run",
      entityId: run.id,
      details: { agentId: id },
    });

    res.status(202).json(run);
  });

  router.post("/agents/:id/claude-login", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanWrite(req, agent.companyId, db);
    if (agent.adapterType !== "claude_local") {
      res.status(400).json({ error: "Login is only supported for claude_local agents" });
      return;
    }

    const config = asRecord(agent.adapterConfig) ?? {};
    const { config: runtimeConfig } = await secretsSvc.resolveAdapterConfigForRuntime(agent.companyId, config);
    const result = await runClaudeLogin({
      runId: `claude-login-${randomUUID()}`,
      agent: {
        id: agent.id,
        companyId: agent.companyId,
        name: agent.name,
        adapterType: agent.adapterType,
        adapterConfig: agent.adapterConfig,
      },
      config: runtimeConfig,
    });

    res.json(result);
  });

  // ── Prompt Version History (REQ-09) ──

  // GET /agents/:agentId/prompt-versions
  router.get("/agents/:agentId/prompt-versions", async (req, res) => {
    const { agentId } = req.params;
    const agentRow = await svc.getById(agentId);
    if (!agentRow) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, agentRow.companyId);

    try {
      const versions = await listPromptVersions(db, agentId);
      res.json(versions);
    } catch (err) {
      logger.error({ err, agentId }, "failed to list prompt versions");
      res.status(500).json({ error: "Failed to list prompt versions" });
    }
  });

  // POST /agents/:agentId/prompt-versions/:version/rollback
  router.post("/agents/:agentId/prompt-versions/:version/rollback", async (req, res) => {
    const { agentId, version } = req.params;
    // SEC: prompt rollback is a privilege boundary — agents must not mutate their own (or peer agents') SOULs
    if (req.actor.type === "agent") {
      res.status(403).json({ error: "Agents cannot mutate agent prompt history; use a human-actor session." });
      return;
    }
    const agentRow = await svc.getById(agentId);
    if (!agentRow) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, agentRow.companyId);
    await assertCanWrite(req, agentRow.companyId, db);

    const versionNumber = parseInt(version, 10);
    if (Number.isNaN(versionNumber) || versionNumber < 1) {
      res.status(422).json({ error: "Invalid version number" });
      return;
    }

    const actor = getActorInfo(req);
    const result = await rollbackPromptVersion(
      db,
      agentId,
      versionNumber,
      actor.actorType === "user" ? actor.actorId : undefined,
    );

    if (!result.success) {
      res.status(404).json({ error: result.error });
      return;
    }

    await logActivity(db, {
      companyId: agentRow.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.prompt_rollback",
      entityType: "agent",
      entityId: agentId,
      details: { versionNumber },
    });

    res.json({ ok: true, restoredVersion: versionNumber });
  });

  return router;
}
