import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

export type BackupRetentionPolicy = {
  dailyDays: number;
  weeklyWeeks: number;
  monthlyMonths: number;
};

export const DEFAULT_RETENTION_POLICY: BackupRetentionPolicy = {
  dailyDays: 7,
  weeklyWeeks: 4,
  monthlyMonths: 1,
};

export function isBackupFile(name: string, filenamePrefix: string): boolean {
  return name.startsWith(`${filenamePrefix}-`) && (name.endsWith(".sql") || name.endsWith(".sql.gz"));
}

/** ISO week key (e.g. "2026-W15") for a given date. */
function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Resolve the effective retention policy from backup options.
 * Supports backward compatibility with the deprecated retentionDays field.
 */
export function resolveRetentionPolicy(opts: {
  retentionPolicy?: BackupRetentionPolicy;
  retentionDays?: number;
}): BackupRetentionPolicy {
  if (opts.retentionPolicy) return opts.retentionPolicy;
  if (opts.retentionDays != null) {
    // Backward compatibility: treat retentionDays as daily tier, no weekly/monthly
    return { dailyDays: Math.max(1, Math.trunc(opts.retentionDays)), weeklyWeeks: 0, monthlyMonths: 0 };
  }
  return DEFAULT_RETENTION_POLICY;
}

/**
 * Prune backups using a tiered retention policy.
 *
 * - Daily tier: keep ALL backups within the daily window.
 * - Weekly tier: keep the newest backup per ISO week within the weekly window.
 * - Monthly tier: keep the newest backup per calendar month within the monthly window.
 * - Everything not kept by any tier is deleted.
 */
export function pruneBackupsWithPolicy(
  backupDir: string,
  policy: BackupRetentionPolicy,
  filenamePrefix: string,
): number {
  if (!existsSync(backupDir)) return 0;

  const now = Date.now();
  const dailyCutoff = now - Math.max(1, Math.trunc(policy.dailyDays)) * 24 * 60 * 60 * 1000;
  const weeklyCutoff = now - Math.max(0, Math.trunc(policy.weeklyWeeks)) * 7 * 24 * 60 * 60 * 1000;
  const monthlyCutoff = now - Math.max(0, Math.trunc(policy.monthlyMonths)) * 30 * 24 * 60 * 60 * 1000;

  // Collect all backup files with their modification times
  const entries: { name: string; fullPath: string; mtimeMs: number }[] = [];
  for (const name of readdirSync(backupDir)) {
    if (!isBackupFile(name, filenamePrefix)) continue;
    const fullPath = resolve(backupDir, name);
    const stat = statSync(fullPath);
    entries.push({ name, fullPath, mtimeMs: stat.mtimeMs });
  }

  // Sort newest first so the first file seen per bucket is the one we keep
  entries.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const keep = new Set<string>();
  const seenWeeks = new Set<string>();
  const seenMonths = new Set<string>();

  for (const entry of entries) {
    const date = new Date(entry.mtimeMs);

    // Daily tier: keep ALL backups within the daily window
    if (entry.mtimeMs >= dailyCutoff) {
      keep.add(entry.fullPath);
      continue;
    }

    // Weekly tier: keep the newest backup per ISO week within the weekly window
    if (policy.weeklyWeeks > 0 && entry.mtimeMs >= weeklyCutoff) {
      const wk = isoWeekKey(date);
      if (!seenWeeks.has(wk)) {
        seenWeeks.add(wk);
        keep.add(entry.fullPath);
        continue;
      }
    }

    // Monthly tier: keep the newest backup per month within the monthly window
    if (policy.monthlyMonths > 0 && entry.mtimeMs >= monthlyCutoff) {
      const mk = monthKey(date);
      if (!seenMonths.has(mk)) {
        seenMonths.add(mk);
        keep.add(entry.fullPath);
        continue;
      }
    }
  }

  // Delete everything not kept by any tier
  let pruned = 0;
  for (const entry of entries) {
    if (!keep.has(entry.fullPath)) {
      unlinkSync(entry.fullPath);
      pruned++;
    }
  }

  return pruned;
}
