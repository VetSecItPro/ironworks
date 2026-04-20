import type { BudgetOverview, CostByAgent, CostSummary } from "@ironworksai/shared";
import { ArrowUpRight, Coins, CreditCard, DollarSign, Download, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type DatePreset, PRESET_KEYS, PRESET_LABELS } from "../../hooks/useDateRange";
import { exportToCSV } from "../../lib/exportCSV";
import { formatCents, formatTokens } from "../../lib/utils";
import { MetricTile } from "./MetricTile";

interface CostsHeaderProps {
  preset: DatePreset;
  setPreset: (key: DatePreset) => void;
  customFrom: string;
  setCustomFrom: (v: string) => void;
  customTo: string;
  setCustomTo: (v: string) => void;
  spendData:
    | {
        summary: CostSummary;
        byAgent: CostByAgent[];
      }
    | undefined;
  financeData:
    | {
        summary: {
          netCents: number;
          debitCents: number;
          creditCents: number;
          eventCount: number;
          estimatedDebitCents: number;
        };
      }
    | undefined;
  equivalentSpend: { billingMode: string; totalEquivalentCents: number } | undefined;
  budgetData: BudgetOverview | undefined;
  activeBudgetIncidents: Array<{ id: string }>;
  inferenceTokenTotal: number;
  setMainTab: (
    tab:
      | "overview"
      | "budgets"
      | "providers"
      | "billers"
      | "finance"
      | "projects"
      | "tokens"
      | "departments"
      | "analysis",
  ) => void;
}

export function CostsHeader({
  preset,
  setPreset,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
  spendData,
  financeData,
  equivalentSpend,
  budgetData,
  activeBudgetIncidents,
  inferenceTokenTotal,
  setMainTab,
}: CostsHeaderProps) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Costs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Inference spend, platform fees, credits, and live quota windows.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const rows = spendData?.byAgent ?? [];
              if (rows.length === 0) return;
              exportToCSV(
                rows.map((r) => ({
                  agent: r.agentName || r.agentId,
                  cost: (r.costCents / 100).toFixed(2),
                  inputTokens: r.inputTokens,
                  outputTokens: r.outputTokens,
                  apiRuns: r.apiRunCount,
                })),
                "costs-export",
                [
                  { key: "agent", label: "Agent" },
                  { key: "cost", label: "Cost ($)" },
                  { key: "inputTokens", label: "Input Tokens" },
                  { key: "outputTokens", label: "Output Tokens" },
                  { key: "apiRuns", label: "API Runs" },
                ],
              );
            }}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export CSV
          </Button>
          {PRESET_KEYS.map((key) => (
            <Button key={key} variant={preset === key ? "secondary" : "ghost"} size="sm" onClick={() => setPreset(key)}>
              {PRESET_LABELS[key]}
            </Button>
          ))}
        </div>
      </div>

      {preset === "custom" ? (
        <div className="flex flex-wrap items-center gap-2 border border-border p-3">
          <input
            type="date"
            value={customFrom}
            onChange={(event) => setCustomFrom(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(event) => setCustomTo(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          />
        </div>
      ) : null}

      {equivalentSpend && equivalentSpend.billingMode !== "none" && equivalentSpend.billingMode !== "api" && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-blue-500/20 bg-blue-500/5 text-sm">
          <CreditCard className="h-4 w-4 text-blue-500 shrink-0" />
          <span className="text-muted-foreground">
            {equivalentSpend.billingMode === "subscription" ? "Subscription covers all usage." : "Mixed billing."}{" "}
            <span className="font-medium text-foreground">
              Equivalent API spend: {formatCents(equivalentSpend.totalEquivalentCents)}
            </span>
          </span>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-4">
        <MetricTile
          label="Inference spend"
          value={formatCents(spendData?.summary.spendCents ?? 0)}
          subtitle={`${formatTokens(inferenceTokenTotal)} tokens across request-scoped events`}
          icon={DollarSign}
          onClick={() => setMainTab("providers")}
        />
        <MetricTile
          label="Budget"
          value={
            activeBudgetIncidents.length > 0
              ? String(activeBudgetIncidents.length)
              : spendData?.summary.budgetCents && spendData.summary.budgetCents > 0
                ? `${spendData.summary.utilizationPercent}%`
                : "Open"
          }
          subtitle={
            activeBudgetIncidents.length > 0
              ? `${budgetData?.pausedAgentCount ?? 0} agents paused - ${budgetData?.pausedProjectCount ?? 0} projects paused`
              : spendData?.summary.budgetCents && spendData.summary.budgetCents > 0
                ? `${formatCents(spendData.summary.spendCents)} of ${formatCents(spendData.summary.budgetCents)}`
                : "No monthly cap configured"
          }
          icon={Coins}
          onClick={() => setMainTab("budgets")}
        />
        <MetricTile
          label="Finance net"
          value={formatCents(financeData?.summary.netCents ?? 0)}
          subtitle={`${formatCents(financeData?.summary.debitCents ?? 0)} debits - ${formatCents(financeData?.summary.creditCents ?? 0)} credits`}
          icon={ReceiptText}
          onClick={() => setMainTab("finance")}
        />
        <MetricTile
          label="Finance events"
          value={String(financeData?.summary.eventCount ?? 0)}
          subtitle={`${formatCents(financeData?.summary.estimatedDebitCents ?? 0)} estimated in range`}
          icon={ArrowUpRight}
          onClick={() => setMainTab("finance")}
        />
      </div>
    </div>
  );
}
