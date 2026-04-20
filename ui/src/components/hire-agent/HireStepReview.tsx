import {
  AGENT_ROLE_LABELS,
  type AgentRole,
  type ContractEndCondition,
  DEPARTMENT_LABELS,
  type Department,
} from "@ironworksai/shared";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

type EmploymentType = "full_time" | "contractor";

const END_CONDITION_LABELS: Record<ContractEndCondition, string> = {
  date: "By Date",
  project_complete: "When Project Completes",
  budget_exhausted: "When Budget Exhausted",
  manual: "Manual",
};

interface HireStepReviewProps {
  name: string;
  employmentType: EmploymentType;
  role: AgentRole;
  department: Department;
  reportsTo: string;
  projectId: string;
  endCondition: ContractEndCondition;
  endDate: string;
  budgetAmount: string;
  agents: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string }>;
  isPending: boolean;
  isCreating: boolean;
  error: Error | null;
  onSubmitForApproval: () => void;
  onHireNow: () => void;
}

export function HireStepReview({
  name,
  employmentType,
  role,
  department,
  reportsTo,
  projectId,
  endCondition,
  endDate,
  budgetAmount,
  agents,
  projects,
  isPending,
  isCreating,
  error,
  onSubmitForApproval,
  onHireNow,
}: HireStepReviewProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border p-4 space-y-3">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Summary</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <span className="text-muted-foreground">Name</span>
          <span className="font-medium">{name}</span>

          <span className="text-muted-foreground">Type</span>
          <span className="font-medium">{employmentType === "full_time" ? "Full-Time Employee" : "Contractor"}</span>

          <span className="text-muted-foreground">Role</span>
          <span className="font-medium">{(AGENT_ROLE_LABELS as Record<string, string>)[role] ?? role}</span>

          <span className="text-muted-foreground">Department</span>
          <span className="font-medium">{(DEPARTMENT_LABELS as Record<string, string>)[department] ?? department}</span>

          {reportsTo && (
            <>
              <span className="text-muted-foreground">Reports To</span>
              <span className="font-medium">{agents.find((a) => a.id === reportsTo)?.name ?? reportsTo}</span>
            </>
          )}

          {employmentType === "contractor" && (
            <>
              <span className="text-muted-foreground">Project</span>
              <span className="font-medium">{projects.find((p) => p.id === projectId)?.name ?? projectId}</span>

              <span className="text-muted-foreground">End Condition</span>
              <span className="font-medium">{END_CONDITION_LABELS[endCondition]}</span>

              {endCondition === "date" && endDate && (
                <>
                  <span className="text-muted-foreground">End Date</span>
                  <span className="font-medium">{endDate}</span>
                </>
              )}

              {endCondition === "budget_exhausted" && budgetAmount && (
                <>
                  <span className="text-muted-foreground">Budget</span>
                  <span className="font-medium">${budgetAmount}</span>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onSubmitForApproval} disabled={isPending}>
          {isCreating ? "Submitting..." : "Submit for Approval"}
        </Button>
        <Button className="flex-1" onClick={onHireNow} disabled={isPending}>
          {isPending ? "Hiring..." : "Hire Now"}
          <Check className="h-3.5 w-3.5 ml-1.5" />
        </Button>
      </div>

      {error && <p className="text-xs text-destructive text-center">{error.message ?? "An error occurred"}</p>}
    </div>
  );
}
