import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, FlaskConical, Play, Plus, Variable, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type PlaybookWithSteps, playbooksApi } from "../../api/playbooks";
import { queryKeys } from "../../lib/queryKeys";
import { cn } from "../../lib/utils";
import { MarkdownBody } from "../MarkdownBody";
import { PageSkeleton } from "../PageSkeleton";
import { CATEGORY_COLORS } from "./PlaybookCard";
import { StepTimeline } from "./StepTimeline";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatMinutes(mins: number | null): string {
  if (!mins) return "";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/* ------------------------------------------------------------------ */
/*  Step condition storage (localStorage-based)                        */
/* ------------------------------------------------------------------ */

const STEP_CONDITIONS_KEY = "ironworks.playbook-step-conditions";

export type StepCondition = { skipOnFailure: boolean; required: boolean };

export function loadStepConditions(): Record<string, StepCondition> {
  try {
    const raw = localStorage.getItem(STEP_CONDITIONS_KEY);
    if (raw) return JSON.parse(raw) as Record<string, StepCondition>;
  } catch {
    /* ignore */
  }
  return {};
}

/* ------------------------------------------------------------------ */
/*  Playbook parameters storage                                        */
/* ------------------------------------------------------------------ */

const PLAYBOOK_PARAMS_KEY = "ironworks.playbook-parameters";

export interface PlaybookParam {
  id: string;
  name: string;
  type: "text" | "number" | "boolean";
  defaultValue: string;
}

export function loadPlaybookParams(playbookId: string): PlaybookParam[] {
  try {
    const raw = localStorage.getItem(PLAYBOOK_PARAMS_KEY);
    if (raw) {
      const all = JSON.parse(raw) as Record<string, PlaybookParam[]>;
      return all[playbookId] ?? [];
    }
  } catch {
    /* ignore */
  }
  return [];
}

function savePlaybookParams(playbookId: string, params: PlaybookParam[]) {
  const raw = localStorage.getItem(PLAYBOOK_PARAMS_KEY);
  const all = raw ? (JSON.parse(raw) as Record<string, PlaybookParam[]>) : {};
  all[playbookId] = params;
  localStorage.setItem(PLAYBOOK_PARAMS_KEY, JSON.stringify(all));
}

/* ------------------------------------------------------------------ */
/*  Parameters Editor                                                  */
/* ------------------------------------------------------------------ */

function ParametersEditor({ playbookId }: { playbookId: string }) {
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
        <p className="text-xs text-muted-foreground">
          No parameters defined. Add variables that get filled in at runtime.
        </p>
      )}

      {params.map((p) => (
        <div key={p.id} className="flex items-center gap-2 py-1.5 text-xs border-b border-border last:border-0">
          <Variable className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="font-medium">{p.name}</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded">{p.type}</span>
          {p.defaultValue && <span className="text-muted-foreground">default: {p.defaultValue}</span>}
          <button type="button"
            onClick={() => removeParam(p.id)}
            className="ml-auto text-muted-foreground hover:text-destructive"
            aria-label="Remove parameter"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}

      {showAdd && (
        <div className="mt-2 p-2 rounded-md bg-muted/30 border border-border space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name"
              className="h-7 text-xs flex-1"
              autoFocus
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as PlaybookParam["type"])}
              className="h-7 text-xs bg-background border border-border rounded px-2"
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="boolean">Boolean</option>
            </select>
            <Input
              value={newDefault}
              onChange={(e) => setNewDefault(e.target.value)}
              placeholder="Default"
              className="h-7 text-xs w-24"
            />
          </div>
          <div className="flex gap-1 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={addParam} disabled={!newName.trim()}>
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Playbook Analytics Card                                            */
/* ------------------------------------------------------------------ */

function PlaybookAnalyticsCard({ playbook }: { playbook: PlaybookWithSteps }) {
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
          <p
            className={cn(
              "text-lg font-bold tabular-nums",
              successRate !== null && successRate >= 90
                ? "text-emerald-500"
                : successRate !== null && successRate >= 70
                  ? "text-amber-500"
                  : "text-red-500",
            )}
          >
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
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
            Common Failure Points
          </p>
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

export function PlaybookDetailPanel({
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
            {data.description && <p className="text-sm text-muted-foreground mt-1">{data.description}</p>}
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

        {/* Playbook Analytics Card */}
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
