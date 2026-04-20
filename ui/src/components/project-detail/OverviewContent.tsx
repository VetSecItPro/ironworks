import type { BudgetPolicySummary } from "@ironworksai/shared";
import { cn } from "../../lib/utils";
import { InlineEditor } from "../InlineEditor";
import { MarkdownBody } from "../MarkdownBody";
import { StatusBadge } from "../StatusBadge";

function formatBudgetCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function OverviewContent({
  project,
  onUpdate,
  imageUploadHandler,
  budgetSummary,
}: {
  project: { description: string | null; status: string; targetDate: string | null };
  onUpdate: (data: Record<string, unknown>) => void;
  imageUploadHandler?: (file: File) => Promise<string>;
  budgetSummary?: BudgetPolicySummary;
}) {
  const readme = (project as Record<string, unknown>).readme as string | undefined;
  return (
    <div className="space-y-6">
      {/* Project README (12.56) */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project README</h3>
        <InlineEditor
          value={readme ?? ""}
          onSave={(val) => onUpdate({ readme: val })}
          as="p"
          className="text-sm"
          placeholder="Write a project README - describe purpose, setup instructions, architecture..."
          multiline
          imageUploadHandler={imageUploadHandler}
        />
        {readme ? (
          <div className="border-t border-border pt-3">
            <MarkdownBody className="prose prose-sm dark:prose-invert max-w-none">{readme}</MarkdownBody>
          </div>
        ) : null}
      </div>

      <InlineEditor
        value={project.description ?? ""}
        onSave={(description) => onUpdate({ description })}
        as="p"
        className="text-sm text-muted-foreground"
        placeholder="Add a description..."
        multiline
        imageUploadHandler={imageUploadHandler}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Status</span>
          <div className="mt-1">
            <StatusBadge status={project.status} />
          </div>
        </div>
        {project.targetDate && (
          <div>
            <span className="text-muted-foreground">Target Date</span>
            <p>{project.targetDate}</p>
          </div>
        )}
      </div>

      {/* Budget allocation vs spent */}
      {budgetSummary && budgetSummary.amount > 0 && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Budget</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">Allocated</span>
              <p className="font-mono font-medium">{formatBudgetCents(budgetSummary.amount)}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Spent</span>
              <p className="font-mono font-medium">{formatBudgetCents(budgetSummary.observedAmount)}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Remaining</span>
              <p className={cn("font-mono font-medium", budgetSummary.remainingAmount < 0 ? "text-red-500" : "")}>
                {formatBudgetCents(budgetSummary.remainingAmount)}
              </p>
            </div>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                budgetSummary.utilizationPercent > 90
                  ? "bg-red-500"
                  : budgetSummary.utilizationPercent > 70
                    ? "bg-amber-500"
                    : "bg-emerald-500",
              )}
              style={{ width: `${Math.min(budgetSummary.utilizationPercent, 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{budgetSummary.utilizationPercent.toFixed(1)}% utilized</p>
        </div>
      )}
    </div>
  );
}
