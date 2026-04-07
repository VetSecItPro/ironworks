import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { goalsApi } from "../api/goals";
import { activityApi } from "../api/activity";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { assetsApi } from "../api/assets";
import { goalProgressApi } from "../api/goalProgress";
import { goalKeyResultsApi, type GoalKeyResult } from "../api/goalKeyResults";
import { goalCheckInsApi, type CreateCheckInPayload } from "../api/goalCheckIns";
import { goalSnapshotsApi, type GoalSnapshotDTO } from "../api/goalSnapshots";
import { usePanel } from "../context/PanelContext";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { GoalProperties } from "../components/GoalProperties";
import { GoalTree } from "../components/GoalTree";
import { StatusBadge } from "../components/StatusBadge";
import { InlineEditor } from "../components/InlineEditor";
import { EntityRow } from "../components/EntityRow";
import { ActivityRow } from "../components/ActivityRow";
import { PageSkeleton } from "../components/PageSkeleton";
import { projectUrl } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, BarChart3, CheckCircle2, CheckSquare, Circle, ClipboardCheck, CopyPlus, History, Loader2, PanelRightClose, PanelRightOpen, Plus, ShieldAlert, Square, Target, TrendingUp, Trash2, Users } from "lucide-react";
import { cn } from "../lib/utils";
import { useNavigate } from "@/lib/router";
import { useToast } from "../context/ToastContext";
import type { Goal, GoalCheckIn, GoalHealthStatus, Issue, Project } from "@ironworksai/shared";

/* ── Goal Quality Score (SMART) ── */

interface SmartCriteria {
  specific: boolean;
  measurable: boolean;
  achievable: boolean;
  relevant: boolean;
  timeBound: boolean;
}

function evaluateSmart(goal: Goal, keyResultCount: number): SmartCriteria {
  return {
    specific: !!goal.description && goal.description.trim().length > 0,
    measurable: keyResultCount > 0,
    achievable: (goal.confidence ?? 0) > 30,
    relevant: !!goal.parentId || goal.level === "company",
    timeBound: !!goal.targetDate,
  };
}

function SmartQualityIndicator({ criteria }: { criteria: SmartCriteria }) {
  const items: Array<{ key: keyof SmartCriteria; label: string }> = [
    { key: "specific", label: "Specific (has description)" },
    { key: "measurable", label: "Measurable (has key results)" },
    { key: "achievable", label: "Achievable (confidence > 30)" },
    { key: "relevant", label: "Relevant (has parent or is company-level)" },
    { key: "timeBound", label: "Time-bound (has target date)" },
  ];
  const score = items.filter((i) => criteria[i.key]).length;

  return (
    <div className="flex items-center gap-1.5" title={`Goal Quality: ${score}/5 SMART criteria met`}>
      <span className="text-[10px] text-muted-foreground font-medium mr-0.5">SMART</span>
      {items.map((item) => (
        <span
          key={item.key}
          className={cn(
            "h-2 w-2 rounded-full transition-colors",
            criteria[item.key] ? "bg-emerald-500" : "bg-muted-foreground/20",
          )}
          title={`${item.label}: ${criteria[item.key] ? "Met" : "Not met"}`}
        />
      ))}
      <span className="text-[10px] text-muted-foreground tabular-nums ml-0.5">{score}/5</span>
    </div>
  );
}

/* ── Celebration Animation ── */

function CelebrationOverlay({ show }: { show: boolean }) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
      <div className="animate-bounce text-6xl opacity-90">
        <CheckCircle2 className="h-24 w-24 text-emerald-500 drop-shadow-lg" />
      </div>
      {/* Confetti particles */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i * 30) * (Math.PI / 180);
        const distance = 80 + Math.random() * 60;
        const colors = ["bg-emerald-500", "bg-blue-500", "bg-amber-500", "bg-violet-500", "bg-rose-500"];
        return (
          <div
            key={i}
            className={cn("absolute h-2 w-2 rounded-full", colors[i % colors.length])}
            style={{
              left: `calc(50% + ${Math.cos(angle) * distance}px)`,
              top: `calc(50% + ${Math.sin(angle) * distance}px)`,
              animation: `confetti-burst 0.7s ease-out forwards`,
              animationDelay: `${i * 30}ms`,
              opacity: 0,
            }}
          />
        );
      })}
    </div>
  );
}

/* ── Burnup Chart ── */

function GoalBurnupChart({ issues, targetDate, startDate: goalStartDate }: { issues: Issue[]; targetDate: string | null; startDate: string | null }) {
  const total = issues.length;
  if (total < 5) return null;

  // Build completion timeline
  const completedIssues = issues
    .filter((i) => (i.status === "done" || i.status === "cancelled") && i.completedAt)
    .map((i) => new Date(i.completedAt!).getTime())
    .sort((a, b) => a - b);

  // Build scope timeline (when issues were created)
  const scopeEvents = issues
    .map((i) => new Date(i.createdAt).getTime())
    .sort((a, b) => a - b);

  const createdDates = issues.map((i) => new Date(i.createdAt).getTime());
  const startDate = goalStartDate ? new Date(goalStartDate).getTime() : Math.min(...createdDates);
  const now = Date.now();
  const endDate = targetDate ? Math.max(new Date(targetDate).getTime(), now) : now;
  const range = endDate - startDate || 1;

  // Build scope line points (cumulative issues created over time)
  const scopePoints: Array<{ x: number; y: number }> = [];
  let scopeCount = 0;
  for (const ts of scopeEvents) {
    scopeCount++;
    const x = ((ts - startDate) / range) * 100;
    scopePoints.push({ x: Math.min(100, Math.max(0, x)), y: scopeCount });
  }
  // Extend to now
  const nowX = ((now - startDate) / range) * 100;
  scopePoints.push({ x: Math.min(100, nowX), y: scopeCount });

  // Build completed line points (cumulative completed over time)
  const completedPoints: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];
  let doneCount = 0;
  for (const ts of completedIssues) {
    doneCount++;
    const x = ((ts - startDate) / range) * 100;
    completedPoints.push({ x: Math.min(100, Math.max(0, x)), y: doneCount });
  }
  completedPoints.push({ x: Math.min(100, nowX), y: doneCount });

  const svgW = 360;
  const svgH = 110;
  const maxY = Math.max(total, 1);

  const toSvgPath = (points: Array<{ x: number; y: number }>) =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${(p.x / 100) * svgW} ${svgH - 20 - (p.y / maxY) * (svgH - 30)}`)
      .join(" ");

  const scopePath = toSvgPath(scopePoints);
  const completedPath = toSvgPath(completedPoints);
  // Ideal line: diagonal from 0 to total
  const idealPath = `M 0 ${svgH - 20} L ${svgW} ${svgH - 20 - (svgH - 30)}`;

  const startLabel = new Date(startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel = targetDate
    ? new Date(targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "Now";

  return (
    <div className="rounded-xl border border-border p-4 space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <BarChart3 className="h-3.5 w-3.5" />
        Burnup
      </h4>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Grid */}
        <line x1="0" y1={svgH - 20} x2={svgW} y2={svgH - 20} className="stroke-muted/30" strokeWidth="0.5" />
        <line x1="0" y1={(svgH - 20) / 2} x2={svgW} y2={(svgH - 20) / 2} className="stroke-muted/30" strokeWidth="0.5" />
        <line x1="0" y1="10" x2={svgW} y2="10" className="stroke-muted/30" strokeWidth="0.5" />

        {/* Y labels */}
        <text x="2" y="8" className="fill-muted-foreground text-[7px]">{total}</text>
        <text x="2" y={svgH - 16} className="fill-muted-foreground text-[7px]">0</text>

        {/* Ideal line (dashed) */}
        {targetDate && (
          <path d={idealPath} fill="none" className="stroke-muted-foreground/30" strokeWidth="1" strokeDasharray="4 3" />
        )}

        {/* Scope line (total issues) */}
        <path d={scopePath} fill="none" className="stroke-violet-500/60" strokeWidth="1.5" />

        {/* Completed line */}
        <path d={completedPath} fill="none" className="stroke-emerald-500" strokeWidth="2" />

        {/* X labels */}
        <text x="2" y={svgH - 2} className="fill-muted-foreground text-[7px]">{startLabel}</text>
        <text x={svgW - 2} y={svgH - 2} textAnchor="end" className="fill-muted-foreground text-[7px]">{endLabel}</text>
      </svg>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 bg-emerald-500 shrink-0" />
          Completed
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 bg-violet-500/60 shrink-0" />
          Total Scope
        </span>
        {targetDate && (
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-3 bg-muted-foreground/30 shrink-0" />
            Ideal
          </span>
        )}
        <span className="ml-auto">{doneCount}/{total} done</span>
      </div>
    </div>
  );
}

/* ── RACI Display ── */

function RaciDisplay({
  goal,
  agentMap,
  parentGoal,
}: {
  goal: Goal;
  agentMap: Map<string, import("@ironworksai/shared").Agent>;
  parentGoal?: Goal | null;
}) {
  const responsible = goal.ownerAgentId ? agentMap.get(goal.ownerAgentId) : null;
  const accountableAgentId = parentGoal?.ownerAgentId ?? null;
  const accountable = accountableAgentId ? agentMap.get(accountableAgentId) : null;

  if (!responsible && !accountable) return null;

  return (
    <div className="flex items-center gap-3">
      {responsible && (
        <div className="flex items-center gap-1.5" title={`Responsible: ${responsible.name}`}>
          <div className="h-6 w-6 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-[10px] font-bold text-blue-600 dark:text-blue-400">
            R
          </div>
          <span className="text-xs text-muted-foreground truncate max-w-[100px]">{responsible.name}</span>
        </div>
      )}
      {accountable && (
        <div className="flex items-center gap-1.5" title={`Accountable: ${accountable.name}`}>
          <div className="h-6 w-6 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-[10px] font-bold text-amber-600 dark:text-amber-400">
            A
          </div>
          <span className="text-xs text-muted-foreground truncate max-w-[100px]">{accountable.name}</span>
        </div>
      )}
      {!accountable && !parentGoal && (
        <div className="flex items-center gap-1.5" title="Accountable: Company leadership (top-level goal)">
          <div className="h-6 w-6 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-[10px] font-bold text-amber-600 dark:text-amber-400">
            A
          </div>
          <span className="text-xs text-muted-foreground">Leadership</span>
        </div>
      )}
    </div>
  );
}

/* ── Risk Assessment (12.55) ── */

interface GoalRiskAssessment {
  level: "low" | "medium" | "high" | "critical";
  blockedPercent: number;
  overdueCount: number;
  totalIssues: number;
  description: string;
}

function calculateGoalRisk(issues: Issue[], targetDate: string | null): GoalRiskAssessment {
  const total = issues.length;
  if (total === 0) return { level: "low", blockedPercent: 0, overdueCount: 0, totalIssues: 0, description: "No linked issues" };

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

  let level: GoalRiskAssessment["level"] = "low";
  if (blockedPercent >= 50 || overdueCount > total * 0.5) level = "critical";
  else if (blockedPercent >= 30 || overdueCount > total * 0.25) level = "high";
  else if (blockedPercent >= 15 || overdueCount > 0) level = "medium";

  const parts: string[] = [];
  if (blockedPercent > 0) parts.push(`${blockedPercent}% blocked`);
  if (overdueCount > 0) parts.push(`${overdueCount} overdue`);
  const description = parts.length > 0 ? parts.join(", ") : "On track";

  return { level, blockedPercent, overdueCount, totalIssues: total, description };
}

const riskColors: Record<GoalRiskAssessment["level"], string> = {
  low: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  high: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30",
  critical: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
};

/* ── Burndown Chart ── */

function GoalBurndownChart({ issues, targetDate }: { issues: Issue[]; targetDate: string | null }) {
  const total = issues.length;
  if (total === 0) return null;

  // Build completion timeline: sorted list of completion dates
  const completedIssues = issues
    .filter((i) => (i.status === "done" || i.status === "cancelled") && i.completedAt)
    .map((i) => new Date(i.completedAt!).getTime())
    .sort((a, b) => a - b);

  // Determine date range
  const createdDates = issues.map((i) => new Date(i.createdAt).getTime());
  const startDate = Math.min(...createdDates);
  const now = Date.now();
  const endDate = targetDate ? Math.max(new Date(targetDate).getTime(), now) : now;
  const range = endDate - startDate || 1;

  // Build stepped actual burndown points
  const actualPoints: Array<{ x: number; y: number }> = [{ x: 0, y: total }];
  let remaining = total;
  for (const ts of completedIssues) {
    remaining--;
    const x = ((ts - startDate) / range) * 100;
    actualPoints.push({ x: Math.min(100, Math.max(0, x)), y: remaining });
  }
  // Extend to current time
  const nowX = ((now - startDate) / range) * 100;
  actualPoints.push({ x: Math.min(100, nowX), y: remaining });

  // Build SVG path for actual line (stepped)
  const actualPath = actualPoints
    .map((p, i) => {
      if (i === 0) return `M ${p.x * 3.6} ${(1 - p.y / total) * 80 + 10}`;
      const prev = actualPoints[i - 1];
      return `L ${p.x * 3.6} ${(1 - prev.y / total) * 80 + 10} L ${p.x * 3.6} ${(1 - p.y / total) * 80 + 10}`;
    })
    .join(" ");

  // Ideal line: from (0, total) to (100%, 0)
  const idealPath = "M 0 10 L 360 90";

  const startLabel = new Date(startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel = targetDate
    ? new Date(targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "Now";

  return (
    <div className="rounded-xl border border-border p-4 space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Burndown</h4>
      <svg viewBox="0 0 360 110" className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        <line x1="0" y1="10" x2="360" y2="10" className="stroke-muted/30" strokeWidth="0.5" />
        <line x1="0" y1="50" x2="360" y2="50" className="stroke-muted/30" strokeWidth="0.5" />
        <line x1="0" y1="90" x2="360" y2="90" className="stroke-muted/30" strokeWidth="0.5" />

        {/* Y-axis labels */}
        <text x="2" y="8" className="fill-muted-foreground text-[7px]">{total}</text>
        <text x="2" y="94" className="fill-muted-foreground text-[7px]">0</text>

        {/* Ideal line (dashed) */}
        {targetDate && (
          <path d={idealPath} fill="none" className="stroke-muted-foreground/40" strokeWidth="1" strokeDasharray="4 3" />
        )}

        {/* Actual burndown */}
        <path d={actualPath} fill="none" className="stroke-blue-500" strokeWidth="2" />

        {/* X-axis labels */}
        <text x="2" y="106" className="fill-muted-foreground text-[7px]">{startLabel}</text>
        <text x="358" y="106" textAnchor="end" className="fill-muted-foreground text-[7px]">{endLabel}</text>
      </svg>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 bg-blue-500 shrink-0" />
          Actual
        </span>
        {targetDate && (
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-3 bg-muted-foreground/40 shrink-0" />
            Ideal
          </span>
        )}
        <span className="ml-auto">{total - remaining}/{total} done</span>
      </div>
    </div>
  );
}

/* ── Health Status Badge (unified) ── */

const HEALTH_STATUS_COLORS: Record<string, string> = {
  on_track: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  at_risk: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  off_track: "bg-red-500/10 text-red-600 dark:text-red-400",
  achieved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  no_data: "bg-muted text-muted-foreground",
};

const HEALTH_STATUS_LABELS: Record<string, string> = {
  on_track: "On Track",
  at_risk: "At Risk",
  off_track: "Off Track",
  achieved: "Achieved",
  no_data: "No Data",
};

function GoalHealthBadge({ status }: { status: GoalHealthStatus | null }) {
  const key = status ?? "no_data";
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0", HEALTH_STATUS_COLORS[key] ?? HEALTH_STATUS_COLORS.no_data)}>
      {HEALTH_STATUS_LABELS[key] ?? "No Data"}
    </span>
  );
}

/* ── Health Trend Sparkline ── */

function HealthTrendChart({ snapshots }: { snapshots: GoalSnapshotDTO[] }) {
  if (snapshots.length < 2) return null;

  // Sort chronologically
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime(),
  );

  const points = sorted
    .filter((s) => s.healthScore != null)
    .map((s) => ({
      date: new Date(s.snapshotDate),
      score: s.healthScore!,
    }));

  if (points.length < 2) return null;

  const minScore = Math.min(...points.map((p) => p.score));
  const maxScore = Math.max(...points.map((p) => p.score));
  const scoreRange = maxScore - minScore || 1;
  const minDate = points[0].date.getTime();
  const maxDate = points[points.length - 1].date.getTime();
  const dateRange = maxDate - minDate || 1;

  const svgWidth = 360;
  const svgHeight = 80;
  const padding = 8;
  const chartWidth = svgWidth - padding * 2;
  const chartHeight = svgHeight - padding * 2;

  const pathPoints = points.map((p) => ({
    x: padding + ((p.date.getTime() - minDate) / dateRange) * chartWidth,
    y: padding + chartHeight - ((p.score - minScore) / scoreRange) * chartHeight,
  }));

  const pathD = pathPoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const startLabel = points[0].date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel = points[points.length - 1].date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="rounded-xl border border-border p-4 space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <TrendingUp className="h-3.5 w-3.5" />
        Health Trend (last 30 days)
      </h4>
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight + 16}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Grid */}
        <line x1={padding} y1={padding} x2={svgWidth - padding} y2={padding} className="stroke-muted/30" strokeWidth="0.5" />
        <line x1={padding} y1={padding + chartHeight / 2} x2={svgWidth - padding} y2={padding + chartHeight / 2} className="stroke-muted/30" strokeWidth="0.5" />
        <line x1={padding} y1={padding + chartHeight} x2={svgWidth - padding} y2={padding + chartHeight} className="stroke-muted/30" strokeWidth="0.5" />

        {/* Y labels */}
        <text x={2} y={padding + 3} className="fill-muted-foreground text-[7px]">{maxScore}</text>
        <text x={2} y={padding + chartHeight + 3} className="fill-muted-foreground text-[7px]">{minScore}</text>

        {/* Line */}
        <path d={pathD} fill="none" className="stroke-blue-500" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Dots */}
        {pathPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.5" className="fill-blue-500" />
        ))}

        {/* X labels */}
        <text x={padding} y={svgHeight + 12} className="fill-muted-foreground text-[7px]">{startLabel}</text>
        <text x={svgWidth - padding} y={svgHeight + 12} textAnchor="end" className="fill-muted-foreground text-[7px]">{endLabel}</text>
      </svg>
    </div>
  );
}

/* ── Check-in Status Badge ── */

const CHECKIN_STATUS_COLORS: Record<string, string> = {
  on_track: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  at_risk: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  off_track: "bg-red-500/10 text-red-600 dark:text-red-400",
  achieved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  cancelled: "bg-muted text-muted-foreground",
};

function CheckInStatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", CHECKIN_STATUS_COLORS[status] ?? "bg-muted text-muted-foreground")}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

/* ── Check-in Form ── */

function AddCheckInForm({
  defaultConfidence,
  onSubmit,
  isPending,
}: {
  defaultConfidence: number;
  onSubmit: (data: CreateCheckInPayload) => void;
  isPending: boolean;
}) {
  const [status, setStatus] = useState("on_track");
  const [confidence, setConfidence] = useState(defaultConfidence);
  const [note, setNote] = useState("");
  const [blockers, setBlockers] = useState("");
  const [nextSteps, setNextSteps] = useState("");

  const handleSubmit = () => {
    onSubmit({
      status,
      confidence,
      note: note.trim() || undefined,
      blockers: blockers.trim() || undefined,
      nextSteps: nextSteps.trim() || undefined,
    });
    setNote("");
    setBlockers("");
    setNextSteps("");
  };

  const confColor =
    confidence > 66
      ? "text-emerald-600 dark:text-emerald-400"
      : confidence > 33
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add Check-in</h4>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Status</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="on_track">On Track</SelectItem>
              <SelectItem value="at_risk">At Risk</SelectItem>
              <SelectItem value="off_track">Off Track</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            Confidence: <span className={cn("font-medium", confColor)}>{confidence}</span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={confidence}
            onChange={(e) => setConfidence(Number(e.target.value))}
            className="w-full h-1.5 accent-foreground cursor-pointer"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Note</label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What progress was made?"
          className="text-sm min-h-[60px]"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Blockers (optional)</label>
          <Textarea
            value={blockers}
            onChange={(e) => setBlockers(e.target.value)}
            placeholder="Any blockers?"
            className="text-sm min-h-[40px]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Next Steps (optional)</label>
          <Textarea
            value={nextSteps}
            onChange={(e) => setNextSteps(e.target.value)}
            placeholder="What's next?"
            className="text-sm min-h-[40px]"
          />
        </div>
      </div>

      <Button size="sm" onClick={handleSubmit} disabled={isPending}>
        {isPending ? "Submitting..." : "Submit Check-in"}
      </Button>
    </div>
  );
}

/* ── Milestones (localStorage) ── */

interface Milestone {
  id: string;
  title: string;
  targetDate: string;
  completed: boolean;
}

function useMilestones(goalId: string) {
  const key = `ironworks:milestones:${goalId}`;
  const [milestones, setMilestones] = useState<Milestone[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "[]");
    } catch {
      return [];
    }
  });

  const save = useCallback(
    (ms: Milestone[]) => {
      setMilestones(ms);
      try {
        localStorage.setItem(key, JSON.stringify(ms));
      } catch {
        // ignore
      }
    },
    [key],
  );

  const add = useCallback(
    (title: string, targetDate: string) => {
      const ms = [...milestones, { id: crypto.randomUUID(), title, targetDate, completed: false }];
      save(ms);
    },
    [milestones, save],
  );

  const toggle = useCallback(
    (id: string) => {
      const ms = milestones.map((m) => (m.id === id ? { ...m, completed: !m.completed } : m));
      save(ms);
    },
    [milestones, save],
  );

  const remove = useCallback(
    (id: string) => {
      save(milestones.filter((m) => m.id !== id));
    },
    [milestones, save],
  );

  return { milestones, add, toggle, remove };
}

/* ── Agent Contribution Chart ── */

function AgentContributionSection({
  issues,
  agentMap,
}: {
  issues: Issue[];
  agentMap: Map<string, import("@ironworksai/shared").Agent>;
}) {
  const contributions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const issue of issues) {
      if (issue.status === "done" && issue.assigneeAgentId) {
        counts.set(issue.assigneeAgentId, (counts.get(issue.assigneeAgentId) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([agentId, count]) => ({
        agentId,
        name: agentMap.get(agentId)?.name ?? agentId.slice(0, 8),
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [issues, agentMap]);

  if (contributions.length === 0) return null;

  const maxCount = contributions[0].count;

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5" />
        Agent Contributions
      </h4>
      <div className="space-y-2">
        {contributions.map((c) => (
          <div key={c.agentId} className="flex items-center gap-2">
            <span className="text-xs w-24 truncate shrink-0">{c.name}</span>
            <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${(c.count / maxCount) * 100}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums w-6 text-right">{c.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GoalDetail() {
  const { goalId } = useParams<{ goalId: string }>();
  const { selectedCompanyId, setSelectedCompanyId } = useCompany();
  const { openNewGoal, openNewIssue } = useDialog();
  const { openPanel, closePanel } = usePanel();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [twoPane, setTwoPane] = useState(() => {
    try { return localStorage.getItem("ironworks:goal-two-pane") === "true"; } catch { return false; }
  });

  const {
    data: goal,
    isLoading,
    error
  } = useQuery({
    queryKey: queryKeys.goals.detail(goalId!),
    queryFn: () => goalsApi.get(goalId!),
    enabled: !!goalId
  });
  const resolvedCompanyId = goal?.companyId ?? selectedCompanyId;

  const { data: allGoals } = useQuery({
    queryKey: queryKeys.goals.list(resolvedCompanyId!),
    queryFn: () => goalsApi.list(resolvedCompanyId!),
    enabled: !!resolvedCompanyId
  });

  const { data: allProjects } = useQuery({
    queryKey: queryKeys.projects.list(resolvedCompanyId!),
    queryFn: () => projectsApi.list(resolvedCompanyId!),
    enabled: !!resolvedCompanyId
  });

  // Issues linked to this goal
  const { data: allIssues } = useQuery({
    queryKey: queryKeys.issues.list(resolvedCompanyId!),
    queryFn: () => issuesApi.list(resolvedCompanyId!),
    enabled: !!resolvedCompanyId,
  });

  const goalIssues = (allIssues ?? []).filter((i: Issue) => i.goalId === goalId);

  // Activity for linked issues
  const goalIssueIds = new Set(goalIssues.map((i: Issue) => i.id));
  const { data: allActivity } = useQuery({
    queryKey: queryKeys.activity(resolvedCompanyId!),
    queryFn: () => activityApi.list(resolvedCompanyId!),
    enabled: !!resolvedCompanyId,
    staleTime: 30_000,
  });
  const { data: allAgents } = useQuery({
    queryKey: queryKeys.agents.list(resolvedCompanyId!),
    queryFn: () => agentsApi.list(resolvedCompanyId!),
    enabled: !!resolvedCompanyId,
  });
  const goalActivity = (allActivity ?? []).filter((e) =>
    (e.entityType === "issue" && goalIssueIds.has(e.entityId)) ||
    (e.entityType === "goal" && e.entityId === goalId)
  ).slice(0, 30);
  const agentMap = useMemo(() => {
    const map = new Map<string, import("@ironworksai/shared").Agent>();
    for (const a of allAgents ?? []) map.set(a.id, a);
    return map;
  }, [allAgents]);
  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of allIssues ?? []) map.set(`issue:${i.id}`, (i as Issue).identifier ?? i.id.slice(0, 8));
    if (goal) map.set(`goal:${goal.id}`, goal.title);
    return map;
  }, [allIssues, goal]);
  const entityTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of allIssues ?? []) map.set(`issue:${i.id}`, i.title);
    return map;
  }, [allIssues]);

  // Key Results
  const { data: keyResults } = useQuery({
    queryKey: queryKeys.goals.keyResults(resolvedCompanyId!, goalId!),
    queryFn: () => goalKeyResultsApi.list(resolvedCompanyId!, goalId!),
    enabled: !!resolvedCompanyId && !!goalId,
  });

  const createKeyResult = useMutation({
    mutationFn: (data: { description: string; targetValue?: string; unit?: string }) =>
      goalKeyResultsApi.create(resolvedCompanyId!, goalId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.keyResults(resolvedCompanyId!, goalId!) });
    },
  });

  const updateKeyResult = useMutation({
    mutationFn: ({ krId, data }: { krId: string; data: { currentValue?: string; description?: string } }) =>
      goalKeyResultsApi.update(resolvedCompanyId!, goalId!, krId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.keyResults(resolvedCompanyId!, goalId!) });
    },
  });

  const deleteKeyResult = useMutation({
    mutationFn: (krId: string) =>
      goalKeyResultsApi.remove(resolvedCompanyId!, goalId!, krId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.keyResults(resolvedCompanyId!, goalId!) });
    },
  });

  const [showKrForm, setShowKrForm] = useState(false);
  const [krDescription, setKrDescription] = useState("");
  const [krTarget, setKrTarget] = useState("100");
  const [krUnit, setKrUnit] = useState("%");
  const [editingKrId, setEditingKrId] = useState<string | null>(null);
  const [editingKrValue, setEditingKrValue] = useState("");

  // Check-ins
  const { data: checkIns } = useQuery({
    queryKey: queryKeys.goals.checkIns(resolvedCompanyId!, goalId!),
    queryFn: () => goalCheckInsApi.list(resolvedCompanyId!, goalId!),
    enabled: !!resolvedCompanyId && !!goalId,
  });

  const createCheckIn = useMutation({
    mutationFn: (data: CreateCheckInPayload) =>
      goalCheckInsApi.create(resolvedCompanyId!, goalId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.checkIns(resolvedCompanyId!, goalId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.detail(goalId!) });
    },
  });

  // Snapshots (for trend chart)
  const { data: snapshots } = useQuery({
    queryKey: queryKeys.goals.snapshots(resolvedCompanyId!, goalId!),
    queryFn: () => goalSnapshotsApi.list(resolvedCompanyId!, goalId!, 30),
    enabled: !!resolvedCompanyId && !!goalId,
  });

  // Milestones (localStorage)
  const milestonesHook = useMilestones(goalId!);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDate, setMilestoneDate] = useState("");

  // Goal progress stats
  const { data: progress } = useQuery({
    queryKey: ["goals", "progress-detail", goalId],
    queryFn: () => goalProgressApi.detail(goalId!),
    enabled: !!goalId,
  });

  useEffect(() => {
    if (!goal?.companyId || goal.companyId === selectedCompanyId) return;
    setSelectedCompanyId(goal.companyId, { source: "route_sync" });
  }, [goal?.companyId, selectedCompanyId, setSelectedCompanyId]);

  const updateGoal = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      goalsApi.update(goalId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.goals.detail(goalId!)
      });
      if (resolvedCompanyId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.goals.list(resolvedCompanyId)
        });
      }
    }
  });

  const uploadImage = useMutation({
    mutationFn: async (file: File) => {
      if (!resolvedCompanyId) throw new Error("No company selected");
      return assetsApi.uploadImage(
        resolvedCompanyId,
        file,
        `goals/${goalId ?? "draft"}`
      );
    }
  });

  const cloneGoal = useMutation({
    mutationFn: async () => {
      if (!goal || !resolvedCompanyId) throw new Error("No goal to clone");
      return goalsApi.create(resolvedCompanyId, {
        title: `${goal.title} (Copy)`,
        description: goal.description,
        level: goal.level,
        status: "planned",
        parentId: goal.parentId,
        targetDate: goal.targetDate,
      });
    },
    onSuccess: (cloned) => {
      pushToast({ title: `Goal cloned as "${cloned.title}"`, tone: "success" });
      if (resolvedCompanyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.goals.list(resolvedCompanyId) });
      }
      navigate(`/goals/${cloned.id}`);
    },
    onError: () => {
      pushToast({ title: "Failed to clone goal", tone: "error" });
    },
  });

  const riskAssessment = useMemo(
    () => calculateGoalRisk(goalIssues, goal?.targetDate ?? null),
    [goalIssues, goal?.targetDate],
  );

  // SMART quality criteria
  const smartCriteria = useMemo(
    () => goal ? evaluateSmart(goal, (keyResults ?? []).length) : null,
    [goal, keyResults],
  );

  // Parent goal for RACI
  const parentGoal = useMemo(
    () => goal?.parentId ? (allGoals ?? []).find((g) => g.id === goal.parentId) ?? null : null,
    [goal?.parentId, allGoals],
  );

  // Celebration on achievement
  const [showCelebration, setShowCelebration] = useState(false);
  const prevStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!goal) return;
    if (prevStatusRef.current && prevStatusRef.current !== "achieved" && goal.status === "achieved") {
      setShowCelebration(true);
      pushToast({ title: `Goal achieved: ${goal.title}`, tone: "success" });
      const timer = setTimeout(() => setShowCelebration(false), 2000);
      return () => clearTimeout(timer);
    }
    prevStatusRef.current = goal.status;
  }, [goal?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const childGoals = (allGoals ?? []).filter((g) => g.parentId === goalId);
  const linkedProjects = (allProjects ?? []).filter((p) => {
    if (!goalId) return false;
    if (p.goalIds.includes(goalId)) return true;
    if (p.goals.some((goalRef) => goalRef.id === goalId)) return true;
    return p.goalId === goalId;
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: "Goals", href: "/goals" },
      { label: goal?.title ?? goalId ?? "Goal" }
    ]);
  }, [setBreadcrumbs, goal, goalId]);

  useEffect(() => {
    if (twoPane) {
      closePanel();
      return;
    }
    if (goal) {
      openPanel(
        <GoalProperties
          goal={goal}
          onUpdate={(data) => updateGoal.mutate(data)}
        />
      );
    }
    return () => closePanel();
  }, [goal, twoPane]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTwoPane = () => {
    setTwoPane((prev) => {
      const next = !prev;
      try { localStorage.setItem("ironworks:goal-two-pane", String(next)); } catch {}
      return next;
    });
  };

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (!goal) return null;

  return (
    <div className={cn(twoPane ? "grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6" : "")}>
    <CelebrationOverlay show={showCelebration} />
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase text-muted-foreground">
            {goal.level}
          </span>
          <StatusBadge status={goal.status} />
          <GoalHealthBadge status={goal.healthStatus} />
          {smartCriteria && <SmartQualityIndicator criteria={smartCriteria} />}
          <Button
            variant="outline"
            size="sm"
            onClick={() => cloneGoal.mutate()}
            disabled={cloneGoal.isPending}
            className="ml-auto"
          >
            <CopyPlus className="h-3.5 w-3.5 mr-1" />
            {cloneGoal.isPending ? "Cloning..." : "Clone Goal"}
          </Button>
          <button
            onClick={toggleTwoPane}
            className="hidden text-muted-foreground hover:text-foreground transition-colors lg:inline-flex"
            title={twoPane ? "Hide properties panel" : "Show properties panel"}
          >
            {twoPane ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </button>
        </div>

        <InlineEditor
          value={goal.title}
          onSave={(title) => updateGoal.mutate({ title })}
          as="h2"
          className="text-xl font-bold"
        />

        <InlineEditor
          value={goal.description ?? ""}
          onSave={(description) => updateGoal.mutate({ description })}
          as="p"
          className="text-sm text-muted-foreground"
          placeholder="Add a description..."
          multiline
          imageUploadHandler={async (file) => {
            const asset = await uploadImage.mutateAsync(file);
            return asset.contentPath;
          }}
        />
      </div>

      {/* Risk Assessment (12.55) */}
      {goalIssues.length > 0 && (
        <div className={cn("rounded-lg border p-3 flex items-center gap-3", riskColors[riskAssessment.level])}>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide">Risk: {riskAssessment.level}</span>
            </div>
            <p className="text-xs mt-0.5">{riskAssessment.description}</p>
          </div>
          <div className="text-right text-xs shrink-0">
            <div>{riskAssessment.totalIssues} issues</div>
            {riskAssessment.blockedPercent > 0 && <div>{riskAssessment.blockedPercent}% blocked</div>}
          </div>
        </div>
      )}

      {/* RACI Co-ownership */}
      <RaciDisplay goal={goal} agentMap={agentMap} parentGoal={parentGoal} />

      {/* Burnup Chart (5+ issues) */}
      {goalIssues.length >= 5 && (
        <GoalBurnupChart issues={goalIssues} targetDate={goal.targetDate ?? null} startDate={goal.startDate ?? null} />
      )}

      {/* Burndown Chart */}
      {goalIssues.length > 0 && (
        <GoalBurndownChart issues={goalIssues} targetDate={goal.targetDate ?? null} />
      )}

      {/* Progress bar */}
      {progress && progress.totalIssues > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{progress.completedIssues}/{progress.totalIssues} issues done ({progress.progressPercent}%)</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-300",
                progress.progressPercent === 100 ? "bg-emerald-500" : progress.progressPercent > 50 ? "bg-blue-500" : "bg-amber-500",
              )}
              style={{ width: `${progress.progressPercent}%` }}
            />
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            {progress.completedIssues > 0 && (
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" />{progress.completedIssues} done</span>
            )}
            {progress.inProgressIssues > 0 && (
              <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 text-blue-500" />{progress.inProgressIssues} active</span>
            )}
            {progress.blockedIssues > 0 && (
              <span className="flex items-center gap-1"><ShieldAlert className="h-3 w-3 text-red-500" />{progress.blockedIssues} blocked</span>
            )}
            {progress.todoIssues > 0 && (
              <span className="flex items-center gap-1"><Circle className="h-3 w-3" />{progress.todoIssues} pending</span>
            )}
          </div>
        </div>
      )}

      <Tabs defaultValue={goalIssues.length > 0 ? "issues" : "children"}>
        <TabsList>
          <TabsTrigger value="issues">
            Issues ({goalIssues.length})
          </TabsTrigger>
          <TabsTrigger value="key-results">
            Key Results ({(keyResults ?? []).length})
          </TabsTrigger>
          <TabsTrigger value="children">
            Sub-Goals ({childGoals.length})
          </TabsTrigger>
          <TabsTrigger value="projects">
            Projects ({linkedProjects.length})
          </TabsTrigger>
          <TabsTrigger value="check-ins">
            Check-ins ({(checkIns ?? []).length})
          </TabsTrigger>
          <TabsTrigger value="activity">
            Activity ({goalActivity.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="issues" className="mt-4 space-y-3">
          <div className="flex justify-end mb-2">
            <Button size="sm" variant="outline" onClick={() => openNewIssue({ goalId })}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Create Issue
            </Button>
          </div>
          {goalIssues.length === 0 ? (
            <p className="text-sm text-muted-foreground">No issues linked to this goal yet.</p>
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border">
              {goalIssues.map((issue: Issue) => (
                <EntityRow
                  key={issue.id}
                  title={issue.title}
                  subtitle={issue.identifier ?? undefined}
                  to={`/issues/${issue.identifier ?? issue.id}`}
                  trailing={
                    <div className="flex items-center gap-2">
                      <StatusBadge status={issue.status} />
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="key-results" className="mt-4 space-y-3">
          <div className="flex items-center justify-start">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowKrForm(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Key Result
            </Button>
          </div>

          {showKrForm && (
            <div className="border border-border rounded-lg p-3 space-y-2">
              <Input
                placeholder="Key result description..."
                value={krDescription}
                onChange={(e) => setKrDescription(e.target.value)}
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Target"
                  type="number"
                  inputMode="decimal"
                  value={krTarget}
                  onChange={(e) => setKrTarget(e.target.value)}
                  className="w-24"
                />
                <Input
                  placeholder="Unit"
                  value={krUnit}
                  onChange={(e) => setKrUnit(e.target.value)}
                  className="w-20"
                />
                <Button
                  size="sm"
                  disabled={!krDescription.trim() || createKeyResult.isPending}
                  onClick={() => {
                    createKeyResult.mutate(
                      { description: krDescription, targetValue: krTarget, unit: krUnit },
                      {
                        onSuccess: () => {
                          setKrDescription("");
                          setKrTarget("100");
                          setKrUnit("%");
                          setShowKrForm(false);
                        },
                      },
                    );
                  }}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setShowKrForm(false); setKrDescription(""); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {(keyResults ?? []).length === 0 && !showKrForm ? (
            <p className="text-sm text-muted-foreground">No key results defined yet.</p>
          ) : (
            <div className="space-y-2">
              {(keyResults ?? []).map((kr: GoalKeyResult) => {
                const target = Number(kr.targetValue) || 100;
                const current = Number(kr.currentValue) || 0;
                const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

                return (
                  <div key={kr.id} className="border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{kr.description}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {editingKrId === kr.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              inputMode="decimal"
                              value={editingKrValue}
                              onChange={(e) => setEditingKrValue(e.target.value)}
                              className="w-20 h-7 text-xs"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  updateKeyResult.mutate({ krId: kr.id, data: { currentValue: editingKrValue } });
                                  setEditingKrId(null);
                                }
                                if (e.key === "Escape") setEditingKrId(null);
                              }}
                            />
                            <span className="text-xs text-muted-foreground">/ {kr.targetValue} {kr.unit}</span>
                          </div>
                        ) : (
                          <button
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => { setEditingKrId(kr.id); setEditingKrValue(kr.currentValue); }}
                          >
                            {current} / {kr.targetValue} {kr.unit} ({pct}%)
                          </button>
                        )}
                        <button
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          onClick={() => deleteKeyResult.mutate(kr.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-[width] duration-300",
                          pct === 100 ? "bg-emerald-500" : pct > 50 ? "bg-blue-500" : "bg-amber-500",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="children" className="mt-4 space-y-3">
          <div className="flex items-center justify-start">
            <Button
              size="sm"
              variant="outline"
              onClick={() => openNewGoal({ parentId: goalId })}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Sub Goal
            </Button>
          </div>
          {childGoals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sub-goals.</p>
          ) : (
            <GoalTree goals={childGoals} goalLink={(g) => `/goals/${g.id}`} />
          )}
        </TabsContent>

        <TabsContent value="projects" className="mt-4">
          {linkedProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No linked projects.</p>
          ) : (
            <div className="border border-border">
              {linkedProjects.map((project) => (
                <EntityRow
                  key={project.id}
                  title={project.name}
                  subtitle={project.description ?? undefined}
                  to={projectUrl(project)}
                  trailing={<StatusBadge status={project.status} />}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="check-ins" className="mt-4 space-y-4">
          <AddCheckInForm
            defaultConfidence={goal.confidence ?? 50}
            onSubmit={(data) => createCheckIn.mutate(data)}
            isPending={createCheckIn.isPending}
          />

          {(checkIns ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No check-ins yet.</p>
          ) : (
            <div className="space-y-3">
              {(checkIns ?? []).map((ci: GoalCheckIn) => (
                <div key={ci.id} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">
                      {new Date(ci.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    <CheckInStatusBadge status={ci.status} />
                    {ci.confidence != null && (
                      <span className="text-[10px] text-muted-foreground">
                        Confidence: {ci.confidence}%
                      </span>
                    )}
                    {ci.authorAgentId && (
                      <span className="text-[10px] text-muted-foreground">
                        by {agentMap.get(ci.authorAgentId)?.name ?? "Agent"}
                      </span>
                    )}
                    {ci.authorUserId && (
                      <span className="text-[10px] text-muted-foreground">by User</span>
                    )}
                  </div>
                  {ci.note && <p className="text-sm">{ci.note}</p>}
                  {ci.blockers && (
                    <div className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded px-2 py-1">
                      <span className="font-medium">Blockers:</span> {ci.blockers}
                    </div>
                  )}
                  {ci.nextSteps && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Next steps:</span> {ci.nextSteps}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          {goalActivity.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <History className="h-5 w-5" />
              <p className="text-sm">No activity yet for this goal or its linked issues.</p>
            </div>
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
              {goalActivity.map((event) => (
                <ActivityRow
                  key={event.id}
                  event={event}
                  agentMap={agentMap}
                  entityNameMap={entityNameMap}
                  entityTitleMap={entityTitleMap}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Milestones Section */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <ClipboardCheck className="h-3.5 w-3.5" />
            Milestones
          </h4>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowMilestoneForm(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </div>

        {showMilestoneForm && (
          <div className="flex items-center gap-2">
            <Input
              placeholder="Milestone title..."
              value={milestoneTitle}
              onChange={(e) => setMilestoneTitle(e.target.value)}
              className="text-xs"
              autoFocus
            />
            <Input
              type="date"
              value={milestoneDate}
              onChange={(e) => setMilestoneDate(e.target.value)}
              className="w-auto text-xs"
            />
            <Button
              size="sm"
              disabled={!milestoneTitle.trim()}
              onClick={() => {
                milestonesHook.add(milestoneTitle.trim(), milestoneDate);
                setMilestoneTitle("");
                setMilestoneDate("");
                setShowMilestoneForm(false);
              }}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setShowMilestoneForm(false); setMilestoneTitle(""); }}
            >
              Cancel
            </Button>
          </div>
        )}

        {milestonesHook.milestones.length === 0 && !showMilestoneForm ? (
          <p className="text-sm text-muted-foreground">No milestones defined yet.</p>
        ) : (
          <div className="space-y-1">
            {milestonesHook.milestones.map((ms) => (
              <div key={ms.id} className="flex items-center gap-2 py-1">
                <button
                  onClick={() => milestonesHook.toggle(ms.id)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {ms.completed ? (
                    <CheckSquare className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </button>
                <span className={cn("text-sm flex-1", ms.completed && "line-through text-muted-foreground")}>
                  {ms.title}
                </span>
                {ms.targetDate && (
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(ms.targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                )}
                <button
                  onClick={() => milestonesHook.remove(ms.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Health Trend Chart */}
      {snapshots && snapshots.length >= 2 && (
        <HealthTrendChart snapshots={snapshots} />
      )}

      {/* Agent Contributions */}
      <AgentContributionSection issues={goalIssues} agentMap={agentMap} />
    </div>
    {twoPane && (
      <div className="hidden lg:block border border-border rounded-lg p-4 h-fit sticky top-4">
        <GoalProperties
          goal={goal}
          onUpdate={(data) => updateGoal.mutate(data)}
        />
      </div>
    )}
    </div>
  );
}
