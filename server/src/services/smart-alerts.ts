import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import { activityLog } from "@ironworksai/db";
import { logActivity } from "./activity-log.js";

export type AlertSeverity = "low" | "medium" | "high" | "critical";

export interface SmartAlert {
  id: string;
  severity: AlertSeverity;
  category: string;
  title: string;
  description: string;
  agentId: string | null;
  issueId: string | null;
  autoResolved: boolean;
  createdAt: Date;
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Score an action's risk level and decide whether to escalate.
 *
 * Critical: spending > $50 in single run, agent accessing data outside its scope,
 *           agent terminated unexpectedly
 * High:     spending > $10 in single run, agent error rate > 50%, hiring request
 * Medium:   budget at 80% threshold, agent performance below 40
 * Low:      routine status updates, successful completions, minor config changes
 */
export function classifyAlertSeverity(
  action: string,
  details: Record<string, unknown>,
): AlertSeverity {
  // Critical triggers
  const spendCents = Number(details.costCents ?? details.spendCents ?? 0);
  if (spendCents > 5000) return "critical"; // > $50
  if (action === "agent.scope_violation") return "critical";
  if (action === "agent.terminated_unexpectedly") return "critical";

  // High triggers
  if (spendCents > 1000) return "high"; // > $10
  if (action === "agent.error_rate_high") {
    const rate = Number(details.errorRate ?? 0);
    if (rate > 0.5) return "high";
  }
  if (action === "hiring.request") return "high";
  if (action === "hiring.hired") return "high";

  // Medium triggers
  if (action === "budget.alert_80_percent") return "medium";
  if (action === "budget.exceeded") return "critical";
  if (action === "agent.performance_low") {
    const score = Number(details.performanceScore ?? 100);
    if (score < 40) return "medium";
  }

  // Low: everything else
  return "low";
}

const ALERT_ACTION = "smart_alert.created";
const ALERT_RESOLVE_ACTION = "smart_alert.resolved";
const AUTO_RESOLVE_ACTION = "smart_alert.auto_resolved";

/**
 * Create a smart alert stored in the activity_log table.
 */
export async function createAlert(
  db: Db,
  companyId: string,
  alert: Omit<SmartAlert, "id" | "createdAt" | "autoResolved">,
): Promise<void> {
  await logActivity(db, {
    companyId,
    actorType: "system",
    actorId: "smart-alerts",
    action: ALERT_ACTION,
    entityType: "alert",
    entityId: alert.agentId ?? alert.issueId ?? companyId,
    agentId: alert.agentId ?? null,
    details: {
      severity: alert.severity,
      category: alert.category,
      title: alert.title,
      description: alert.description,
      issueId: alert.issueId ?? null,
      autoResolved: false,
    },
  });
}

/**
 * Get alerts that need board attention (filtered by risk threshold).
 * Only medium+ show in the board's alert feed by default.
 */
export async function getPendingAlerts(
  db: Db,
  companyId: string,
  minSeverity: AlertSeverity = "medium",
): Promise<SmartAlert[]> {
  const minOrder = SEVERITY_ORDER[minSeverity];

  // Read all smart_alert.created entries for this company
  const rows = await db
    .select()
    .from(activityLog)
    .where(
      and(
        eq(activityLog.companyId, companyId),
        eq(activityLog.action, ALERT_ACTION),
      ),
    )
    .orderBy(desc(activityLog.createdAt))
    .limit(200);

  // Read resolved alert IDs
  const resolvedRows = await db
    .select({ entityId: activityLog.entityId, createdAt: activityLog.createdAt })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.companyId, companyId),
        eq(activityLog.action, ALERT_RESOLVE_ACTION),
      ),
    );

  // Build a set of resolved alert row IDs (we store the original row id in entityId when resolving)
  const resolvedIds = new Set(resolvedRows.map((r) => r.entityId));

  const autoResolvedRows = await db
    .select({ entityId: activityLog.entityId })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.companyId, companyId),
        eq(activityLog.action, AUTO_RESOLVE_ACTION),
      ),
    );
  const autoResolvedIds = new Set(autoResolvedRows.map((r) => r.entityId));

  const alerts: SmartAlert[] = [];

  for (const row of rows) {
    const details = (row.details ?? {}) as Record<string, unknown>;
    const severity = (details.severity ?? "low") as AlertSeverity;
    const severityOrder = SEVERITY_ORDER[severity] ?? 0;

    if (severityOrder < minOrder) continue;
    if (resolvedIds.has(row.id) || autoResolvedIds.has(row.id)) continue;

    alerts.push({
      id: row.id,
      severity,
      category: String(details.category ?? "general"),
      title: String(details.title ?? "Alert"),
      description: String(details.description ?? ""),
      agentId: row.agentId ?? null,
      issueId: details.issueId ? String(details.issueId) : null,
      autoResolved: Boolean(details.autoResolved),
      createdAt: row.createdAt,
    });
  }

  return alerts;
}

/**
 * Manually resolve an alert by its activity_log row ID.
 */
export async function resolveAlert(
  db: Db,
  companyId: string,
  alertId: string,
  actorId = "system",
): Promise<void> {
  await logActivity(db, {
    companyId,
    actorType: "system",
    actorId,
    action: ALERT_RESOLVE_ACTION,
    entityType: "alert",
    entityId: alertId,
    details: { resolvedAt: new Date().toISOString() },
  });
}

/**
 * Auto-resolve low-risk alerts after 24 hours.
 * Returns the number of alerts resolved.
 */
export async function autoResolveLowRiskAlerts(
  db: Db,
  companyId: string,
): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Get existing resolved IDs so we don't double-log
  const resolvedRows = await db
    .select({ entityId: activityLog.entityId })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.companyId, companyId),
        eq(activityLog.action, ALERT_RESOLVE_ACTION),
      ),
    );
  const autoResolvedRows = await db
    .select({ entityId: activityLog.entityId })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.companyId, companyId),
        eq(activityLog.action, AUTO_RESOLVE_ACTION),
      ),
    );

  const alreadyResolved = new Set([
    ...resolvedRows.map((r) => r.entityId),
    ...autoResolvedRows.map((r) => r.entityId),
  ]);

  // Find low-risk alerts older than 24h
  const oldAlerts = await db
    .select()
    .from(activityLog)
    .where(
      and(
        eq(activityLog.companyId, companyId),
        eq(activityLog.action, ALERT_ACTION),
        // older than cutoff
        // drizzle: createdAt < cutoff
      ),
    )
    .limit(500);

  let resolved = 0;
  for (const row of oldAlerts) {
    if (row.createdAt > cutoff) continue; // still within 24h window
    if (alreadyResolved.has(row.id)) continue;

    const details = (row.details ?? {}) as Record<string, unknown>;
    const severity = (details.severity ?? "low") as AlertSeverity;
    if (severity !== "low") continue;

    await logActivity(db, {
      companyId,
      actorType: "system",
      actorId: "smart-alerts",
      action: AUTO_RESOLVE_ACTION,
      entityType: "alert",
      entityId: row.id,
      details: { autoResolvedAt: new Date().toISOString() },
    });
    resolved++;
  }

  return resolved;
}
