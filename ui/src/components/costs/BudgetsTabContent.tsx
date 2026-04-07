import { Plus } from "lucide-react";
import type { BudgetPolicySummary, BudgetIncident } from "@ironworksai/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BudgetIncidentCard } from "../BudgetIncidentCard";
import { BudgetPolicyCard } from "../BudgetPolicyCard";
import { PageSkeleton } from "../PageSkeleton";
import { NewBudgetDialog } from "../NewBudgetDialog";
import { MetricTile } from "./MetricTile";
import { ArrowUpRight, Coins, DollarSign, ReceiptText } from "lucide-react";

interface BudgetOverview {
  policies: BudgetPolicySummary[];
  activeIncidents: BudgetIncident[];
  pendingApprovalCount: number;
  pausedAgentCount: number;
  pausedProjectCount: number;
}

export function BudgetsTabContent({
  budgetData,
  budgetLoading,
  budgetError,
  showNewBudget,
  setShowNewBudget,
  policyMutation,
  incidentMutation,
  activeBudgetIncidents,
  budgetPoliciesByScope,
}: {
  budgetData?: BudgetOverview | null;
  budgetLoading: boolean;
  budgetError: Error | null;
  showNewBudget: boolean;
  setShowNewBudget: (v: boolean) => void;
  policyMutation: {
    isPending: boolean;
    mutate: (input: { scopeType: BudgetPolicySummary["scopeType"]; scopeId: string; amount: number; windowKind: BudgetPolicySummary["windowKind"] }, opts?: { onSuccess?: () => void }) => void;
  };
  incidentMutation: {
    isPending: boolean;
    mutate: (input: { incidentId: string; action: "keep_paused" | "raise_budget_and_resume"; amount?: number }) => void;
  };
  activeBudgetIncidents: BudgetIncident[];
  budgetPoliciesByScope: { company: BudgetPolicySummary[]; agent: BudgetPolicySummary[]; project: BudgetPolicySummary[] };
}) {
  const budgetPolicies = budgetData?.policies ?? [];

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Budget Control</h2>
          <p className="text-sm text-muted-foreground">Set spend limits for agents, projects, or the entire company.</p>
        </div>
        <Button size="sm" onClick={() => setShowNewBudget(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Set Budget
        </Button>
      </div>

      <NewBudgetDialog
        open={showNewBudget}
        onOpenChange={setShowNewBudget}
        onSubmit={(policy) => {
          policyMutation.mutate(policy, {
            onSuccess: () => setShowNewBudget(false),
          });
        }}
        isPending={policyMutation.isPending}
      />

      {budgetLoading ? (
        <PageSkeleton variant="costs" />
      ) : budgetError ? (
        <p className="text-sm text-destructive">{budgetError.message}</p>
      ) : (
        <>
          <Card className="border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))]">
            <CardHeader className="px-5 pt-5 pb-3">
              <CardTitle className="text-base">Status</CardTitle>
              <CardDescription>
                Hard-stop spend limits for agents and projects. Provider subscription quota stays separate and appears under Providers.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 px-5 pb-5 pt-0 md:grid-cols-4">
              <MetricTile
                label="Active incidents"
                value={String(activeBudgetIncidents.length)}
                subtitle="Open soft or hard threshold crossings"
                icon={ReceiptText}
              />
              <MetricTile
                label="Pending approvals"
                value={String(budgetData?.pendingApprovalCount ?? 0)}
                subtitle="Budget override approvals awaiting board action"
                icon={ArrowUpRight}
              />
              <MetricTile
                label="Paused agents"
                value={String(budgetData?.pausedAgentCount ?? 0)}
                subtitle="Agent heartbeats blocked by budget"
                icon={Coins}
              />
              <MetricTile
                label="Paused projects"
                value={String(budgetData?.pausedProjectCount ?? 0)}
                subtitle="Project execution blocked by budget"
                icon={DollarSign}
              />
            </CardContent>
          </Card>

          {activeBudgetIncidents.length > 0 ? (
            <div className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">Active incidents</h2>
                <p className="text-sm text-muted-foreground">
                  Resolve hard stops here by raising the budget or explicitly keeping the scope paused.
                </p>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {activeBudgetIncidents.map((incident) => (
                  <BudgetIncidentCard
                    key={incident.id}
                    incident={incident}
                    isMutating={incidentMutation.isPending}
                    onKeepPaused={() => incidentMutation.mutate({ incidentId: incident.id, action: "keep_paused" })}
                    onRaiseAndResume={(amount) =>
                      incidentMutation.mutate({
                        incidentId: incident.id,
                        action: "raise_budget_and_resume",
                        amount,
                      })}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-5">
            {(["company", "agent", "project"] as const).map((scopeType) => {
              const rows = budgetPoliciesByScope[scopeType];
              if (rows.length === 0) return null;
              return (
                <section key={scopeType} className="space-y-3">
                  <div>
                    <h2 className="text-lg font-semibold capitalize">{scopeType} budgets</h2>
                    <p className="text-sm text-muted-foreground">
                      {scopeType === "company"
                        ? "Company-wide monthly policy."
                        : scopeType === "agent"
                          ? "Recurring monthly spend policies for individual agents."
                          : "Lifetime spend policies for execution-bound projects."}
                    </p>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    {rows.map((summary) => (
                      <BudgetPolicyCard
                        key={summary.policyId}
                        summary={summary}
                        isSaving={policyMutation.isPending}
                        onSave={(amount) =>
                          policyMutation.mutate({
                            scopeType: summary.scopeType,
                            scopeId: summary.scopeId,
                            amount,
                            windowKind: summary.windowKind,
                          })}
                      />
                    ))}
                  </div>
                </section>
              );
            })}

            {budgetPolicies.length === 0 ? (
              <Card>
                <CardContent className="px-5 py-8 text-sm text-muted-foreground">
                  No budget policies yet. Set agent and project budgets from their detail pages, or use the existing company monthly budget control.
                </CardContent>
              </Card>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}
