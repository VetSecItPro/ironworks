import { cn } from "../../lib/utils";
import type { Goal } from "@ironworksai/shared";

export interface SmartCriteria {
  specific: boolean;
  measurable: boolean;
  achievable: boolean;
  relevant: boolean;
  timeBound: boolean;
}

export function evaluateSmart(goal: Goal, keyResultCount: number): SmartCriteria {
  return {
    specific: !!goal.description && goal.description.trim().length > 0,
    measurable: keyResultCount > 0,
    achievable: (goal.confidence ?? 0) > 30,
    relevant: !!goal.parentId || goal.level === "company",
    timeBound: !!goal.targetDate,
  };
}

export function SmartQualityIndicator({ criteria }: { criteria: SmartCriteria }) {
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
