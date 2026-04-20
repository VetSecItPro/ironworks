import { useQuery } from "@tanstack/react-query";
import { channelsApi } from "../../api/channels";
import { queryKeys } from "../../lib/queryKeys";

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
      <p className="text-[11px] text-muted-foreground capitalize">{label}</p>
      <p className="text-[18px] font-semibold text-foreground">{value}</p>
    </div>
  );
}

export interface ChannelAnalyticsPanelProps {
  companyId: string;
  channelId: string;
}

export function ChannelAnalyticsPanel({ companyId, channelId }: ChannelAnalyticsPanelProps) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.channels.analytics(companyId, channelId),
    queryFn: () => channelsApi.analytics(companyId, channelId),
  });

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Loading analytics...</div>
    );
  }
  if (!data) return null;

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Total Messages" value={data.totalMessages} />
        <StatCard label="Decisions" value={data.decisionsCount} />
        <StatCard label="Escalations" value={data.escalationsCount} />
        <StatCard label="Avg / Day" value={data.avgMessagesPerDay} />
        {Object.entries(data.messagesByType).map(([type, count]) => (
          <StatCard key={type} label={type.replace(/_/g, " ")} value={count} />
        ))}
      </div>
      {data.topContributors.length > 0 && (
        <div>
          <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Top Contributors (last 30 days)
          </p>
          <div className="space-y-1">
            {data.topContributors.map((c) => (
              <div key={c.agentId} className="flex items-center justify-between text-[13px]">
                <span className="text-foreground">{c.name}</span>
                <span className="text-muted-foreground">{c.messageCount} messages</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
