import type { Db } from "@ironworksai/db";
import { activityLog } from "@ironworksai/db";
import { and, desc, eq } from "drizzle-orm";
import { logActivity } from "./activity-log.js";

export interface CompanyRiskSettings {
  spendingAlertThresholdCents: number;
  performanceAlertThreshold: number;
  autoResolveTimeoutHours: number;
}

const SETTINGS_ACTION = "company.risk_settings_updated";
const DEFAULT_SETTINGS: CompanyRiskSettings = {
  spendingAlertThresholdCents: 1000, // $10
  performanceAlertThreshold: 40,
  autoResolveTimeoutHours: 24,
};

/**
 * Read the latest risk settings for a company.
 * Falls back to defaults if none have been saved.
 */
export async function getRiskSettings(db: Db, companyId: string): Promise<CompanyRiskSettings> {
  const rows = await db
    .select()
    .from(activityLog)
    .where(and(eq(activityLog.companyId, companyId), eq(activityLog.action, SETTINGS_ACTION)))
    .orderBy(desc(activityLog.createdAt))
    .limit(1);

  if (rows.length === 0 || !rows[0].details) {
    return { ...DEFAULT_SETTINGS };
  }

  const d = rows[0].details as Record<string, unknown>;
  return {
    spendingAlertThresholdCents: Number(d.spendingAlertThresholdCents ?? DEFAULT_SETTINGS.spendingAlertThresholdCents),
    performanceAlertThreshold: Number(d.performanceAlertThreshold ?? DEFAULT_SETTINGS.performanceAlertThreshold),
    autoResolveTimeoutHours: Number(d.autoResolveTimeoutHours ?? DEFAULT_SETTINGS.autoResolveTimeoutHours),
  };
}

/**
 * Persist risk settings for a company.
 */
export async function updateRiskSettings(
  db: Db,
  companyId: string,
  settings: Partial<CompanyRiskSettings>,
  actorId = "system",
): Promise<CompanyRiskSettings> {
  const current = await getRiskSettings(db, companyId);
  const merged: CompanyRiskSettings = {
    spendingAlertThresholdCents: settings.spendingAlertThresholdCents ?? current.spendingAlertThresholdCents,
    performanceAlertThreshold: settings.performanceAlertThreshold ?? current.performanceAlertThreshold,
    autoResolveTimeoutHours: settings.autoResolveTimeoutHours ?? current.autoResolveTimeoutHours,
  };

  await logActivity(db, {
    companyId,
    actorType: "user",
    actorId,
    action: SETTINGS_ACTION,
    entityType: "company",
    entityId: companyId,
    details: {
      spendingAlertThresholdCents: merged.spendingAlertThresholdCents,
      performanceAlertThreshold: merged.performanceAlertThreshold,
      autoResolveTimeoutHours: merged.autoResolveTimeoutHours,
    },
  });

  return merged;
}
