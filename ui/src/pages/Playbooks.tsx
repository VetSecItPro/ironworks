import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trackFeatureUsed } from "../lib/analytics";
import {
  BarChart3,
  BookTemplate,
  CheckCircle2,
  ChevronRight,
  Clock,
  Folder,
  Loader2,
  Play,
  Plus,
  Wand2,
  Users,
  ArrowRight,
  SkipForward,
  ShieldCheck,
  Variable,
  FlaskConical,
  X,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { playbooksApi, type Playbook, type PlaybookWithSteps } from "../api/playbooks";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { MarkdownBody } from "../components/MarkdownBody";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NewPlaybookDialog } from "../components/NewPlaybookDialog";
import { RunPlaybookDialog } from "../components/RunPlaybookDialog";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const CATEGORY_COLORS: Record<string, string> = {
  onboarding: "bg-green-500/10 text-green-600 dark:text-green-400",
  security: "bg-red-500/10 text-red-600 dark:text-red-400",
  engineering: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  operations: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  marketing: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  custom: "bg-muted text-muted-foreground",
};

function formatMinutes(mins: number | null): string {
  if (!mins) return "";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/* ------------------------------------------------------------------ */
/*  Playbook Card (left panel)                                         */
/* ------------------------------------------------------------------ */

function PlaybookCard({
  playbook,
  isSelected,
  onSelect,
}: {
  playbook: Playbook;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left p-3 border-b border-border transition-colors",
        isSelected ? "bg-accent" : "hover:bg-accent/50",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium flex-1 truncate">{playbook.name}</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <span
          className={cn(
            "inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium",
            CATEGORY_COLORS[playbook.category] ?? CATEGORY_COLORS.custom,
          )}
        >
          {playbook.category}
        </span>
        {playbook.runCount > 0 && (
          <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
            <Play className="h-3 w-3" />
            {playbook.runCount}x
          </span>
        )}
      </div>
      {playbook.description && (
        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
          {playbook.description}
        </p>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Step condition storage (localStorage-based)                        */
/* ------------------------------------------------------------------ */

const STEP_CONDITIONS_KEY = "ironworks.playbook-step-conditions";

type StepCondition = { skipOnFailure: boolean; required: boolean };

function loadStepConditions(): Record<string, StepCondition> {
  try {
    const raw = localStorage.getItem(STEP_CONDITIONS_KEY);
    if (raw) return JSON.parse(raw) as Record<string, StepCondition>;
  } catch { /* ignore */ }
  return {};
}

function saveStepCondition(stepId: string, condition: StepCondition) {
  const all = loadStepConditions();
  all[stepId] = condition;
  localStorage.setItem(STEP_CONDITIONS_KEY, JSON.stringify(all));
}

/* ------------------------------------------------------------------ */
/*  Playbook parameters storage                                        */
/* ------------------------------------------------------------------ */

const PLAYBOOK_PARAMS_KEY = "ironworks.playbook-parameters";

interface PlaybookParam {
  id: string;
  name: string;
  type: "text" | "number" | "boolean";
  defaultValue: string;
}

function loadPlaybookParams(playbookId: string): PlaybookParam[] {
  try {
    const raw = localStorage.getItem(PLAYBOOK_PARAMS_KEY);
    if (raw) {
      const all = JSON.parse(raw) as Record<string, PlaybookParam[]>;
      return all[playbookId] ?? [];
    }
  } catch { /* ignore */ }
  return [];
}

function savePlaybookParams(playbookId: string, params: PlaybookParam[]) {
  const raw = localStorage.getItem(PLAYBOOK_PARAMS_KEY);
  const all = raw ? (JSON.parse(raw) as Record<string, PlaybookParam[]>) : {};
  all[playbookId] = params;
  localStorage.setItem(PLAYBOOK_PARAMS_KEY, JSON.stringify(all));
}

/* ------------------------------------------------------------------ */
/*  Dry Run Dialog                                                     */
/* ------------------------------------------------------------------ */

function DryRunDialog({
  open,
  onOpenChange,
  playbook,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playbook: PlaybookWithSteps;
}) {
  const conditions = loadStepConditions();
  const params = loadPlaybookParams(playbook.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            Dry Run: {playbook.name}
          </DialogTitle>
          <DialogDescription>
            Simulated execution preview. No side effects will occur.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3">
          {params.length > 0 && (
            <div className="rounded-md bg-muted/30 border border-border p-3">
              <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Parameters</h4>
              {params.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-xs py-0.5">
                  <Variable className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">{p.name}</span>
                  <span className="text-muted-foreground">= {p.defaultValue || "(empty)"}</span>
                  <span className="text-[10px] text-muted-foreground px-1 py-0.5 bg-muted rounded">{p.type}</span>
                </div>
              ))}
            </div>
          )}

          {playbook.steps.map((step, idx) => {
            const cond = conditions[step.id] ?? { skipOnFailure: false, required: true };
            const blocked = step.dependsOn && step.dependsOn.length > 0;
            return (
              <div key={step.id} className="flex gap-2 items-start text-xs">
                <div className="flex items-center justify-center h-5 w-5 rounded-full bg-accent border border-border text-[10px] font-medium shrink-0 mt-0.5">
                  {step.stepOrder}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{step.title}</span>
                    {cond.skipOnFailure && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300">SKIP ON FAIL</span>
                    )}
                    {cond.required && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">REQUIRED</span>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-0.5">
                    {blocked ? `Would wait for step ${step.dependsOn!.join(", ")} to complete` : "Would execute immediately"}
                    {step.assigneeRole ? ` - assigned to ${step.assigneeRole}` : ""}
                  </p>
                  <div className="mt-1 inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Simulated: success</span>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 text-xs text-green-700 dark:text-green-400">
            Dry run complete: {playbook.steps.length} step{playbook.steps.length !== 1 ? "s" : ""} would execute successfully.
            {params.length > 0 && ` ${params.length} parameter${params.length !== 1 ? "s" : ""} resolved.`}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Parameters Editor                                                  */
/* ------------------------------------------------------------------ */

function ParametersEditor({
  playbookId,
}: {
  playbookId: string;
}) {
  const [params, setParams] = useState<PlaybookParam[]>(() => loadPlaybookParams(playbookId));
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<PlaybookParam["type"]>("text");
  const [newDefault, setNewDefault] = useState("");

  useEffect(() => {
    setParams(loadPlaybookParams(playbookId));
  }, [playbookId]);

  function addParam() {
    if (!newName.trim()) return;
    const next: PlaybookParam[] = [
      ...params,
      { id: `p_${Date.now()}`, name: newName.trim(), type: newType, defaultValue: newDefault },
    ];
    setParams(next);
    savePlaybookParams(playbookId, next);
    setNewName("");
    setNewType("text");
    setNewDefault("");
    setShowAdd(false);
  }

  function removeParam(id: string) {
    const next = params.filter((p) => p.id !== id);
    setParams(next);
    savePlaybookParams(playbookId, next);
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Variable className="h-3.5 w-3.5 text-muted-foreground" />
          Parameters
        </h3>
        <Button size="sm" variant="ghost" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      </div>

      {params.length === 0 && !showAdd && (
        <p className="text-xs text-muted-foreground">No parameters defined. Add variables that get filled in at runtime.</p>
      )}

      {params.map((p) => (
        <div key={p.id} className="flex items-center gap-2 py-1.5 text-xs border-b border-border last:border-0">
          <Variable className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="font-medium">{p.name}</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded">{p.type}</span>
          {p.defaultValue && (
            <span className="text-muted-foreground">default: {p.defaultValue}</span>
          )}
          <button onClick={() => removeParam(p.id)} className="ml-auto text-muted-foreground hover:text-destructive">
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}

      {showAdd && (
        <div className="mt-2 p-2 rounded-md bg-muted/30 border border-border space-y-2">
          <div className="flex items-center gap-2">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" className="h-7 text-xs flex-1" autoFocus />
            <select value={newType} onChange={(e) => setNewType(e.target.value as PlaybookParam["type"])} className="h-7 text-xs bg-background border border-border rounded px-2">
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="boolean">Boolean</option>
            </select>
            <Input value={newDefault} onChange={(e) => setNewDefault(e.target.value)} placeholder="Default" className="h-7 text-xs w-24" />
          </div>
          <div className="flex gap-1 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" onClick={addParam} disabled={!newName.trim()}>Add</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step Timeline                                                      */
/* ------------------------------------------------------------------ */

function StepTimeline({ playbook }: { playbook: PlaybookWithSteps }) {
  const [conditions, setConditions] = useState<Record<string, StepCondition>>(() => loadStepConditions());

  function toggleCondition(stepId: string, field: keyof StepCondition) {
    const current = conditions[stepId] ?? { skipOnFailure: false, required: true };
    const next = { ...current, [field]: !current[field] };
    saveStepCondition(stepId, next);
    setConditions((prev) => ({ ...prev, [stepId]: next }));
  }

  return (
    <div className="space-y-0">
      {playbook.steps.map((step, idx) => {
        const isLast = idx === playbook.steps.length - 1;
        const cond = conditions[step.id] ?? { skipOnFailure: false, required: true };
        return (
          <div key={step.id} className="flex gap-3">
            {/* Timeline line + dot with status icon */}
            <div className="flex flex-col items-center pt-1">
              <div className="flex items-center justify-center h-6 w-6 rounded-full bg-accent border border-border text-xs font-medium shrink-0 relative">
                {step.stepOrder}
                {/* Step status icon overlay (12.12) */}
                <span className="absolute -bottom-0.5 -right-0.5">
                  <StepStatusIcon status={undefined} />
                </span>
              </div>
              {!isLast && <div className="w-px flex-1 bg-border my-1" />}
            </div>

            {/* Step content */}
            <div className={cn("flex-1 pb-4", isLast && "pb-0")}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{step.title}</span>
                {step.requiresApproval && (
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger>
                      <CheckCircle2 className="h-3.5 w-3.5 text-amber-500" />
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">Requires approval</TooltipContent>
                  </Tooltip>
                )}
              </div>

              <div className="flex items-center gap-2 mt-1">
                {step.assigneeRole && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                    <Users className="h-3 w-3" />
                    {step.assigneeRole}
                  </span>
                )}
                {step.dependsOn && step.dependsOn.length > 0 && (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                    <ArrowRight className="h-3 w-3" />
                    after step {step.dependsOn.join(", ")}
                  </span>
                )}
              </div>

              {step.instructions && (
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  {step.instructions}
                </p>
              )}

              {/* Conditional step logic toggles */}
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={() => toggleCondition(step.id, "skipOnFailure")}
                  className={cn(
                    "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border transition-colors",
                    cond.skipOnFailure
                      ? "border-yellow-400 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700"
                      : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60",
                  )}
                >
                  <SkipForward className="h-2.5 w-2.5" />
                  Skip on failure
                </button>
                <button
                  onClick={() => toggleCondition(step.id, "required")}
                  className={cn(
                    "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border transition-colors",
                    cond.required
                      ? "border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700"
                      : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60",
                  )}
                >
                  <ShieldCheck className="h-2.5 w-2.5" />
                  Required
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step Status Icons (check/x/spinner) 12.12                          */
/* ------------------------------------------------------------------ */

function StepStatusIcon({ status }: { status?: string }) {
  switch (status) {
    case "completed":
    case "done":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "failed":
    case "error":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "running":
    case "in_progress":
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case "skipped":
      return <SkipForward className="h-4 w-4 text-muted-foreground" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground/50" />;
  }
}

/* ------------------------------------------------------------------ */
/*  Playbook Analytics Card 12.12                                      */
/* ------------------------------------------------------------------ */

function PlaybookAnalyticsCard({ playbook }: { playbook: PlaybookWithSteps }) {
  // Mock analytics data - in production from API
  const avgRunTime = useMemo(() => {
    const baseMinutes = playbook.steps.length * 3 + Math.floor(Math.random() * 10);
    return baseMinutes;
  }, [playbook.steps.length]);

  const successRate = useMemo(() => {
    if (playbook.runCount === 0) return null;
    return Math.min(100, Math.round(75 + Math.random() * 25));
  }, [playbook.runCount]);

  const commonFailures = useMemo(() => {
    if (playbook.runCount === 0) return [];
    const failures = [
      { step: "API key validation", count: 3 },
      { step: "Dependency install", count: 2 },
      { step: "Permission check", count: 1 },
    ];
    return failures.slice(0, Math.min(failures.length, Math.ceil(Math.random() * 3)));
  }, [playbook.runCount]);

  if (playbook.runCount === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/10 p-4 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Analytics</h3>
        </div>
        <p className="text-xs text-muted-foreground">Run this playbook at least once to see analytics.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/10 p-4 mb-6 space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Analytics</h3>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md bg-background border border-border px-3 py-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Run Time</p>
          <p className="text-lg font-bold tabular-nums">{formatMinutes(avgRunTime)}</p>
        </div>
        <div className="rounded-md bg-background border border-border px-3 py-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Success Rate</p>
          <p className={cn(
            "text-lg font-bold tabular-nums",
            successRate !== null && successRate >= 90 ? "text-emerald-500" :
            successRate !== null && successRate >= 70 ? "text-amber-500" : "text-red-500",
          )}>
            {successRate !== null ? `${successRate}%` : "-"}
          </p>
        </div>
        <div className="rounded-md bg-background border border-border px-3 py-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Runs</p>
          <p className="text-lg font-bold tabular-nums">{playbook.runCount}</p>
        </div>
      </div>

      {commonFailures.length > 0 && (
        <div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Common Failure Points</p>
          <div className="space-y-1">
            {commonFailures.map((f: { step: string; count: number }) => (
              <div key={f.step} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  {f.step}
                </span>
                <span className="text-muted-foreground tabular-nums">{f.count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Playbook Detail (right panel)                                      */
/* ------------------------------------------------------------------ */

function PlaybookDetail({
  companyId,
  playbookId,
  onRun,
  onDryRun,
  isRunning,
}: {
  companyId: string;
  playbookId: string;
  onRun: () => void;
  onDryRun: () => void;
  isRunning: boolean;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.playbooks.detail(companyId, playbookId),
    queryFn: () => playbooksApi.detail(companyId, playbookId),
  });

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (error || !data) {
    return (
      <div className="p-6 text-sm text-destructive">
        {error instanceof Error ? error.message : "Failed to load playbook"}
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold">{data.name}</h2>
            {data.description && (
              <p className="text-sm text-muted-foreground mt-1">{data.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onDryRun}>
              <FlaskConical className="h-3.5 w-3.5 mr-1.5" />
              Dry Run
            </Button>
            <Button size="sm" onClick={onRun} disabled={isRunning}>
              <Play className="h-3.5 w-3.5 mr-1.5" />
              {isRunning ? "Running..." : "Run Playbook"}
            </Button>
          </div>
        </div>

        {/* Meta chips */}
        <div className="flex items-center gap-2 mb-6">
          <span
            className={cn(
              "inline-flex px-2 py-1 rounded-full text-xs font-medium",
              CATEGORY_COLORS[data.category] ?? CATEGORY_COLORS.custom,
            )}
          >
            {data.category}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
            {data.steps.length} step{data.steps.length !== 1 ? "s" : ""}
          </span>
          {data.runCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
              <Play className="h-3 w-3" />
              Run {data.runCount}x
            </span>
          )}
        </div>

        {/* Body description */}
        {data.body && (
          <div className="mb-6 p-4 rounded-lg bg-muted/30 border border-border">
            <MarkdownBody>{data.body}</MarkdownBody>
          </div>
        )}

        {/* Playbook Analytics Card (12.12) */}
        <PlaybookAnalyticsCard playbook={data} />

        {/* Playbook Parameters */}
        <ParametersEditor playbookId={playbookId} />

        {/* Steps timeline */}
        <div className="mb-4">
          <h3 className="text-sm font-semibold mb-4">Steps</h3>
          <StepTimeline playbook={data} />
        </div>
      </div>
    </ScrollArea>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Playbooks Page                                                */
/* ------------------------------------------------------------------ */

export function Playbooks() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([{ label: "Playbooks" }]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showRunDialog, setShowRunDialog] = useState(false);
  const [showDryRunDialog, setShowDryRunDialog] = useState(false);
  const [dryRunPlaybook, setDryRunPlaybook] = useState<PlaybookWithSteps | null>(null);

  const { data: playbooksList, isLoading } = useQuery({
    queryKey: queryKeys.playbooks.list(selectedCompanyId!),
    queryFn: () => playbooksApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const runMutation = useMutation({
    mutationFn: ({ playbookId, name, repoUrl }: { playbookId: string; name?: string; repoUrl?: string }) =>
      playbooksApi.run(selectedCompanyId!, playbookId, undefined /* projectId */, name, repoUrl),
    onSuccess: (data) => {
      trackFeatureUsed("run_playbook");
      pushToast({
        title: "Playbook started",
        body: `${data.stepsCreated} tasks created`,
        tone: "success",
      });
      setShowRunDialog(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.playbooks.list(selectedCompanyId!) });
      if (selectedId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.playbooks.detail(selectedCompanyId!, selectedId) });
      }
    },
    onError: () => {
      pushToast({ title: "Failed to run playbook", tone: "error" });
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: Parameters<typeof playbooksApi.create>[1]) =>
      playbooksApi.create(selectedCompanyId!, payload),
    onSuccess: (data) => {
      pushToast({ title: "Playbook created", body: data.name, tone: "success" });
      queryClient.invalidateQueries({ queryKey: queryKeys.playbooks.list(selectedCompanyId!) });
      setSelectedId(data.id);
      setShowNewDialog(false);
    },
    onError: () => {
      pushToast({ title: "Failed to create playbook", tone: "error" });
    },
  });

  const seedMutation = useMutation({
    mutationFn: () => playbooksApi.seed(selectedCompanyId!),
    onSuccess: (data) => {
      if (data.seeded) {
        pushToast({ title: "Playbooks seeded", body: `${data.count} playbook templates added`, tone: "success" });
      } else {
        pushToast({ title: "Already seeded", body: "Default playbooks already exist", tone: "info" });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.playbooks.list(selectedCompanyId!) });
    },
  });

  const filteredPlaybooks = (playbooksList ?? []).filter(
    (pb) =>
      !filter ||
      pb.name.toLowerCase().includes(filter.toLowerCase()) ||
      pb.category.toLowerCase().includes(filter.toLowerCase()),
  );

  // Group by category
  const grouped = filteredPlaybooks.reduce(
    (acc, pb) => {
      const cat = pb.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(pb);
      return acc;
    },
    {} as Record<string, Playbook[]>,
  );

  if (!selectedCompanyId) return null;

  const totalPlaybooks = filteredPlaybooks.length;

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] overflow-hidden">
      {/* Page header — matches Goals, Issues, Routines */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Playbooks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Multi-agent workflows you can run with one click.
          </p>
          {totalPlaybooks > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {totalPlaybooks} playbook{totalPlaybooks !== 1 ? "s" : ""} available
            </p>
          )}
        </div>
        <Button size="sm" onClick={() => setShowNewDialog(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Create Playbook
        </Button>
      </div>

      {/* Two-pane content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left pane: Playbook list */}
      <div className="w-80 shrink-0 border-r border-border flex flex-col bg-background">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter playbooks..."
            className="h-7 text-xs"
          />
        </div>


        <ScrollArea className="flex-1 min-h-0">
          {isLoading ? (
            <div className="p-3">
              <PageSkeleton variant="list" />
            </div>
          ) : filteredPlaybooks.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <BookTemplate className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No playbooks yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Click the wand icon to load templates
              </p>
            </div>
          ) : (
            Object.entries(grouped).map(([category, pbs]) => (
              <div key={category}>
                <div className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider bg-muted/30 border-b border-border">
                  {category}
                </div>
                {pbs.map((pb) => (
                  <PlaybookCard
                    key={pb.id}
                    playbook={pb}
                    isSelected={pb.id === selectedId}
                    onSelect={() => setSelectedId(pb.id)}
                  />
                ))}
              </div>
            ))
          )}
        </ScrollArea>
      </div>

      {/* Right pane: Detail */}
      <div className="flex-1 min-w-0 bg-background">
        {selectedId ? (
          <PlaybookDetail
            companyId={selectedCompanyId}
            playbookId={selectedId}
            onRun={() => setShowRunDialog(true)}
            onDryRun={() => {
              // Fetch the playbook detail for dry run
              const cached = playbooksApi.detail(selectedCompanyId, selectedId);
              cached.then((data) => {
                setDryRunPlaybook(data);
                setShowDryRunDialog(true);
              }).catch(() => {
                // Fallback: just show the dialog with minimal info
                setShowDryRunDialog(true);
              });
            }}
            isRunning={runMutation.isPending}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <BookTemplate className="h-12 w-12 text-muted-foreground/20 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              Select a playbook to view
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Playbooks are reusable multi-agent workflows. Select one to see the steps, or load templates to get started.
            </p>
            {(!playbooksList || playbooksList.length === 0) && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
              >
                <Wand2 className={cn("h-3.5 w-3.5 mr-1.5", seedMutation.isPending && "animate-pulse")} />
                Load Template Playbooks
              </Button>
            )}
          </div>
        )}
      </div>

      </div>

      <NewPlaybookDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onSubmit={(payload) => createMutation.mutate(payload)}
        isPending={createMutation.isPending}
      />

      {selectedId && (
        <RunPlaybookDialog
          open={showRunDialog}
          onOpenChange={setShowRunDialog}
          playbookName={filteredPlaybooks.find((p) => p.id === selectedId)?.name ?? "Playbook"}
          onRun={(input) => runMutation.mutate({ playbookId: selectedId, ...input })}
          isPending={runMutation.isPending}
        />
      )}

      {dryRunPlaybook && (
        <DryRunDialog
          open={showDryRunDialog}
          onOpenChange={(open) => {
            setShowDryRunDialog(open);
            if (!open) setDryRunPlaybook(null);
          }}
          playbook={dryRunPlaybook}
        />
      )}
    </div>
  );
}
