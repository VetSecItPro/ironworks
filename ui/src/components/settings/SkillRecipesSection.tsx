/**
 * Skill Recipes section in Company Settings.
 *
 * Four-tab layout per MDMP §3.4 wireframes:
 *   Authored / Proposed (red-dot badge) / Active / Archived
 *
 * Clicking a row opens a slide-out detail panel. From the Proposed panel the
 * operator can Approve, Edit, or Reject the recipe. The Active panel shows
 * effectiveness data from the latest evaluation window when available.
 *
 * Edit flow: textarea for procedure_markdown + inputs for title/trigger_pattern.
 * Calls PATCH then re-fetches — no separate approve step required (edit is
 * always followed by the operator clicking Approve from the detail panel).
 *
 * Bulk-approve renders a multi-select checkbox column on the Proposed tab and
 * a single "Approve selected" button below the table.
 *
 * PR 6/6 additions:
 *   - Pause/Resume toggle button on the active-tab detail panel.
 *   - "paused" badge in the Active list view for paused recipes.
 *   - Paused recipes still appear in the Active tab so operators can unpause them.
 *
 * @see MDMP §3.4 for the wireframe that drove this layout.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, ChevronRight, Circle, PauseCircle, PlayCircle, Wand2, XCircle } from "lucide-react";
import { useState } from "react";
import {
  type EditRecipePatch,
  type SkillRecipeDetail,
  type SkillRecipeListItem,
  type SkillRecipeStatus,
  skillRecipesApi,
} from "../../api/skillRecipes";
import { queryKeys } from "../../lib/queryKeys";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Textarea } from "../ui/textarea";

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status, paused = false }: { status: SkillRecipeStatus; paused?: boolean }) {
  // Paused active recipes show a distinct badge so operators can spot them at a glance
  if (status === "active" && paused) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-800 border-orange-200">
        <PauseCircle className="h-3 w-3" />
        paused
      </span>
    );
  }

  const variants: Record<SkillRecipeStatus, { label: string; className: string }> = {
    proposed: { label: "proposed", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
    approved: { label: "approved", className: "bg-blue-100 text-blue-800 border-blue-200" },
    active: { label: "active", className: "bg-green-100 text-green-800 border-green-200" },
    rejected: { label: "rejected", className: "bg-red-100 text-red-800 border-red-200" },
    archived: { label: "archived", className: "bg-gray-100 text-gray-500 border-gray-200" },
  };
  const v = variants[status] ?? variants.archived;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${v.className}`}>
      {v.label}
    </span>
  );
}

function EffectivenessDisplay({ delta }: { delta: string | null | undefined }) {
  if (delta == null) return <span className="text-muted-foreground text-xs">-</span>;
  const num = Number.parseFloat(delta);
  const pct = (num * 100).toFixed(0);
  const color = num >= 0 ? "text-green-600" : "text-red-500";
  return (
    <span className={`text-xs font-medium ${color}`}>
      {num >= 0 ? "+" : ""}
      {pct}%
    </span>
  );
}

// ── Edit form ──────────────────────────────────────────────────────────────────

interface EditFormProps {
  recipe: SkillRecipeDetail;
  onSave: (patch: EditRecipePatch) => void;
  onCancel: () => void;
  isSaving: boolean;
}

function EditForm({ recipe, onSave, onCancel, isSaving }: EditFormProps) {
  const [title, setTitle] = useState(recipe.title);
  const [triggerPattern, setTriggerPattern] = useState(recipe.triggerPattern);
  const [procedureMarkdown, setProcedureMarkdown] = useState(recipe.procedureMarkdown);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const patch: EditRecipePatch = {};
    if (title.trim() !== recipe.title) patch.title = title.trim();
    if (triggerPattern.trim() !== recipe.triggerPattern) patch.triggerPattern = triggerPattern.trim();
    if (procedureMarkdown.trim() !== recipe.procedureMarkdown) patch.procedureMarkdown = procedureMarkdown.trim();
    if (Object.keys(patch).length === 0) {
      onCancel();
      return;
    }
    onSave(patch);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
      <div className="space-y-1">
        <label htmlFor="edit-recipe-title" className="text-xs font-medium text-muted-foreground">
          Title
        </label>
        <input
          id="edit-recipe-title"
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="edit-recipe-trigger" className="text-xs font-medium text-muted-foreground">
          Trigger pattern
        </label>
        <input
          id="edit-recipe-trigger"
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          value={triggerPattern}
          onChange={(e) => setTriggerPattern(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="edit-recipe-procedure" className="text-xs font-medium text-muted-foreground">
          Procedure
        </label>
        <Textarea
          id="edit-recipe-procedure"
          className="min-h-[200px] font-mono text-xs"
          value={procedureMarkdown}
          onChange={(e) => setProcedureMarkdown(e.target.value)}
          required
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

// ── Reject dialog ──────────────────────────────────────────────────────────────

interface RejectPanelProps {
  onReject: (reason: string) => void;
  onCancel: () => void;
  isRejecting: boolean;
}

function RejectPanel({ onReject, onCancel, isRejecting }: RejectPanelProps) {
  const [reason, setReason] = useState("");

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3 mt-2">
      <p className="text-xs text-muted-foreground">Provide a reason so the extractor can improve future proposals.</p>
      <Textarea
        placeholder="e.g. Trigger too broad, procedure references internal tool not available to all roles..."
        className="min-h-[80px] text-sm"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={isRejecting}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => reason.trim() && onReject(reason.trim())}
          disabled={isRejecting || !reason.trim()}
        >
          {isRejecting ? "Rejecting..." : "Confirm reject"}
        </Button>
      </div>
    </div>
  );
}

// ── Detail panel ───────────────────────────────────────────────────────────────

interface DetailPanelProps {
  recipeId: string;
  companyId: string;
  onClose: () => void;
}

function DetailPanel({ recipeId, companyId, onClose }: DetailPanelProps) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"view" | "edit" | "reject">("view");

  const detailQuery = useQuery({
    queryKey: queryKeys.skillRecipes.detail(recipeId),
    queryFn: () => skillRecipesApi.detail(recipeId),
  });

  const approveMutation = useMutation({
    mutationFn: () => skillRecipesApi.approve(recipeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.skillRecipes.list(companyId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.skillRecipes.detail(recipeId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.companySkills.list(companyId) });
      onClose();
    },
  });

  const editMutation = useMutation({
    mutationFn: (patch: EditRecipePatch) => skillRecipesApi.update(recipeId, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.skillRecipes.list(companyId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.skillRecipes.detail(recipeId) });
      setMode("view");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => skillRecipesApi.reject(recipeId, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.skillRecipes.list(companyId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.skillRecipes.detail(recipeId) });
      setMode("view");
      onClose();
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => skillRecipesApi.archive(recipeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.skillRecipes.list(companyId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.skillRecipes.detail(recipeId) });
      onClose();
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () => skillRecipesApi.pause(recipeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.skillRecipes.list(companyId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.skillRecipes.detail(recipeId) });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => skillRecipesApi.resume(recipeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.skillRecipes.list(companyId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.skillRecipes.detail(recipeId) });
    },
  });

  const recipe = detailQuery.data;

  if (detailQuery.isLoading) {
    return <div className="p-4 text-sm text-muted-foreground animate-pulse">Loading recipe...</div>;
  }

  if (!recipe) {
    return <div className="p-4 text-sm text-destructive">Recipe not found.</div>;
  }

  const isProposed = recipe.status === "proposed";
  const isActive = recipe.status === "active";
  const isPaused = recipe.pausedAt != null;

  return (
    <div className="space-y-4 px-1">
      {/* Header meta */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <div>
          <span className="font-medium text-foreground">Status: </span>
          <StatusBadge status={recipe.status} paused={recipe.pausedAt != null} />
        </div>
        <div>
          <span className="font-medium text-foreground">Confidence: </span>
          {recipe.confidence}
        </div>
        <div>
          <span className="font-medium text-foreground">Role: </span>
          {recipe.applicableRoleTitles.join(", ") || "Any"}
        </div>
        <div>
          <span className="font-medium text-foreground">Model: </span>
          <span className="font-mono">{recipe.extractorModel}</span>
        </div>
        {recipe.sourceIssueId && (
          <div className="col-span-2">
            <span className="font-medium text-foreground">Source mission ID: </span>
            <span className="font-mono">{recipe.sourceIssueId}</span>
          </div>
        )}
        {recipe.proposedByAgentId && (
          <div className="col-span-2">
            <span className="font-medium text-foreground">Proposed by agent: </span>
            <span className="font-mono">{recipe.proposedByAgentId}</span>
          </div>
        )}
        <div className="col-span-2">
          <span className="font-medium text-foreground">Extracted: </span>
          {new Date(recipe.createdAt).toLocaleString()}
        </div>
        {recipe.pausedAt && (
          <div className="col-span-2 text-orange-700">
            <span className="font-medium">Paused since: </span>
            {new Date(recipe.pausedAt).toLocaleString()}
          </div>
        )}
      </div>

      {/* Action buttons for proposed status */}
      {isProposed && mode === "view" && (
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
            <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
            {approveMutation.isPending ? "Approving..." : "Approve"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMode("edit")}>
            <Wand2 className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMode("reject")}>
            <XCircle className="h-3.5 w-3.5 mr-1.5" />
            Reject
          </Button>
        </div>
      )}

      {/* Pause/Resume + Archive buttons for active recipes */}
      {isActive && mode === "view" && (
        <div className="flex gap-2 flex-wrap">
          {isPaused ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
            >
              <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
              {resumeMutation.isPending ? "Resuming..." : "Resume"}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => pauseMutation.mutate()}
              disabled={pauseMutation.isPending}
            >
              <PauseCircle className="h-3.5 w-3.5 mr-1.5" />
              {pauseMutation.isPending ? "Pausing..." : "Pause"}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending}
          >
            {archiveMutation.isPending ? "Archiving..." : "Archive skill"}
          </Button>
        </div>
      )}

      {/* Mutation error */}
      {(approveMutation.isError ||
        editMutation.isError ||
        rejectMutation.isError ||
        archiveMutation.isError ||
        pauseMutation.isError ||
        resumeMutation.isError) && (
        <p className="text-xs text-destructive">
          {(
            approveMutation.error ??
            editMutation.error ??
            rejectMutation.error ??
            archiveMutation.error ??
            pauseMutation.error ??
            resumeMutation.error
          )?.message ?? "An error occurred."}
        </p>
      )}

      {/* Inline edit form */}
      {mode === "edit" && (
        <EditForm
          recipe={recipe}
          onSave={(patch) => editMutation.mutate(patch)}
          onCancel={() => setMode("view")}
          isSaving={editMutation.isPending}
        />
      )}

      {/* Reject reason panel */}
      {mode === "reject" && (
        <RejectPanel
          onReject={(reason) => rejectMutation.mutate(reason)}
          onCancel={() => setMode("view")}
          isRejecting={rejectMutation.isPending}
        />
      )}

      {/* Trigger */}
      {mode === "view" && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Trigger</p>
          <p className="text-sm">{recipe.triggerPattern}</p>
        </div>
      )}

      {/* Procedure */}
      {mode === "view" && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Procedure</p>
          <pre className="whitespace-pre-wrap text-sm font-mono bg-muted/30 rounded-md p-3 border border-border">
            {recipe.procedureMarkdown}
          </pre>
        </div>
      )}

      {/* Rationale */}
      {mode === "view" && recipe.rationale && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Rationale</p>
          <p className="text-sm text-muted-foreground">{recipe.rationale}</p>
        </div>
      )}

      {/* Rejection reason (for rejected recipes) */}
      {mode === "view" && recipe.rejectionReason && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Rejection reason</p>
          <p className="text-sm text-muted-foreground">{recipe.rejectionReason}</p>
        </div>
      )}

      {/* Effectiveness panel (active recipes only) */}
      {isActive && mode === "view" && (
        <div className="space-y-2 rounded-md border border-border p-3 bg-muted/20">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Effectiveness (last 30 days)
          </p>
          {recipe.latestEvaluation ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <div>
                <span className="text-muted-foreground">Invocations: </span>
                <span className="font-medium">{recipe.latestEvaluation.invocationsCount}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Completed: </span>
                <span className="font-medium">{recipe.latestEvaluation.completedCount}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Failed: </span>
                <span className="font-medium">{recipe.latestEvaluation.failedCount}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Effectiveness delta: </span>
                <EffectivenessDisplay delta={recipe.latestEvaluation.effectivenessDelta} />
              </div>
              {recipe.latestEvaluation.operatorThumbsAvg != null && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Operator avg thumbs: </span>
                  <span className="font-medium">{recipe.latestEvaluation.operatorThumbsAvg}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No evaluation data yet. The nightly rollup cron populates this after the first invocations.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Recipe table ───────────────────────────────────────────────────────────────

interface RecipeTableProps {
  items: SkillRecipeListItem[];
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onSelectRow: (id: string) => void;
  showCheckboxes?: boolean;
}

function RecipeTable({ items, selectedIds, onToggleSelect, onSelectRow, showCheckboxes = false }: RecipeTableProps) {
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        No recipes in this category.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            {showCheckboxes && <th className="w-8 px-3 py-2" />}
            <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">TITLE</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">STATUS</th>
            <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">CONFIDENCE</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">ROLE</th>
            <th className="w-8 px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="border-b last:border-0 hover:bg-muted/20 cursor-pointer transition-colors"
              onClick={() => onSelectRow(item.id)}
            >
              {showCheckboxes && (
                <td
                  className="px-3 py-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelect?.(item.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      onToggleSelect?.(item.id);
                    }
                  }}
                >
                  <Checkbox checked={selectedIds?.has(item.id) ?? false} />
                </td>
              )}
              <td className="px-4 py-2">
                <span className="font-medium text-sm">{item.title}</span>
                {item.applicableRoleTitles.length > 0 && (
                  <p className="text-xs text-muted-foreground truncate max-w-[260px]">{item.triggerPattern}</p>
                )}
              </td>
              <td className="px-4 py-2">
                <StatusBadge status={item.status} paused={item.pausedAt != null} />
              </td>
              <td className="px-4 py-2 text-right text-xs text-muted-foreground">{item.confidence}%</td>
              <td className="px-4 py-2 text-xs text-muted-foreground">
                {item.applicableRoleTitles.join(", ") || "Any"}
              </td>
              <td className="px-2 py-2 text-muted-foreground">
                <ChevronRight className="h-4 w-4" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main section ───────────────────────────────────────────────────────────────

export function SkillRecipesSection({ companyId }: { companyId: string | null | undefined }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<SkillRecipeStatus | "authored">("proposed");
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  // Multi-select state for bulk approve on the Proposed tab.
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);

  // We fetch all recipes once and derive per-tab counts client-side to avoid
  // four parallel queries. The status filter param on the API is still useful
  // for large fleets — left in the API client for those cases.
  const allQuery = useQuery({
    queryKey: queryKeys.skillRecipes.list(companyId ?? ""),
    queryFn: () => skillRecipesApi.list(companyId!),
    enabled: !!companyId,
  });

  const all = allQuery.data ?? [];
  const proposed = all.filter((r) => r.status === "proposed");
  const active = all.filter((r) => r.status === "active");
  const archived = all.filter((r) => r.status === "archived" || r.status === "rejected");
  // "Authored" tab shows company_skills with origin='authored' — that comes from
  // the existing companySkills query, not this section. We render a placeholder
  // that points operators to the Skills page for now.
  const proposedCount = proposed.length;

  function handleToggleSelect(id: string) {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkApprove() {
    if (bulkSelected.size === 0 || !companyId) return;
    setBulkApproving(true);
    const ids = [...bulkSelected];
    try {
      await Promise.all(ids.map((id) => skillRecipesApi.approve(id)));
      setBulkSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: queryKeys.skillRecipes.list(companyId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companySkills.list(companyId) });
    } finally {
      setBulkApproving(false);
    }
  }

  if (!companyId) {
    return (
      <div id="skill-recipes" className="scroll-mt-6 space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Wand2 className="h-3.5 w-3.5" />
          Skill Recipes
        </div>
        <p className="text-sm text-muted-foreground">Select a company to manage skill recipes.</p>
      </div>
    );
  }

  return (
    <div id="skill-recipes" className="scroll-mt-6 space-y-4">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <Wand2 className="h-3.5 w-3.5" />
        Skill Recipes
      </div>

      <p className="text-xs text-muted-foreground">
        AI-proposed procedural recipes extracted from completed issues. Approve to activate, reject to dismiss, or edit
        before approving. Active recipes are injected into matching agent prompts.
      </p>

      {allQuery.isLoading && <div className="text-sm text-muted-foreground animate-pulse">Loading recipes...</div>}
      {allQuery.isError && <p className="text-sm text-destructive">Failed to load skill recipes.</p>}

      {!allQuery.isLoading && (
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v as SkillRecipeStatus | "authored");
            setBulkSelected(new Set());
          }}
        >
          <TabsList>
            <TabsTrigger value="authored">Authored</TabsTrigger>
            <TabsTrigger value="proposed" className="relative">
              Proposed
              {proposedCount > 0 && (
                <Badge variant="destructive" className="ml-1.5 h-4 min-w-4 px-1 py-0 text-xs leading-none">
                  {proposedCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
          </TabsList>

          {/* Authored tab — defers to the main Skills page */}
          <TabsContent value="authored" className="mt-4">
            <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Circle className="h-4 w-4 text-muted-foreground" />
                <span>
                  Hand-authored skills are managed on the{" "}
                  <a href="/skills" className="text-foreground underline underline-offset-2">
                    Skills page
                  </a>
                  . Extracted (AI-proposed) skills appear in the Proposed tab.
                </span>
              </div>
            </div>
          </TabsContent>

          {/* Proposed tab */}
          <TabsContent value="proposed" className="mt-4 space-y-3">
            <RecipeTable
              items={proposed}
              showCheckboxes
              selectedIds={bulkSelected}
              onToggleSelect={handleToggleSelect}
              onSelectRow={(id) => setSelectedRecipeId(id)}
            />
            {proposed.length > 0 && (
              <div className="flex items-center gap-3">
                <Button size="sm" disabled={bulkSelected.size === 0 || bulkApproving} onClick={handleBulkApprove}>
                  {bulkApproving ? "Approving..." : `Approve selected (${bulkSelected.size})`}
                </Button>
                {bulkSelected.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setBulkSelected(new Set())}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear selection
                  </button>
                )}
              </div>
            )}
          </TabsContent>

          {/* Active tab */}
          <TabsContent value="active" className="mt-4">
            <RecipeTable items={active} onSelectRow={(id) => setSelectedRecipeId(id)} />
          </TabsContent>

          {/* Archived tab */}
          <TabsContent value="archived" className="mt-4">
            <RecipeTable items={archived} onSelectRow={(id) => setSelectedRecipeId(id)} />
          </TabsContent>
        </Tabs>
      )}

      {/* Detail slide-out */}
      <Sheet open={!!selectedRecipeId} onOpenChange={(open) => !open && setSelectedRecipeId(null)}>
        <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-base leading-tight pr-6">
              {allQuery.data?.find((r) => r.id === selectedRecipeId)?.title ?? "Skill recipe"}
            </SheetTitle>
            <SheetDescription className="text-xs">Review and act on this proposed skill recipe.</SheetDescription>
          </SheetHeader>
          {selectedRecipeId && (
            <DetailPanel recipeId={selectedRecipeId} companyId={companyId} onClose={() => setSelectedRecipeId(null)} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
