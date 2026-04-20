import type { BudgetPolicySummary } from "@ironworksai/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { budgetsApi } from "../../api/budgets";
import { costsApi } from "../../api/costs";
import { queryKeys } from "../../lib/queryKeys";

interface UseCostsMutationsParams {
  selectedCompanyId: string | null;
  companyId: string;
  onFinanceEventSuccess: () => void;
}

export function useCostsMutations({ selectedCompanyId, companyId, onFinanceEventSuccess }: UseCostsMutationsParams) {
  const queryClient = useQueryClient();

  const invalidateBudgetViews = () => {
    if (!selectedCompanyId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.budgets.overview(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(selectedCompanyId) });
  };

  const policyMutation = useMutation({
    mutationFn: (input: {
      scopeType: BudgetPolicySummary["scopeType"];
      scopeId: string;
      amount: number;
      windowKind: BudgetPolicySummary["windowKind"];
    }) =>
      budgetsApi.upsertPolicy(companyId, {
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        amount: input.amount,
        windowKind: input.windowKind,
      }),
    onSuccess: invalidateBudgetViews,
  });

  const financeEventMutation = useMutation({
    mutationFn: (event: Parameters<typeof costsApi.createFinanceEvent>[1]) =>
      costsApi.createFinanceEvent(companyId, event),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.financeSummary(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.financeByBiller(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.financeByKind(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.financeEvents(companyId) });
      onFinanceEventSuccess();
    },
  });

  const incidentMutation = useMutation({
    mutationFn: (input: { incidentId: string; action: "keep_paused" | "raise_budget_and_resume"; amount?: number }) =>
      budgetsApi.resolveIncident(companyId, input.incidentId, input),
    onSuccess: invalidateBudgetViews,
  });

  return { policyMutation, financeEventMutation, incidentMutation };
}
