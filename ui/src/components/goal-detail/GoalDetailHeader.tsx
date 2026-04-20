import type { Goal } from "@ironworksai/shared";
import { AlertTriangle, CopyPlus, PanelRightClose, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "../../lib/utils";
import { InlineEditor } from "../InlineEditor";
import { StatusBadge } from "../StatusBadge";
import { GoalHealthBadge } from "./GoalHealthBadge";
import type { GoalRiskAssessmentResult } from "./GoalRiskAssessment";
import { riskColors } from "./GoalRiskAssessment";
import type { SmartCriteria } from "./SmartQualityIndicator";
import { SmartQualityIndicator } from "./SmartQualityIndicator";

interface GoalDetailHeaderProps {
  goal: Goal;
  smartCriteria: SmartCriteria | null;
  riskAssessment: GoalRiskAssessmentResult;
  issueCount: number;
  cloneIsPending: boolean;
  twoPane: boolean;
  onClone: () => void;
  onToggleTwoPane: () => void;
  onUpdateTitle: (title: string) => void;
  onUpdateDescription: (description: string) => void;
  onUploadImage: (file: File) => Promise<string>;
}

export function GoalDetailHeader({
  goal,
  smartCriteria,
  riskAssessment,
  issueCount,
  cloneIsPending,
  twoPane,
  onClone,
  onToggleTwoPane,
  onUpdateTitle,
  onUpdateDescription,
  onUploadImage,
}: GoalDetailHeaderProps) {
  return (
    <>
      {/* Header badges and actions */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase text-muted-foreground">{goal.level}</span>
          <StatusBadge status={goal.status} />
          <GoalHealthBadge status={goal.healthStatus} />
          {smartCriteria && <SmartQualityIndicator criteria={smartCriteria} />}
          <Button variant="outline" size="sm" onClick={onClone} disabled={cloneIsPending} className="ml-auto">
            <CopyPlus className="h-3.5 w-3.5 mr-1" />
            {cloneIsPending ? "Cloning..." : "Clone Goal"}
          </Button>
          <button type="button"
            onClick={onToggleTwoPane}
            className="hidden text-muted-foreground hover:text-foreground transition-colors lg:inline-flex"
            title={twoPane ? "Hide properties panel" : "Show properties panel"}
          >
            {twoPane ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </button>
        </div>

        <InlineEditor value={goal.title} onSave={onUpdateTitle} as="h2" className="text-xl font-bold" />

        <InlineEditor
          value={goal.description ?? ""}
          onSave={onUpdateDescription}
          as="p"
          className="text-sm text-muted-foreground"
          placeholder="Add a description..."
          multiline
          imageUploadHandler={onUploadImage}
        />
      </div>

      {/* Risk Assessment */}
      {issueCount > 0 && (
        <div className={cn("rounded-lg border p-3 flex items-center gap-3", riskColors[riskAssessment.level])}>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide">Risk: {riskAssessment.level}</span>
            </div>
            <p className="text-xs mt-0.5">{riskAssessment.description}</p>
          </div>
          <div className="text-right text-xs shrink-0">
            <div>{riskAssessment.totalIssues} missions</div>
            {riskAssessment.blockedPercent > 0 && <div>{riskAssessment.blockedPercent}% blocked</div>}
          </div>
        </div>
      )}
    </>
  );
}
