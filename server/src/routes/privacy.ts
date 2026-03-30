import { Router } from "express";
import { and, eq, lt, sql } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import {
  companies,
  agents,
  issues,
  issueComments,
  goals,
  projects,
  heartbeatRuns,
  heartbeatRunEvents,
  costEvents,
  financeEvents,
  activityLog,
  approvals,
  approvalComments,
  companySkills,
  libraryFiles,
  libraryFileEvents,
  playbooks,
  playbookRuns,
  authSessions,
} from "@ironworksai/db";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { assertBoard } from "./authz.js";
import { badRequest } from "../errors.js";
import { logger } from "../middleware/logger.js";

/* ─── Data Retention Defaults (configurable) ──────────────────────── */

const DEFAULT_RETENTION = {
  heartbeatRunEvents: 90,   // days
  activityLog: 365,         // days
  costEvents: 365,          // days
  financeEvents: 365,       // days
  expiredSessions: 30,      // days after session expiry
};

export function privacyRoutes(db: Db) {
  const router = Router();

  /**
   * GET /companies/:companyId/privacy/data-export
   * GDPR Article 20 — Data portability.
   * Exports all personal and company data as structured JSON.
   */
  router.get("/companies/:companyId/privacy/data-export", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);

    const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    // Gather all data categories
    const [
      companyAgents,
      companyProjects,
      companyGoals,
      companyIssues,
      companyComments,
      companyCosts,
      companyActivity,
      companyApprovals,
      companySkillsList,
      companyLibraryFiles,
      companyPlaybooks,
      companyPlaybookRuns,
    ] = await Promise.all([
      db.select().from(agents).where(eq(agents.companyId, companyId)),
      db.select().from(projects).where(eq(projects.companyId, companyId)),
      db.select().from(goals).where(eq(goals.companyId, companyId)),
      db.select().from(issues).where(eq(issues.companyId, companyId)),
      db.select().from(issueComments).where(eq(issueComments.companyId, companyId)),
      db.select().from(costEvents).where(eq(costEvents.companyId, companyId)),
      db.select().from(activityLog).where(eq(activityLog.companyId, companyId)),
      db.select().from(approvals).where(eq(approvals.companyId, companyId)),
      db.select().from(companySkills).where(eq(companySkills.companyId, companyId)),
      db.select().from(libraryFiles).where(eq(libraryFiles.companyId, companyId)),
      db.select().from(playbooks).where(eq(playbooks.companyId, companyId)),
      db.select().from(playbookRuns).where(eq(playbookRuns.companyId, companyId)),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      format: "ironworks-data-export-v1",
      company: {
        id: company.id,
        name: company.name,
        description: company.description,
        issuePrefix: company.issuePrefix,
        createdAt: company.createdAt,
      },
      agents: companyAgents.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        title: a.title,
        status: a.status,
        createdAt: a.createdAt,
      })),
      projects: companyProjects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        status: p.status,
        createdAt: p.createdAt,
      })),
      goals: companyGoals.map((g) => ({
        id: g.id,
        title: g.title,
        description: g.description,
        level: g.level,
        status: g.status,
        createdAt: g.createdAt,
      })),
      issues: companyIssues.map((i) => ({
        id: i.id,
        identifier: i.identifier,
        title: i.title,
        description: i.description,
        status: i.status,
        priority: i.priority,
        createdAt: i.createdAt,
        completedAt: i.completedAt,
      })),
      comments: companyComments.map((c) => ({
        id: c.id,
        issueId: c.issueId,
        body: c.body,
        createdAt: c.createdAt,
      })),
      costEvents: companyCosts.map((c) => ({
        id: c.id,
        agentId: c.agentId,
        costCents: c.costCents,
        provider: c.provider,
        occurredAt: c.occurredAt,
      })),
      activity: companyActivity.map((a) => ({
        id: a.id,
        action: a.action,
        actorType: a.actorType,
        entityType: a.entityType,
        createdAt: a.createdAt,
      })),
      approvals: companyApprovals.map((a) => ({
        id: a.id,
        status: a.status,
        createdAt: a.createdAt,
      })),
      skills: companySkillsList.map((s) => ({
        id: s.id,
        key: s.key,
        name: s.name,
        createdAt: s.createdAt,
      })),
      libraryFiles: companyLibraryFiles.map((f) => ({
        id: f.id,
        filePath: f.filePath,
        title: f.title,
        visibility: f.visibility,
        createdAt: f.createdAt,
      })),
      playbooks: companyPlaybooks.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        runCount: p.runCount,
        createdAt: p.createdAt,
      })),
      playbookRuns: companyPlaybookRuns.map((r) => ({
        id: r.id,
        playbookId: r.playbookId,
        status: r.status,
        totalSteps: r.totalSteps,
        completedSteps: r.completedSteps,
        startedAt: r.startedAt,
      })),
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="ironworks-data-export-${company.issuePrefix}-${new Date().toISOString().split("T")[0]}.json"`,
    );
    res.json(exportData);
  });

  /**
   * POST /companies/:companyId/privacy/erasure-request
   * GDPR Article 17 — Right to erasure.
   * Archives the company immediately, schedules permanent deletion after grace period.
   */
  router.post("/companies/:companyId/privacy/erasure-request", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);

    const actor = getActorInfo(req);
    const { confirm } = req.body as { confirm?: boolean };

    if (!confirm) {
      throw badRequest("Must confirm erasure by setting confirm: true");
    }

    // Archive the company immediately (soft delete)
    await db
      .update(companies)
      .set({
        status: "pending_erasure",
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId));

    // Log the erasure request
    await db.insert(activityLog).values({
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "privacy.erasure_requested",
      entityType: "company",
      entityId: companyId,
      details: {
        requestedAt: new Date().toISOString(),
        scheduledDeletionAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        requestedBy: actor.actorId,
      },
    });

    res.json({
      status: "erasure_scheduled",
      message: "Company data has been scheduled for permanent deletion in 30 days. Contact support to cancel.",
      scheduledDeletionAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
  });

  /**
   * GET /companies/:companyId/privacy/summary
   * Returns a summary of what personal data is stored for this company.
   */
  router.get("/companies/:companyId/privacy/summary", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const counts = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(agents).where(eq(agents.companyId, companyId)),
      db.select({ count: sql<number>`count(*)` }).from(issues).where(eq(issues.companyId, companyId)),
      db.select({ count: sql<number>`count(*)` }).from(issueComments).where(eq(issueComments.companyId, companyId)),
      db.select({ count: sql<number>`count(*)` }).from(heartbeatRuns).where(eq(heartbeatRuns.companyId, companyId)),
      db.select({ count: sql<number>`count(*)` }).from(costEvents).where(eq(costEvents.companyId, companyId)),
      db.select({ count: sql<number>`count(*)` }).from(activityLog).where(eq(activityLog.companyId, companyId)),
      db.select({ count: sql<number>`count(*)` }).from(libraryFiles).where(eq(libraryFiles.companyId, companyId)),
    ]);

    res.json({
      dataCategories: [
        { category: "Agents", description: "AI agent profiles and configurations", count: Number(counts[0][0]?.count ?? 0) },
        { category: "Issues", description: "Tasks, descriptions, and assignments", count: Number(counts[1][0]?.count ?? 0) },
        { category: "Comments", description: "Issue comments and discussions", count: Number(counts[2][0]?.count ?? 0) },
        { category: "Execution Logs", description: "Agent heartbeat run records", count: Number(counts[3][0]?.count ?? 0) },
        { category: "Cost Events", description: "Token usage and billing records", count: Number(counts[4][0]?.count ?? 0) },
        { category: "Activity Log", description: "Audit trail of actions taken", count: Number(counts[5][0]?.count ?? 0) },
        { category: "Library Files", description: "Document metadata and ownership records", count: Number(counts[6][0]?.count ?? 0) },
      ],
      retentionPolicies: {
        executionLogs: `${DEFAULT_RETENTION.heartbeatRunEvents} days`,
        activityLog: `${DEFAULT_RETENTION.activityLog} days`,
        costEvents: `${DEFAULT_RETENTION.costEvents} days`,
        sessions: `${DEFAULT_RETENTION.expiredSessions} days after expiry`,
      },
      rights: {
        access: "GET /api/companies/:id/privacy/data-export",
        erasure: "POST /api/companies/:id/privacy/erasure-request",
        portability: "GET /api/companies/:id/privacy/data-export",
      },
    });
  });

  /**
   * POST /privacy/retention/run-cleanup
   * Runs the data retention cleanup job manually.
   * Normally this runs on a daily schedule.
   */
  router.post("/privacy/retention/run-cleanup", async (req, res) => {
    assertBoard(req);
    const result = await runRetentionCleanup(db);
    res.json(result);
  });

  return router;
}

/* ─── Data Retention Cleanup Job ──────────────────────────────────── */

export async function runRetentionCleanup(db: Db): Promise<{
  heartbeatRunEvents: number;
  activityLog: number;
  costEvents: number;
  financeEvents: number;
  expiredSessions: number;
}> {
  const results = {
    heartbeatRunEvents: 0,
    activityLog: 0,
    costEvents: 0,
    financeEvents: 0,
    expiredSessions: 0,
  };

  const now = new Date();

  // Heartbeat run events older than retention period
  const hreThreshold = new Date(now.getTime() - DEFAULT_RETENTION.heartbeatRunEvents * 24 * 60 * 60 * 1000);
  const hreResult = await db
    .delete(heartbeatRunEvents)
    .where(lt(heartbeatRunEvents.createdAt, hreThreshold));
  results.heartbeatRunEvents = (hreResult as unknown as { rowCount?: number }).rowCount ?? 0;

  // Activity log older than retention period
  const alThreshold = new Date(now.getTime() - DEFAULT_RETENTION.activityLog * 24 * 60 * 60 * 1000);
  const alResult = await db
    .delete(activityLog)
    .where(lt(activityLog.createdAt, alThreshold));
  results.activityLog = (alResult as unknown as { rowCount?: number }).rowCount ?? 0;

  // Cost events older than retention period
  const ceThreshold = new Date(now.getTime() - DEFAULT_RETENTION.costEvents * 24 * 60 * 60 * 1000);
  const ceResult = await db
    .delete(costEvents)
    .where(lt(costEvents.occurredAt, ceThreshold));
  results.costEvents = (ceResult as unknown as { rowCount?: number }).rowCount ?? 0;

  // Finance events older than retention period
  const feThreshold = new Date(now.getTime() - DEFAULT_RETENTION.financeEvents * 24 * 60 * 60 * 1000);
  const feResult = await db
    .delete(financeEvents)
    .where(lt(financeEvents.occurredAt, feThreshold));
  results.financeEvents = (feResult as unknown as { rowCount?: number }).rowCount ?? 0;

  // Expired auth sessions older than grace period
  const sessionThreshold = new Date(now.getTime() - DEFAULT_RETENTION.expiredSessions * 24 * 60 * 60 * 1000);
  const sessionResult = await db
    .delete(authSessions)
    .where(lt(authSessions.expiresAt, sessionThreshold));
  results.expiredSessions = (sessionResult as unknown as { rowCount?: number }).rowCount ?? 0;

  logger.info({ results }, "data retention cleanup completed");
  return results;
}

/**
 * Start the daily retention cleanup scheduler.
 * Call this from server startup.
 */
export function startRetentionScheduler(db: Db): NodeJS.Timeout {
  const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

  // Run once on startup (delayed 60s to avoid slowing boot)
  const initialTimeout = setTimeout(() => {
    runRetentionCleanup(db).catch((err) =>
      logger.error({ err }, "initial retention cleanup failed"),
    );
  }, 60_000);

  // Then run daily
  const interval = setInterval(() => {
    runRetentionCleanup(db).catch((err) =>
      logger.error({ err }, "scheduled retention cleanup failed"),
    );
  }, CLEANUP_INTERVAL_MS);

  // Return the interval so it can be cleared on shutdown
  return interval;
}
