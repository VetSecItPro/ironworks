import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

const COST_ALERT_STORAGE_KEY = (companyId: string) => `ironworks:cost-alerts:${companyId}`;

interface CostAlertThreshold {
  id: string;
  label: string;
  thresholdCents: number;
  enabled: boolean;
}

const DEFAULT_THRESHOLDS: CostAlertThreshold[] = [
  { id: "daily-50", label: "Daily spend exceeds $50", thresholdCents: 5000, enabled: false },
  { id: "weekly-200", label: "Weekly spend exceeds $200", thresholdCents: 20000, enabled: false },
  { id: "monthly-500", label: "Monthly spend exceeds $500", thresholdCents: 50000, enabled: false },
];

export function CostAlertsSection({ companyId }: { companyId: string | null | undefined }) {
  const [thresholds, setThresholds] = useState<CostAlertThreshold[]>(() => {
    if (!companyId) return DEFAULT_THRESHOLDS;
    try {
      const stored = localStorage.getItem(COST_ALERT_STORAGE_KEY(companyId));
      if (stored) return JSON.parse(stored) as CostAlertThreshold[];
    } catch {}
    return DEFAULT_THRESHOLDS;
  });

  useEffect(() => {
    if (!companyId) return;
    try {
      localStorage.setItem(COST_ALERT_STORAGE_KEY(companyId), JSON.stringify(thresholds));
    } catch {}
  }, [companyId, thresholds]);

  const toggleThreshold = (id: string) => {
    setThresholds((prev) => prev.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)));
  };

  const updateThreshold = (id: string, cents: number) => {
    setThresholds((prev) => prev.map((t) => (t.id === id ? { ...t, thresholdCents: cents } : t)));
  };

  return (
    <div id="cost-alerts" className="space-y-4 scroll-mt-6">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5" />
        Cost Alerts
      </div>
      <div className="rounded-md border border-border px-4 py-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Configure spending thresholds that trigger alerts. Stored locally per device.
        </p>
        {thresholds.map((threshold) => (
          <div
            key={threshold.id}
            className="flex items-center justify-between gap-4 py-2 border-b border-border/50 last:border-0"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{threshold.label}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground">Threshold:</span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={threshold.thresholdCents}
                  onChange={(e) => updateThreshold(threshold.id, Number(e.target.value))}
                  className="w-24 rounded-md border border-border bg-background px-2 py-1 text-xs"
                />
                <span className="text-xs text-muted-foreground">cents</span>
                <span className="text-xs text-muted-foreground ml-1">
                  (${(threshold.thresholdCents / 100).toFixed(2)})
                </span>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              data-slot="toggle"
              aria-checked={threshold.enabled}
              aria-label={threshold.enabled ? `Disable ${threshold.label}` : `Enable ${threshold.label}`}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                threshold.enabled ? "bg-foreground" : "bg-muted"
              }`}
              onClick={() => toggleThreshold(threshold.id)}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-background shadow-sm transition-transform ${
                  threshold.enabled ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
