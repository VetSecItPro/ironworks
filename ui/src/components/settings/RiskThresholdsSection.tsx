import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { executiveApi } from "../../api/executive";
import { useToast } from "../../context/ToastContext";

export function RiskThresholdsSection({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const { data: settings } = useQuery({
    queryKey: ["risk-settings", companyId],
    queryFn: () => executiveApi.getRiskSettings(companyId),
    enabled: !!companyId,
  });

  const [spendDollars, setSpendDollars] = useState("");
  const [perfThreshold, setPerfThreshold] = useState("");
  const [resolveHours, setResolveHours] = useState("");

  useEffect(() => {
    if (!settings) return;
    setSpendDollars(String((settings.spendingAlertThresholdCents / 100).toFixed(0)));
    setPerfThreshold(String(settings.performanceAlertThreshold));
    setResolveHours(String(settings.autoResolveTimeoutHours));
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () =>
      executiveApi.updateRiskSettings(companyId, {
        spendingAlertThresholdCents: Math.round(parseFloat(spendDollars) * 100),
        performanceAlertThreshold: parseInt(perfThreshold, 10),
        autoResolveTimeoutHours: parseInt(resolveHours, 10),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["risk-settings", companyId],
      });
      pushToast({ title: "Risk thresholds saved", tone: "success" });
    },
    onError: () => {
      pushToast({ title: "Failed to save risk thresholds", tone: "error" });
    },
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5" />
        Risk Thresholds
      </h2>
      <div className="rounded-md border border-border px-4 py-4 space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Spending alert threshold (per run)</label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">$</span>
            <input
              type="number"
              inputMode="decimal"
              min={1}
              step={1}
              value={spendDollars}
              onChange={(e) => setSpendDollars(e.target.value)}
              className="w-28 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
            />
          </div>
          <p className="text-xs text-muted-foreground">Alert fires when a single agent run exceeds this amount.</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Performance alert threshold</label>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            value={perfThreshold}
            onChange={(e) => setPerfThreshold(e.target.value)}
            className="w-28 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
          />
          <p className="text-xs text-muted-foreground">Agents scoring below this threshold trigger a medium alert.</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Auto-resolve timeout (hours)</label>
          <input
            type="number"
            inputMode="decimal"
            min={1}
            value={resolveHours}
            onChange={(e) => setResolveHours(e.target.value)}
            className="w-28 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
          />
          <p className="text-xs text-muted-foreground">Low-severity alerts are auto-resolved after this many hours.</p>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button type="button"
            className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving..." : "Save thresholds"}
          </button>
          {saveMutation.isSuccess && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3 w-3" />
              Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
