import { cn } from "../lib/utils";

interface TwoPaneLayoutProps {
  /** Left pane content (typically a scrollable list) */
  list: React.ReactNode;
  /** Right pane content (typically a detail view/reader) */
  detail: React.ReactNode;
  /** Width of the left list pane. Default: "360px" */
  listWidth?: string;
  /** Optional empty state when no detail is selected */
  emptyDetail?: React.ReactNode;
  /** Whether a detail item is selected (controls empty state) */
  hasSelection?: boolean;
  className?: string;
}

export function TwoPaneLayout({
  list,
  detail,
  listWidth = "360px",
  emptyDetail,
  hasSelection = true,
  className,
}: TwoPaneLayoutProps) {
  return (
    <div
      className={cn("flex-1 min-h-0 overflow-hidden", className)}
      style={{ display: "grid", gridTemplateColumns: `${listWidth} 1fr` }}
    >
      {/* Left pane - scrollable list */}
      <div className="overflow-y-auto border-r border-border">{list}</div>

      {/* Right pane - detail view */}
      <div className="overflow-y-auto">
        {hasSelection
          ? detail
          : (emptyDetail ?? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Select an item to view details
              </div>
            ))}
      </div>
    </div>
  );
}
