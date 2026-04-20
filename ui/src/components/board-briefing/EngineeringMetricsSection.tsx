import { Cpu } from "lucide-react";
import type { DORAMetrics } from "../../api/executive";
import { DORAMetricBlock } from "../briefing/BriefingCards";

interface EngineeringMetricsSectionProps {
  doraMetrics: DORAMetrics;
}

export function EngineeringMetricsSection({ doraMetrics }: EngineeringMetricsSectionProps) {
  return (
    <div className="rounded-xl border border-border p-5 space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <Cpu className="h-3.5 w-3.5" />
        Engineering Metrics
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DORAMetricBlock
          label="Deployment Frequency"
          value={`${doraMetrics.deploymentFrequency.toFixed(1)}/day`}
          tier={
            doraMetrics.deploymentFrequency >= 1
              ? "elite"
              : doraMetrics.deploymentFrequency >= 0.14
                ? "high"
                : doraMetrics.deploymentFrequency >= 0.03
                  ? "medium"
                  : "low"
          }
          description="Heartbeat runs per day (proxy)"
        />
        <DORAMetricBlock
          label="Lead Time"
          value={doraMetrics.leadTime < 60 ? `${doraMetrics.leadTime}m` : `${Math.round(doraMetrics.leadTime / 60)}h`}
          tier={
            doraMetrics.leadTime <= 60
              ? "elite"
              : doraMetrics.leadTime <= 1440
                ? "high"
                : doraMetrics.leadTime <= 10080
                  ? "medium"
                  : "low"
          }
          description="Avg issue created to done"
        />
        <DORAMetricBlock
          label="Change Failure Rate"
          value={`${doraMetrics.changeFailureRate.toFixed(1)}%`}
          tier={
            doraMetrics.changeFailureRate <= 5
              ? "elite"
              : doraMetrics.changeFailureRate <= 10
                ? "high"
                : doraMetrics.changeFailureRate <= 15
                  ? "medium"
                  : "low"
          }
          description="Cancelled / total issues"
        />
        <DORAMetricBlock
          label="Mean Time to Recovery"
          value={
            doraMetrics.meanTimeToRecovery < 60
              ? `${doraMetrics.meanTimeToRecovery}m`
              : `${Math.round(doraMetrics.meanTimeToRecovery / 60)}h`
          }
          tier={
            doraMetrics.meanTimeToRecovery <= 60
              ? "elite"
              : doraMetrics.meanTimeToRecovery <= 1440
                ? "high"
                : doraMetrics.meanTimeToRecovery <= 10080
                  ? "medium"
                  : "low"
          }
          description="Critical/high issue resolution time"
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        DORA tiers: green = Elite, blue = High, amber = Medium, red = Low. Based on last 30 days.
      </p>
    </div>
  );
}
