import type { Issue } from "@ironworksai/shared";

export interface GoalRiskAssessmentResult {
  level: "low" | "medium" | "high" | "critical";
  blockedPercent: number;
  overdueCount: number;
  totalIssues: number;
  description: string;
}

export function calculateGoalRisk(issues: Issue[], targetDate: string | null): GoalRiskAssessmentResult {
  const total = issues.length;
  if (total === 0)
    return { level: "low", blockedPercent: 0, overdueCount: 0, totalIssues: 0, description: "No linked issues" };

  const blockedCount = issues.filter((i) => i.status === "blocked").length;
  const blockedPercent = Math.round((blockedCount / total) * 100);

  let overdueCount = 0;
  if (targetDate) {
    const target = new Date(targetDate).getTime();
    const now = Date.now();
    if (now > target) {
      overdueCount = issues.filter((i) => i.status !== "done" && i.status !== "cancelled").length;
    }
  }

  let level: GoalRiskAssessmentResult["level"] = "low";
  if (blockedPercent >= 50 || overdueCount > total * 0.5) level = "critical";
  else if (blockedPercent >= 30 || overdueCount > total * 0.25) level = "high";
  else if (blockedPercent >= 15 || overdueCount > 0) level = "medium";

  const parts: string[] = [];
  if (blockedPercent > 0) parts.push(`${blockedPercent}% blocked`);
  if (overdueCount > 0) parts.push(`${overdueCount} overdue`);
  const description = parts.length > 0 ? parts.join(", ") : "On track";

  return { level, blockedPercent, overdueCount, totalIssues: total, description };
}

export const riskColors: Record<GoalRiskAssessmentResult["level"], string> = {
  low: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  high: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30",
  critical: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
};
