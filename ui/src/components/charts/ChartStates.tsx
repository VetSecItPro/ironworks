import { BarChart3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-3 animate-pulse" style={{ height }}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-6 w-20" />
      </div>
      <div className="flex items-end gap-1 h-[calc(100%-3rem)]">
        {Array.from({ length: 8 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder list; items are anonymous, count-only
          <Skeleton key={i} className="flex-1 rounded-t" style={{ height: `${30 + Math.random() * 60}%` }} />
        ))}
      </div>
    </div>
  );
}

export function ChartNoData({ message, height = 200 }: { message?: string; height?: number }) {
  return (
    <div
      className="rounded-lg border border-border flex flex-col items-center justify-center text-center"
      style={{ height }}
    >
      <BarChart3 className="h-8 w-8 text-muted-foreground/30 mb-2" />
      <p className="text-sm text-muted-foreground">{message ?? "No data available"}</p>
      <p className="text-xs text-muted-foreground/80 mt-0.5">Data will appear once activity is recorded</p>
    </div>
  );
}
