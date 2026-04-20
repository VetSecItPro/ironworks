import type { Goal } from "@ironworksai/shared";
import type { GoalProgressItem } from "../../api/goalProgress";

export type GoalHealth = "on_track" | "at_risk" | "off_track" | "no_data";

/** Prefer the backend-computed healthStatus; fall back to local heuristic. */
export function resolveGoalHealth(goal: Goal, progress?: GoalProgressItem | null): GoalHealth {
  // Use server-computed healthStatus when present
  if (goal.healthStatus && goal.healthStatus !== "no_data" && goal.healthStatus !== "achieved") {
    return goal.healthStatus as GoalHealth;
  }
  return computeGoalHealth(goal, progress);
}

function computeGoalHealth(goal: Goal, progress?: GoalProgressItem | null): GoalHealth {
  if (!progress || progress.totalIssues === 0) return "no_data";
  if (!goal.targetDate) {
    // No deadline - use completion percent heuristics
    if (progress.progressPercent >= 70) return "on_track";
    if (progress.blockedIssues > 0) return "at_risk";
    return "on_track";
  }

  const now = new Date();
  const created = new Date(goal.createdAt);
  const target = new Date(goal.targetDate);
  const totalDuration = target.getTime() - created.getTime();
  const elapsed = now.getTime() - created.getTime();

  // Past deadline and not done
  if (now > target && progress.progressPercent < 100) return "off_track";

  // No meaningful duration to measure against
  if (totalDuration <= 0) return progress.progressPercent >= 50 ? "on_track" : "at_risk";

  const timePercent = Math.min(100, (elapsed / totalDuration) * 100);
  const progressPercent = progress.progressPercent;
  const pace = progressPercent - timePercent;

  // Blocked issues are a risk signal
  if (progress.blockedIssues > 0 && pace < 10) return "at_risk";

  if (pace >= -10) return "on_track";
  if (pace >= -30) return "at_risk";
  return "off_track";
}

export function forecastCompletion(goal: Goal, progress?: GoalProgressItem | null): string | null {
  if (!progress || progress.totalIssues === 0 || progress.completedIssues === 0) return null;

  const created = new Date(goal.createdAt);
  const now = new Date();
  const elapsed = now.getTime() - created.getTime();
  if (elapsed <= 0) return null;

  // Velocity: completed issues per ms
  const velocity = progress.completedIssues / elapsed;
  if (velocity <= 0) return null;

  const remaining = progress.totalIssues - progress.completedIssues;
  const msToComplete = remaining / velocity;
  const forecast = new Date(now.getTime() + msToComplete);

  return forecast.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const HEALTH_CONFIG: Record<GoalHealth, { label: string; className: string }> = {
  on_track: { label: "On Track", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  at_risk: { label: "At Risk", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  off_track: { label: "Off Track", className: "bg-red-500/10 text-red-600 dark:text-red-400" },
  no_data: { label: "", className: "" },
};
