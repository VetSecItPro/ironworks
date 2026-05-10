import type { Db } from "@ironworksai/db";
import { agentMemoryEntries, agents as agentsTable, companies, companySubscriptions } from "@ironworksai/db";
import {
  createAgentHireSchema,
  createAgentSchema,
  DEPARTMENTS,
  type Department,
  EMPLOYMENT_TYPES,
  type EmploymentType,
  PLAN_AGENT_LIMITS,
  TERMINATION_REASONS,
  type TerminationReason,
} from "@ironworksai/shared";
import { and, eq, sql } from "drizzle-orm";
import { Router } from "express";
import { logger } from "../middleware/logger.js";
import { validate } from "../middleware/validate.js";
import { COMMON_AGENT_PREAMBLE, ROLE_TEMPLATES } from "../onboarding-assets/role-templates.js";
import { redactEventPayload } from "../redaction.js";
import { autoJoinAgentChannels, findCompanyChannel, postMessage as postChannelMessage } from "../services/channels.js";
import {
  archiveAgentWorkspace as archiveAgentWorkspaceService,
  buildOnboardingPacket,
  createAgentWorkspace as createAgentWorkspaceService,
  createEmploymentHistoryEntry,
  createHiringRecord as createHiringRecordService,
  createTerminationRecord as createTerminationRecordService,
  issueService,
  logActivity,
} from "../services/index.js";
import { ensureLibraryAgentFolder } from "../services/playbook-execution.js";
import { buildAgentRouteContext, defaultBudgetCentsForRole } from "./agent-route-helpers.js";
import { assertBoard, assertCanWrite, assertCompanyAccess, getActorInfo } from "./authz.js";
import {
  ORG_CHART_STYLES,
  type OrgChartStyle,
  type OrgNode,
  renderOrgChartPng,
  renderOrgChartSvg,
} from "./org-chart-svg.js";

export function agentLifecycleRoutes(db: Db): Router {
  const router = Router();
  const ctx = buildAgentRouteContext(db);
  const {
    svc,
    heartbeat,
    approvalsSvc,
    issueApprovalsSvc,
    secretsSvc,
    budgets,
    strictSecretsMode,
    actorCanReadConfigurationsForCompany,
    assertCanCreateAgentsForCompany,
    applyDefaultAgentTaskAssignGrant,
    parseSourceIssueIds,
    applyCreateDefaultsByAdapterType,
    assertAdapterConfigConstraints,
    materializeDefaultInstructionsBundleForNewAgent,
    resolveDesiredSkillAssignment,
    redactForRestrictedAgentView,
    normalizeAgentReference,
    toLeanOrgNode,
  } = ctx;

  router.param("id", async (req, _res, next, rawId) => {
    try {
      req.params.id = await normalizeAgentReference(req, String(rawId));
      next();
    } catch (err) {
      next(err);
    }
  });

  router.get("/companies/:companyId/agents", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const includeTerminated = req.query.includeTerminated === "true";
    const employmentType =
      typeof req.query.employmentType === "string" &&
      EMPLOYMENT_TYPES.includes(req.query.employmentType as EmploymentType)
        ? (req.query.employmentType as string)
        : undefined;
    const department =
      typeof req.query.department === "string" && DEPARTMENTS.includes(req.query.department as Department)
        ? (req.query.department as string)
        : undefined;

    const result = await svc.list(companyId, { includeTerminated, employmentType, department });
    const canReadConfigs = await actorCanReadConfigurationsForCompany(req, companyId);
    if (canReadConfigs || req.actor.type === "board") {
      res.json(result);
      return;
    }
    res.json(result.map((agent) => redactForRestrictedAgentView(agent)));
  });

  router.get("/companies/:companyId/org", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const tree = await svc.orgForCompany(companyId);
    const leanTree = tree.map((node) => toLeanOrgNode(node as Record<string, unknown>));
    res.json(leanTree);
  });

  router.get("/companies/:companyId/org.svg", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const style = (
      ORG_CHART_STYLES.includes(req.query.style as OrgChartStyle) ? req.query.style : "warmth"
    ) as OrgChartStyle;
    const tree = await svc.orgForCompany(companyId);
    const leanTree = tree.map((node) => toLeanOrgNode(node as Record<string, unknown>));
    const svg = renderOrgChartSvg(leanTree as unknown as OrgNode[], style);
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "no-cache");
    res.send(svg);
  });

  router.get("/companies/:companyId/org.png", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const style = (
      ORG_CHART_STYLES.includes(req.query.style as OrgChartStyle) ? req.query.style : "warmth"
    ) as OrgChartStyle;
    const tree = await svc.orgForCompany(companyId);
    const leanTree = tree.map((node) => toLeanOrgNode(node as Record<string, unknown>));
    const png = await renderOrgChartPng(leanTree as unknown as OrgNode[], style);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-cache");
    res.send(png);
  });

  router.post("/companies/:companyId/agent-hires", validate(createAgentHireSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCanCreateAgentsForCompany(req, companyId);
    const sourceIssueIds = parseSourceIssueIds(req.body);
    const {
      desiredSkills: requestedDesiredSkills,
      sourceIssueId: _sourceIssueId,
      sourceIssueIds: _sourceIssueIds,
      ...hireInput
    } = req.body;
    const requestedAdapterConfig = applyCreateDefaultsByAdapterType(
      hireInput.adapterType,
      (hireInput.adapterConfig ?? {}) as Record<string, unknown>,
    );
    const desiredSkillAssignment = await resolveDesiredSkillAssignment(
      companyId,
      hireInput.adapterType,
      requestedAdapterConfig,
      Array.isArray(requestedDesiredSkills) ? requestedDesiredSkills : undefined,
    );
    const normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
      companyId,
      desiredSkillAssignment.adapterConfig,
      { strictMode: strictSecretsMode },
    );
    await assertAdapterConfigConstraints(companyId, hireInput.adapterType, normalizedAdapterConfig);
    const normalizedHireInput = {
      ...hireInput,
      adapterConfig: normalizedAdapterConfig,
    };

    const company = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0] ?? null);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const requiresApproval = company.requireBoardApprovalForNewAgents;
    const status = requiresApproval ? "pending_approval" : "idle";
    const createdAgent = await svc.create(companyId, {
      ...normalizedHireInput,
      status,
      spentMonthlyCents: 0,
      lastHeartbeatAt: null,
    });
    const agent = await materializeDefaultInstructionsBundleForNewAgent(createdAgent);

    let approval: Awaited<ReturnType<typeof approvalsSvc.getById>> | null = null;
    const actor = getActorInfo(req);

    if (requiresApproval) {
      const requestedAdapterType = normalizedHireInput.adapterType ?? agent.adapterType;
      const requestedAdapterConfig =
        redactEventPayload((agent.adapterConfig ?? normalizedHireInput.adapterConfig) as Record<string, unknown>) ?? {};
      const requestedRuntimeConfig =
        redactEventPayload((normalizedHireInput.runtimeConfig ?? agent.runtimeConfig) as Record<string, unknown>) ?? {};
      const requestedMetadata =
        redactEventPayload((normalizedHireInput.metadata ?? agent.metadata ?? {}) as Record<string, unknown>) ?? {};
      approval = await approvalsSvc.create(companyId, {
        type: "hire_agent",
        requestedByAgentId: actor.actorType === "agent" ? actor.actorId : null,
        requestedByUserId: actor.actorType === "user" ? actor.actorId : null,
        status: "pending",
        payload: {
          name: normalizedHireInput.name,
          role: normalizedHireInput.role,
          title: normalizedHireInput.title ?? null,
          icon: normalizedHireInput.icon ?? null,
          reportsTo: normalizedHireInput.reportsTo ?? null,
          capabilities: normalizedHireInput.capabilities ?? null,
          adapterType: requestedAdapterType,
          adapterConfig: requestedAdapterConfig,
          runtimeConfig: requestedRuntimeConfig,
          budgetMonthlyCents:
            typeof normalizedHireInput.budgetMonthlyCents === "number"
              ? normalizedHireInput.budgetMonthlyCents
              : agent.budgetMonthlyCents,
          desiredSkills: desiredSkillAssignment.desiredSkills,
          metadata: requestedMetadata,
          agentId: agent.id,
          requestedByAgentId: actor.actorType === "agent" ? actor.actorId : null,
          requestedConfigurationSnapshot: {
            adapterType: requestedAdapterType,
            adapterConfig: requestedAdapterConfig,
            runtimeConfig: requestedRuntimeConfig,
            desiredSkills: desiredSkillAssignment.desiredSkills,
          },
        },
        decisionNote: null,
        decidedByUserId: null,
        decidedAt: null,
        updatedAt: new Date(),
      });

      if (sourceIssueIds.length > 0) {
        await issueApprovalsSvc.linkManyForApproval(approval.id, sourceIssueIds, {
          agentId: actor.actorType === "agent" ? actor.actorId : null,
          userId: actor.actorType === "user" ? actor.actorId : null,
        });
      }
    }

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.hire_created",
      entityType: "agent",
      entityId: agent.id,
      details: {
        name: agent.name,
        role: agent.role,
        requiresApproval,
        approvalId: approval?.id ?? null,
        issueIds: sourceIssueIds,
        desiredSkills: desiredSkillAssignment.desiredSkills,
      },
    });

    await applyDefaultAgentTaskAssignGrant(companyId, agent.id, actor.actorType === "user" ? actor.actorId : null);

    if (approval) {
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "approval.created",
        entityType: "approval",
        entityId: approval.id,
        details: { type: approval.type, linkedAgentId: agent.id },
      });
    }

    // Wire: auto-join hired agent to #company and department channels (non-fatal)
    autoJoinAgentChannels(
      db,
      companyId,
      agent.id,
      typeof normalizedHireInput.department === "string" ? normalizedHireInput.department : undefined,
    ).catch(() => {});

    // Create workspace and hiring record if agent does not require approval (already active)
    if (!requiresApproval) {
      try {
        await createAgentWorkspaceService(db, agent.id, companyId, agent.role);
        await createHiringRecordService(db, {
          companyId,
          hrAgentId: null,
          hiredAgentId: agent.id,
          hiredAgentName: agent.name,
          hiredAgentRole: agent.role,
          employmentType: ((agent as Record<string, unknown>).employmentType as string) ?? "full_time",
          hiredByUserId: actor.actorType === "user" ? actor.actorId : null,
          hiredByAgentId: actor.actorType === "agent" ? actor.actorId : null,
        });
        await createEmploymentHistoryEntry(db, {
          companyId,
          agentId: agent.id,
          agentName: agent.name,
          eventType: "hired",
          details: [
            `Agent created and hired directly (no approval required).`,
            `Role: ${agent.role}`,
            `Employment Type: ${((agent as Record<string, unknown>).employmentType as string) ?? "full_time"}`,
          ].join("\n"),
        });
      } catch (err) {
        // Non-fatal: workspace/personnel record creation should not block hiring
        logger.error({ err }, "Failed to create agent workspace or hiring record");
      }
    }

    res.status(201).json({ agent, approval });
  });

  router.post("/companies/:companyId/agents", validate(createAgentSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCanWrite(req, companyId, db);

    if (req.actor.type === "agent") {
      assertBoard(req);
    }

    const { desiredSkills: requestedDesiredSkills, ...createInput } = req.body;
    const requestedAdapterConfig = applyCreateDefaultsByAdapterType(
      createInput.adapterType,
      (createInput.adapterConfig ?? {}) as Record<string, unknown>,
    );
    const desiredSkillAssignment = await resolveDesiredSkillAssignment(
      companyId,
      createInput.adapterType,
      requestedAdapterConfig,
      Array.isArray(requestedDesiredSkills) ? requestedDesiredSkills : undefined,
    );
    const normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
      companyId,
      desiredSkillAssignment.adapterConfig,
      { strictMode: strictSecretsMode },
    );
    await assertAdapterConfigConstraints(companyId, createInput.adapterType, normalizedAdapterConfig);

    // ── Headcount limit enforcement ──────────────────────────────────
    const resolvedEmploymentType: EmploymentType =
      typeof createInput.employmentType === "string" &&
      EMPLOYMENT_TYPES.includes(createInput.employmentType as EmploymentType)
        ? (createInput.employmentType as EmploymentType)
        : "full_time";

    const subRow = await db
      .select({ planTier: companySubscriptions.planTier, llmAuthMethod: companySubscriptions.llmAuthMethod })
      .from(companySubscriptions)
      .where(eq(companySubscriptions.companyId, companyId))
      .then((rows) => rows[0] ?? null);

    const tier = subRow?.planTier ?? "starter";
    const limits = PLAN_AGENT_LIMITS[tier] ?? PLAN_AGENT_LIMITS.starter!;

    // Only run headcount query if there's actually a limit to enforce
    const fteLimit = limits.fte;
    const contractorLimit = limits.contractor;
    if (
      (resolvedEmploymentType === "full_time" && fteLimit !== -1) ||
      (resolvedEmploymentType === "contractor" && contractorLimit !== -1)
    ) {
      const [headcountRow] = await db
        .select({
          fte: sql<number>`count(*) filter (where ${agentsTable.employmentType} = 'full_time' and ${agentsTable.status} != 'terminated')`,
          contractor: sql<number>`count(*) filter (where ${agentsTable.employmentType} = 'contractor' and ${agentsTable.status} != 'terminated')`,
        })
        .from(agentsTable)
        .where(eq(agentsTable.companyId, companyId));

      const fteCount = Number(headcountRow?.fte ?? 0);
      const contractorCount = Number(headcountRow?.contractor ?? 0);

      if (resolvedEmploymentType === "full_time" && fteLimit !== -1 && fteCount >= fteLimit) {
        res.status(403).json({
          error: `Full-time agent limit reached (${fteLimit}) for ${tier} plan. Upgrade to add more full-time agents.`,
        });
        return;
      }
      if (resolvedEmploymentType === "contractor" && contractorLimit !== -1 && contractorCount >= contractorLimit) {
        res.status(403).json({
          error: `Contractor agent limit reached (${contractorLimit}) for ${tier} plan. Upgrade to add more contractors.`,
        });
        return;
      }
    }

    // Auto-budget: determine default before create so we can pass it in
    // when the caller didn't supply one and the company uses api_key auth.
    let resolvedBudgetCents = typeof createInput.budgetMonthlyCents === "number" ? createInput.budgetMonthlyCents : 0;

    if (resolvedBudgetCents === 0) {
      if (subRow?.llmAuthMethod === "api_key") {
        resolvedBudgetCents = defaultBudgetCentsForRole(createInput.role ?? "general");
      }
    }

    // Employment model fields from request body
    const hiredByUserId = req.actor.type === "board" ? (req.actor.userId ?? null) : null;

    // Task 1: Least-privilege enforcement - new agents start with EMPTY permission grants.
    // The board must explicitly grant permissions via the permission system before the agent
    // can access company resources. This is intentional: zero-trust by default.
    const createdAgent = await svc.create(companyId, {
      ...createInput,
      adapterConfig: normalizedAdapterConfig,
      status: "idle",
      spentMonthlyCents: 0,
      budgetMonthlyCents: resolvedBudgetCents,
      lastHeartbeatAt: null,
      employmentType: resolvedEmploymentType,
      department: typeof createInput.department === "string" ? createInput.department : undefined,
      hiredByUserId,
      contractEndAt: typeof createInput.contractEndAt === "string" ? new Date(createInput.contractEndAt) : undefined,
      contractEndCondition:
        typeof createInput.contractEndCondition === "string" ? createInput.contractEndCondition : undefined,
      contractProjectId: typeof createInput.contractProjectId === "string" ? createInput.contractProjectId : undefined,
      contractBudgetCents:
        typeof createInput.contractBudgetCents === "number" ? createInput.contractBudgetCents : undefined,
      onboardingContextIds: Array.isArray(createInput.onboardingContextIds)
        ? createInput.onboardingContextIds
        : undefined,
    });
    const agent = await materializeDefaultInstructionsBundleForNewAgent(createdAgent);

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.created",
      entityType: "agent",
      entityId: agent.id,
      details: {
        name: agent.name,
        role: agent.role,
        desiredSkills: desiredSkillAssignment.desiredSkills,
      },
    });

    await applyDefaultAgentTaskAssignGrant(
      companyId,
      agent.id,
      req.actor.type === "board" ? (req.actor.userId ?? null) : null,
    );

    if (agent.budgetMonthlyCents > 0) {
      await budgets.upsertPolicy(
        companyId,
        {
          scopeType: "agent",
          scopeId: agent.id,
          amount: agent.budgetMonthlyCents,
          windowKind: "calendar_month_utc",
        },
        actor.actorType === "user" ? actor.actorId : null,
      );
    }

    // Wire: auto-create library folder for new agent
    ensureLibraryAgentFolder(companyId, agent.name, db).catch(() => {});

    // Wire: auto-join agent to #company and department channels
    autoJoinAgentChannels(
      db,
      companyId,
      agent.id,
      typeof createInput.department === "string" ? createInput.department : undefined,
    ).catch(() => {});

    // Build and store contractor onboarding packet if applicable
    if (resolvedEmploymentType === "contractor") {
      try {
        const packet = await buildOnboardingPacket(
          db,
          companyId,
          typeof createInput.contractProjectId === "string" ? createInput.contractProjectId : null,
          Array.isArray(createInput.onboardingContextIds) ? createInput.onboardingContextIds : [],
          typeof createInput.reportsTo === "string" ? createInput.reportsTo : null,
        );
        await svc.update(agent.id, {
          runtimeConfig: { ...agent.runtimeConfig, onboardingPacket: packet },
        });
      } catch (err) {
        logger.error({ err, agentId: agent.id }, "Failed to build contractor onboarding packet");
      }
    }

    res.status(201).json(agent);
  });

  // ── POST /companies/:companyId/agents/team-pack ─────────────────────────────
  // Deploy a team pack: create all agents in one shot, then create a welcome
  // issue assigned to the CEO agent (Item 5: CEO welcome task on team pack).
  router.post("/companies/:companyId/agents/team-pack", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCanWrite(req, companyId, db);

    if (req.actor.type === "agent") {
      assertBoard(req);
    }

    const body = req.body as {
      agents: Array<{
        templateKey: string;
        name: string;
        role: string;
        title?: string | null;
        icon?: string | null;
        reportsTo?: string | null; // template key of parent
        suggestedAdapter?: string | null;
        skills?: string[];
        agentsMd?: string | null; // AGENTS.md content
        soulMd?: string | null; // SOUL.md content
      }>;
      adapterType: string;
      adapterConfig: Record<string, unknown>;
    };

    if (!Array.isArray(body.agents) || body.agents.length === 0) {
      res.status(400).json({ error: "agents array is required and must not be empty" });
      return;
    }

    const actor = getActorInfo(req);
    const issueSvc = issueService(db);

    // Map templateKey → created agent id (for resolving reportsTo references)
    const agentIdByTemplateKey = new Map<string, string>();
    const createdAgents: NonNullable<Awaited<ReturnType<typeof svc.getById>>>[] = [];

    for (const item of body.agents) {
      // Honor the wizard's chosen adapter. The role template's
      // `suggestedAdapter` is only a fallback when the caller didn't pick one
      // — otherwise picking OpenRouter in the wizard would silently land every
      // agent on `claude_local` (the default suggested by every role template).
      const adapterType = body.adapterType || item.suggestedAdapter || "claude_local";
      const roleTemplate = ROLE_TEMPLATES.find((t) => t.key === item.templateKey);
      // OpenRouter needs an explicit model. When the wizard didn't supply one
      // (and we have a role template), seed `model` from the role's
      // `modelPrimary` and `fallbackModel` from `modelFallback`. The OpenRouter
      // adapter will run primary first, swap to fallback only on rate-limit /
      // server / circuit-open errors after the primary's retry budget is spent.
      const adapterConfigWithTier =
        adapterType === "openrouter_api" && !(body.adapterConfig ?? {}).model && roleTemplate
          ? {
              ...(body.adapterConfig ?? {}),
              model: roleTemplate.modelPrimary,
              fallbackModel: roleTemplate.modelFallback,
            }
          : (body.adapterConfig ?? {});
      const baseAdapterConfig = applyCreateDefaultsByAdapterType(adapterType, adapterConfigWithTier);
      const desiredSkillAssignment = await resolveDesiredSkillAssignment(
        companyId,
        adapterType,
        baseAdapterConfig,
        item.skills?.length ? item.skills : undefined,
      );
      const normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
        companyId,
        item.agentsMd
          ? { ...desiredSkillAssignment.adapterConfig, promptTemplate: item.agentsMd }
          : desiredSkillAssignment.adapterConfig,
        { strictMode: strictSecretsMode },
      );

      const reportsToAgentId = item.reportsTo ? (agentIdByTemplateKey.get(item.reportsTo) ?? null) : null;

      // Resolve soul/agents content from the role template (already fetched above) or explicit body fields
      const soulContent = item.soulMd ?? roleTemplate?.soul ?? null;
      const agentsContent = item.agentsMd ?? roleTemplate?.agents ?? null;
      const resolvedAgentInstructions = agentsContent ? `${COMMON_AGENT_PREAMBLE}\n\n${agentsContent}` : null;

      const createdAgent = await svc.create(companyId, {
        name: item.name.trim() || item.title || item.role,
        role: item.role,
        title: item.title ?? null,
        icon: item.icon ?? null,
        reportsTo: reportsToAgentId,
        adapterType,
        adapterConfig: normalizedAdapterConfig,
        runtimeConfig: {
          heartbeat: {
            enabled: true,
            // 4hr idle interval — agents wake instantly on issue assignment
            // / @mention via wakeOnDemand, so responsiveness is preserved.
            // Cuts baseline call volume ~75% vs the prior 1hr default,
            // materially preserving free-tier per-model rate-limit budget
            // for actual work.
            intervalSec: 14400,
            wakeOnDemand: true,
            cooldownSec: 10,
            maxConcurrentRuns: 1,
          },
        },
        systemPrompt: soulContent,
        agentInstructions: resolvedAgentInstructions,
        status: "idle",
        spentMonthlyCents: 0,
        lastHeartbeatAt: null,
      });

      const agent = await materializeDefaultInstructionsBundleForNewAgent(createdAgent);
      agentIdByTemplateKey.set(item.templateKey, agent.id);
      createdAgents.push(agent);

      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "agent.created",
        entityType: "agent",
        entityId: agent.id,
        details: { name: agent.name, role: agent.role, source: "team_pack" },
      });

      await applyDefaultAgentTaskAssignGrant(
        companyId,
        agent.id,
        req.actor.type === "board" ? (req.actor.userId ?? null) : null,
      );

      ensureLibraryAgentFolder(companyId, agent.name, db).catch(() => {});
    }

    // Create welcome issue assigned to the CEO agent (Item 5)
    const ceoAgent = createdAgents.find((a) => a.role === "ceo");
    if (ceoAgent) {
      try {
        await issueSvc.create(companyId, {
          title: "Welcome: review your team and set company direction",
          description: `Your AI workforce has been deployed. Here is what to do first:

1. Review your team — check the Org Chart to see who reports to whom
2. Set 2-3 company goals in the Goals section
3. Create your first project and assign agents to it
4. Run the "Client Onboarding" playbook if you have a client to onboard

Your team is ready to work. Assign tasks by creating issues and setting an assignee.`,
          assigneeAgentId: ceoAgent.id,
          priority: "high",
          status: "todo",
          createdByUserId: actor.actorType === "user" ? actor.actorId : null,
          createdByAgentId: actor.agentId ?? null,
        });
      } catch (err) {
        // Non-fatal — team was created successfully; welcome issue failure is logged only
        logger.warn(
          { err, companyId, ceoAgentId: ceoAgent.id },
          "Non-fatal: failed to create CEO welcome issue after team pack deployment",
        );
      }
    }

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "company.team_pack_deployed",
      entityType: "company",
      entityId: companyId,
      details: { agentCount: createdAgents.length, hasCeo: !!ceoAgent },
    });

    res.status(201).json({ agents: createdAgents });
  });

  router.post("/agents/:id/pause", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    // SEC-AUTH-HIGH-002: viewer-write protection — block viewer board members.
    await assertCanWrite(req, existing.companyId, db);
    const agent = await svc.pause(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await heartbeat.cancelActiveForAgent(id);

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "agent.paused",
      entityType: "agent",
      entityId: agent.id,
    });

    res.json(agent);
  });

  router.post("/agents/:id/resume", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    // SEC-AUTH-HIGH-002: viewer-write protection — block viewer board members.
    await assertCanWrite(req, existing.companyId, db);
    const agent = await svc.resume(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "agent.resumed",
      entityType: "agent",
      entityId: agent.id,
    });

    res.json(agent);
  });

  router.post("/agents/:id/terminate", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    // SEC-AUTH-HIGH-002: viewer-write protection — block viewer board members.
    await assertCanWrite(req, existing.companyId, db);
    const agent = await svc.terminate(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await heartbeat.cancelActiveForAgent(id);

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "agent.terminated",
      entityType: "agent",
      entityId: agent.id,
    });

    // Archive workspace and create termination record (best-effort)
    try {
      await archiveAgentWorkspaceService(db, agent.id);
      await createTerminationRecordService(db, {
        companyId: agent.companyId,
        hrAgentId: null,
        terminatedAgentId: agent.id,
        terminatedAgentName: agent.name,
        reason: "manual_termination",
      });
      await createEmploymentHistoryEntry(db, {
        companyId: agent.companyId,
        agentId: agent.id,
        agentName: agent.name,
        eventType: "terminated",
        details: "Agent terminated via board action (manual termination).",
      });
    } catch (err) {
      logger.error({ err }, "Failed to archive workspace or create termination record");
    }

    // Announce termination to #company channel (non-fatal).
    void (async () => {
      try {
        const companyChannel = await findCompanyChannel(db, agent.companyId);
        if (companyChannel) {
          await postChannelMessage(db, {
            channelId: companyChannel.id,
            companyId: agent.companyId,
            body: `${agent.name} has been terminated. Reason: manual_termination`,
            messageType: "announcement",
          });
        }
      } catch {
        /* non-fatal */
      }
    })();

    res.json(agent);
  });

  router.delete("/agents/:id", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    // SEC-AUTH-HIGH-002: viewer-write protection — block viewer board members.
    await assertCanWrite(req, existing.companyId, db);
    const agent = await svc.remove(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "agent.deleted",
      entityType: "agent",
      entityId: agent.id,
    });

    res.json({ ok: true });
  });

  // ── POST /companies/:companyId/agents/:agentId/terminate ─────────────────────
  router.post("/companies/:companyId/agents/:agentId/terminate", async (req, res) => {
    const companyId = req.params.companyId as string;
    const agentId = req.params.agentId as string;
    await assertCanWrite(req, companyId, db);

    const agent = await svc.getById(agentId);
    if (!agent || agent.companyId !== companyId) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const { terminationReason } = req.body as { terminationReason?: string };
    if (!terminationReason || !TERMINATION_REASONS.includes(terminationReason as TerminationReason)) {
      res.status(400).json({
        error: `termination_reason is required and must be one of: ${TERMINATION_REASONS.join(", ")}`,
      });
      return;
    }

    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(agentsTable)
        .set({
          status: "terminated",
          terminatedAt: now,
          terminationReason,
          updatedAt: now,
        })
        .where(and(eq(agentsTable.id, agentId), eq(agentsTable.companyId, companyId)))
        .returning();

      // Archive all memory entries for this agent
      await tx.update(agentMemoryEntries).set({ archivedAt: now }).where(eq(agentMemoryEntries.agentId, agentId));

      return updated!;
    });

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.terminated",
      entityType: "agent",
      entityId: agentId,
      details: { name: result.name, terminationReason },
    });

    // Archive workspace and create termination record (best-effort)
    try {
      await archiveAgentWorkspaceService(db, agentId);
      await createTerminationRecordService(db, {
        companyId,
        hrAgentId: null,
        terminatedAgentId: agentId,
        terminatedAgentName: result.name,
        reason: terminationReason as string,
      });
      await createEmploymentHistoryEntry(db, {
        companyId,
        agentId,
        agentName: result.name,
        eventType: "terminated",
        details: `Agent terminated. Reason: ${terminationReason as string}.`,
      });
    } catch (err) {
      logger.error({ err }, "Failed to archive workspace or create termination record");
    }

    // Announce termination to #company channel (non-fatal).
    void (async () => {
      try {
        const companyChannel = await findCompanyChannel(db, companyId);
        if (companyChannel) {
          await postChannelMessage(db, {
            channelId: companyChannel.id,
            companyId,
            body: `${result.name} has been terminated. Reason: ${terminationReason as string}`,
            messageType: "announcement",
          });
        }
      } catch {
        /* non-fatal */
      }
    })();

    res.json(result);
  });

  // ── GET /companies/:companyId/agents/headcount ──────────────────────────────
  router.get("/companies/:companyId/agents/headcount", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const [counts] = await db
      .select({
        fte: sql<number>`count(*) filter (where ${agentsTable.employmentType} = 'full_time' and ${agentsTable.status} != 'terminated')`,
        contractor: sql<number>`count(*) filter (where ${agentsTable.employmentType} = 'contractor' and ${agentsTable.status} != 'terminated')`,
      })
      .from(agentsTable)
      .where(eq(agentsTable.companyId, companyId));

    const subRow = await db
      .select({ planTier: companySubscriptions.planTier })
      .from(companySubscriptions)
      .where(eq(companySubscriptions.companyId, companyId))
      .then((rows) => rows[0] ?? null);

    const tier = subRow?.planTier ?? "starter";
    const limits = PLAN_AGENT_LIMITS[tier] ?? PLAN_AGENT_LIMITS.starter!;

    res.json({
      fte: Number(counts?.fte ?? 0),
      contractor: Number(counts?.contractor ?? 0),
      limits,
      tier,
    });
  });

  return router;
}
