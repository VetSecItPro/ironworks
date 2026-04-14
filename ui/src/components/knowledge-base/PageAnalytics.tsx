import { useMemo } from "react";
import type { KnowledgePage } from "../../api/knowledge";
import { BarChart3 } from "lucide-react";

export function PageAnalytics({ page }: { page: KnowledgePage }) {
  // Mock analytics - in production this would come from an API
  const mockViews = useMemo(() => Math.floor(Math.random() * 50) + 5, [page.id]);
  const mockReaders = useMemo(() => {
    const names = ["CEO", "CTO", "SeniorEngineer", "DevOpsEngineer", "ContentMarketer"];
    const count = Math.min(names.length, Math.floor(Math.random() * 4) + 1);
    return names.slice(0, count);
  }, [page.id]);

  return (
    <div className="border-t border-border pt-3 mt-4">
      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
        <BarChart3 className="h-3 w-3" />
        Page Analytics
      </h4>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-muted/20 px-3 py-2">
          <p className="text-[10px] text-muted-foreground">Views</p>
          <p className="text-lg font-bold tabular-nums">{mockViews}</p>
        </div>
        <div className="rounded-lg bg-muted/20 px-3 py-2">
          <p className="text-[10px] text-muted-foreground">Last Read By</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {mockReaders.map((name) => (
              <span key={name} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
