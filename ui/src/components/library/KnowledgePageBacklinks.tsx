import { useQuery } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type BacklinkRow, knowledgeApi } from "../../api/knowledge";
import { cn } from "../../lib/utils";

export function KnowledgePageBacklinks({ pageId, onNavigate }: { pageId: string; onNavigate?: (id: string) => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["knowledge-page-backlinks", pageId],
    queryFn: () => knowledgeApi.getBacklinks(pageId),
    enabled: !!pageId,
  });

  const backlinks: BacklinkRow[] = data ?? [];
  const count = backlinks.length;

  return (
    <div className="h-full flex flex-col border-l border-border bg-muted/10">
      <div className="px-3 py-2 border-b border-border shrink-0 flex items-center gap-1.5">
        <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {isLoading ? "Loading backlinks..." : `Linked from ${count} page${count === 1 ? "" : "s"}`}
        </span>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 flex flex-col gap-1">
          {error ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              {error instanceof Error ? error.message : "Failed to load backlinks"}
            </p>
          ) : isLoading ? (
            <div className="flex flex-col gap-1.5 px-1 py-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-8 rounded bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : count === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">No inbound links yet</p>
          ) : (
            backlinks.map((bl) => (
              <button
                key={`${bl.pageId}-${bl.anchor ?? ""}`}
                type="button"
                onClick={() => onNavigate?.(bl.pageId)}
                className={cn(
                  "w-full text-left px-2 py-1.5 rounded hover:bg-muted/60 transition-colors",
                  "flex flex-col gap-0.5 group",
                )}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-medium truncate text-foreground group-hover:text-foreground">
                    {bl.title}
                  </span>
                  {bl.anchor && (
                    <span className="text-[10px] px-1 py-0 rounded bg-muted text-muted-foreground shrink-0">
                      #{bl.anchor}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground truncate">{bl.slug}</span>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
