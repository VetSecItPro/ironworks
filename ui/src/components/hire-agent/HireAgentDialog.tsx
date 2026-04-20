import type { AgentRole, ContractEndCondition, Department } from "@ironworksai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { agentsApi } from "../../api/agents";
import { hiringApi } from "../../api/hiring";
import { projectsApi } from "../../api/projects";
import { type RoleTemplate, roleTemplatesApi } from "../../api/roleTemplates";
import { useCompany } from "../../context/CompanyContext";
import { useDialog } from "../../context/DialogContext";
import { useToast } from "../../context/ToastContext";
import { queryKeys } from "../../lib/queryKeys";
import { HireStepConfig, TalentPoolOverlay } from "./HireStepConfig";
import { HireStepReview } from "./HireStepReview";
import { HireStepType } from "./HireStepType";

type EmploymentType = "full_time" | "contractor";
type Step = 1 | 2 | 3;

export function HireAgentDialog() {
  const { hireAgentOpen, closeHireAgent } = useDialog();
  const { selectedCompanyId } = useCompany();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>(1);
  const [employmentType, setEmploymentType] = useState<EmploymentType | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState<AgentRole>("engineer");
  const [department, setDepartment] = useState<Department>("engineering");
  const [reportsTo, setReportsTo] = useState<string>("");
  const [showTalentPool, setShowTalentPool] = useState(false);
  const [projectId, setProjectId] = useState<string>("");
  const [endCondition, setEndCondition] = useState<ContractEndCondition>("manual");
  const [endDate, setEndDate] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && hireAgentOpen,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && hireAgentOpen && employmentType === "contractor",
  });

  const { data: templates } = useQuery({
    queryKey: queryKeys.roleTemplates.list(selectedCompanyId!),
    queryFn: () => roleTemplatesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && hireAgentOpen && showTalentPool,
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => hiringApi.create(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hiring.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.headcount(selectedCompanyId!) });
    },
  });

  const fulfillMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => hiringApi.fulfill(selectedCompanyId!, id, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hiring.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.headcount(selectedCompanyId!) });
    },
  });

  function resetState() {
    setStep(1);
    setEmploymentType(null);
    setName("");
    setRole("engineer");
    setDepartment("engineering");
    setReportsTo("");
    setShowTalentPool(false);
    setProjectId("");
    setEndCondition("manual");
    setEndDate("");
    setBudgetAmount("");
  }

  function handleClose() {
    resetState();
    closeHireAgent();
  }

  function handleTemplateSelect(t: RoleTemplate) {
    setName(t.title);
    setRole(t.role as AgentRole);
    if (t.department) setDepartment(t.department as Department);
    if (t.employmentType === "contractor" || t.employmentType === "full_time") {
      setEmploymentType(t.employmentType as EmploymentType);
    }
    setShowTalentPool(false);
  }

  function buildPayload(status: string) {
    const payload: Record<string, unknown> = {
      title: name.trim(),
      role,
      department,
      employmentType,
      status,
      reportsToAgentId: reportsTo || null,
    };
    if (employmentType === "contractor") {
      payload.projectId = projectId || null;
      payload.endCondition = endCondition;
      if (endCondition === "date" && endDate) payload.endDate = endDate;
      if (endCondition === "budget_exhausted" && budgetAmount)
        payload.budgetCents = Math.round(parseFloat(budgetAmount) * 100);
    }
    return payload;
  }

  async function handleSubmitForApproval() {
    try {
      await createMutation.mutateAsync(buildPayload("pending"));
      pushToast({ title: "Hiring request submitted", body: "Awaiting approval.", tone: "success" });
      handleClose();
    } catch (err) {
      pushToast({
        title: "Failed to submit",
        body: err instanceof Error ? err.message : "Unknown error",
        tone: "error",
      });
    }
  }

  async function handleHireNow() {
    try {
      const req = await createMutation.mutateAsync(buildPayload("approved"));
      await fulfillMutation.mutateAsync({ id: req.id });
      pushToast({ title: "Agent hired", body: `${name} has been added to the team.`, tone: "success" });
      handleClose();
    } catch (err) {
      pushToast({ title: "Failed to hire", body: err instanceof Error ? err.message : "Unknown error", tone: "error" });
    }
  }

  const canProceedToReview = name.trim().length > 0 && (employmentType !== "contractor" || !!projectId);
  const isPending = createMutation.isPending || fulfillMutation.isPending;

  return (
    <Dialog
      open={hireAgentOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                type="button"
                aria-label="Go back"
                className="text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => {
                  if (showTalentPool) {
                    setShowTalentPool(false);
                    return;
                  }
                  setStep((step - 1) as Step);
                }}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
            )}
            <span className="text-sm text-muted-foreground">
              {step === 1 && "Hire Agent - Employment Type"}
              {step === 2 && (showTalentPool ? "Select from Talent Pool" : "Hire Agent - Configuration")}
              {step === 3 && "Hire Agent - Review"}
            </span>
          </div>
          <Button variant="ghost" size="icon-xs" className="text-muted-foreground" onClick={handleClose}>
            <span className="text-lg leading-none">&times;</span>
          </Button>
        </div>

        <div className="p-6 space-y-4">
          {step === 1 && (
            <HireStepType
              employmentType={employmentType}
              onSelect={(type) => {
                setEmploymentType(type);
                setStep(2);
              }}
            />
          )}

          {step === 2 && !showTalentPool && employmentType && (
            <HireStepConfig
              name={name}
              setName={setName}
              role={role}
              setRole={setRole}
              department={department}
              setDepartment={setDepartment}
              reportsTo={reportsTo}
              setReportsTo={setReportsTo}
              employmentType={employmentType}
              projectId={projectId}
              setProjectId={setProjectId}
              endCondition={endCondition}
              setEndCondition={setEndCondition}
              endDate={endDate}
              setEndDate={setEndDate}
              budgetAmount={budgetAmount}
              setBudgetAmount={setBudgetAmount}
              agents={agents ?? []}
              projects={projects ?? []}
              canProceedToReview={canProceedToReview}
              onNext={() => setStep(3)}
              onShowTalentPool={() => setShowTalentPool(true)}
            />
          )}

          {step === 2 && showTalentPool && (
            <TalentPoolOverlay templates={templates ?? []} onSelect={handleTemplateSelect} />
          )}

          {step === 3 && employmentType && (
            <HireStepReview
              name={name}
              employmentType={employmentType}
              role={role}
              department={department}
              reportsTo={reportsTo}
              projectId={projectId}
              endCondition={endCondition}
              endDate={endDate}
              budgetAmount={budgetAmount}
              agents={agents ?? []}
              projects={projects ?? []}
              isPending={isPending}
              isCreating={createMutation.isPending && !fulfillMutation.isPending}
              error={createMutation.error ?? fulfillMutation.error ?? null}
              onSubmitForApproval={handleSubmitForApproval}
              onHireNow={handleHireNow}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
