import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, BookTemplate } from "lucide-react";
import type { RoleTemplate } from "../../api/roleTemplates";
import {
  AGENT_ROLE_LABELS,
  AGENT_ROLES,
  DEPARTMENTS,
  DEPARTMENT_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  CONTRACT_END_CONDITIONS,
  type AgentRole,
  type Department,
  type ContractEndCondition,
} from "@ironworksai/shared";

type EmploymentType = "full_time" | "contractor";

const END_CONDITION_LABELS: Record<ContractEndCondition, string> = {
  date: "By Date",
  project_complete: "When Project Completes",
  budget_exhausted: "When Budget Exhausted",
  manual: "Manual",
};

interface HireStepConfigProps {
  name: string;
  setName: (v: string) => void;
  role: AgentRole;
  setRole: (v: AgentRole) => void;
  department: Department;
  setDepartment: (v: Department) => void;
  reportsTo: string;
  setReportsTo: (v: string) => void;
  employmentType: EmploymentType;
  projectId: string;
  setProjectId: (v: string) => void;
  endCondition: ContractEndCondition;
  setEndCondition: (v: ContractEndCondition) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  budgetAmount: string;
  setBudgetAmount: (v: string) => void;
  agents: Array<{ id: string; name: string; role: string }>;
  projects: Array<{ id: string; name: string }>;
  canProceedToReview: boolean;
  onNext: () => void;
  onShowTalentPool: () => void;
}

export function HireStepConfig({
  name, setName,
  role, setRole,
  department, setDepartment,
  reportsTo, setReportsTo,
  employmentType,
  projectId, setProjectId,
  endCondition, setEndCondition,
  endDate, setEndDate,
  budgetAmount, setBudgetAmount,
  agents, projects,
  canProceedToReview,
  onNext,
  onShowTalentPool,
}: HireStepConfigProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Name *</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent name" className="text-sm" />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Role</label>
        <select value={role} onChange={(e) => setRole(e.target.value as AgentRole)} className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none">
          {AGENT_ROLES.map((r) => (
            <option key={r} value={r}>{(AGENT_ROLE_LABELS as Record<string, string>)[r] ?? r}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Department</label>
        <select value={department} onChange={(e) => setDepartment(e.target.value as Department)} className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none">
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>{(DEPARTMENT_LABELS as Record<string, string>)[d] ?? d}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Reports To</label>
        <select value={reportsTo} onChange={(e) => setReportsTo(e.target.value)} className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none">
          <option value="">None</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({(AGENT_ROLE_LABELS as Record<string, string>)[a.role] ?? a.role})</option>
          ))}
        </select>
      </div>

      <Button variant="outline" size="sm" className="w-full" onClick={onShowTalentPool}>
        <BookTemplate className="h-3.5 w-3.5 mr-1.5" />
        Select from Talent Pool
      </Button>

      {employmentType === "contractor" && (
        <div className="space-y-4 border-t border-border pt-4">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contract Details</div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Project *</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none">
              <option value="">Select a project</option>
              {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">End Condition</label>
            <div className="space-y-1">
              {CONTRACT_END_CONDITIONS.map((ec) => (
                <label key={ec} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="endCondition" value={ec} checked={endCondition === ec} onChange={() => setEndCondition(ec)} className="accent-foreground" />
                  {END_CONDITION_LABELS[ec]}
                </label>
              ))}
            </div>
          </div>

          {endCondition === "date" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">End Date</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="text-sm" />
            </div>
          )}

          {endCondition === "budget_exhausted" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Budget Amount ($)</label>
              <Input type="number" min="0" step="0.01" value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} placeholder="0.00" className="text-sm" />
            </div>
          )}
        </div>
      )}

      <Button className="w-full" disabled={!canProceedToReview} onClick={onNext}>
        Review
        <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
      </Button>
    </div>
  );
}

interface TalentPoolOverlayProps {
  templates: RoleTemplate[];
  onSelect: (t: RoleTemplate) => void;
}

export function TalentPoolOverlay({ templates, onSelect }: TalentPoolOverlayProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Select a role template to pre-fill the configuration form.
      </p>
      {templates.length === 0 && (
        <p className="text-xs text-muted-foreground py-4 text-center">
          No role templates available. Create templates in Company Settings.
        </p>
      )}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {templates.map((t) => (
          <button
            key={t.id}
            className="w-full text-left rounded-md border border-border p-3 hover:bg-accent/50 transition-colors"
            onClick={() => onSelect(t)}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t.title}</span>
              <Badge variant="outline" className="text-[10px]">
                {(EMPLOYMENT_TYPE_LABELS as Record<string, string>)[t.employmentType] ?? t.employmentType}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">
                {(AGENT_ROLE_LABELS as Record<string, string>)[t.role] ?? t.role}
              </span>
              {t.department && (
                <>
                  <span className="text-border">|</span>
                  <span className="text-xs text-muted-foreground">
                    {(DEPARTMENT_LABELS as Record<string, string>)[t.department] ?? t.department}
                  </span>
                </>
              )}
            </div>
            {t.capabilities && (
              <p className="text-xs text-muted-foreground/70 mt-1">{t.capabilities}</p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
