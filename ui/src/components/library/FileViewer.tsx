import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { libraryApi } from "../../api/library";
import { queryKeys } from "../../lib/queryKeys";
import { MarkdownBody } from "../MarkdownBody";
import { EventHistory, UsageAnalyticsPanel } from "./FileHistory";
import { FileMetaBar } from "./FileMetaBar";
import { formatBytes, formatDate, isMarkdown } from "./libraryHelpers";

export function FileViewer({ companyId, filePath }: { companyId: string; filePath: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.library.file(companyId, filePath),
    queryFn: () => libraryApi.file(companyId, filePath),
    enabled: !!filePath,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Loading file...</div>;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-destructive">
        {error instanceof Error ? error.message : "Failed to load file"}
      </div>
    );
  }

  if (!data) return null;

  if (data.error || data.content === null) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          <p className="font-medium">{data.name}</p>
          <p className="mt-1">{data.error ?? "Binary file - cannot display"}</p>
          <p className="mt-1 text-xs">{formatBytes(data.size)}</p>
        </div>
      </div>
    );
  }

  const name = data.name;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{name}</span>
          <span className="text-xs text-muted-foreground shrink-0">{formatBytes(data.size)}</span>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{formatDate(data.modifiedAt)}</span>
      </div>

      {data.meta && <FileMetaBar meta={data.meta} contributors={data.contributors ?? []} />}

      <ScrollArea className="flex-1 min-h-0">
        {isMarkdown(name) ? (
          <div className="p-6 max-w-none">
            <MarkdownBody>{data.content}</MarkdownBody>
          </div>
        ) : (
          <pre className="p-6 text-[13px] leading-relaxed font-mono whitespace-pre-wrap break-words text-foreground">
            {data.content}
          </pre>
        )}
      </ScrollArea>

      {data.events && data.contributors && (
        <UsageAnalyticsPanel events={data.events} contributors={data.contributors ?? []} />
      )}

      {data.events && data.events.length > 0 && <EventHistory events={data.events} />}
    </div>
  );
}
