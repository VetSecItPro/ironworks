import { BarChart2, CheckCheck, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "../../lib/utils";

export type FilterMode = "all" | "decisions" | "analytics";

export interface ChannelHeaderProps {
  channelName: string;
  unreadCount: number;
  onMarkAllRead: () => void;
  filter: FilterMode;
  onFilterChange: (mode: FilterMode) => void;
  searchOpen: boolean;
  onSearchToggle: () => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  filteredCount: number;
}

export function ChannelHeader({
  channelName,
  unreadCount,
  onMarkAllRead,
  filter,
  onFilterChange,
  searchOpen,
  onSearchToggle,
  searchTerm,
  onSearchTermChange,
  filteredCount,
}: ChannelHeaderProps) {
  return (
    <>
      <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-[15px] font-semibold text-foreground">
            <span className="text-muted-foreground">#</span>
            {channelName}
          </h1>
          {unreadCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-500 text-white">
              {unreadCount} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button type="button"
              onClick={onMarkAllRead}
              className="px-2 py-1 text-[11px] font-medium rounded-full text-blue-400 hover:bg-blue-500/10 transition-colors flex items-center gap-1"
            >
              <CheckCheck className="h-3 w-3" />
              Mark read
            </button>
          )}
          <button type="button"
            onClick={onSearchToggle}
            className={cn(
              "p-1.5 rounded-full transition-colors",
              searchOpen
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          <button type="button"
            onClick={() => onFilterChange("all")}
            className={cn(
              "px-3 py-1 text-[12px] font-medium rounded-full transition-colors",
              filter === "all"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
          >
            All
          </button>
          <button type="button"
            onClick={() => onFilterChange("decisions")}
            className={cn(
              "px-3 py-1 text-[12px] font-medium rounded-full transition-colors",
              filter === "decisions"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
          >
            Decisions &amp; Escalations
          </button>
          <button type="button"
            onClick={() => onFilterChange("analytics")}
            className={cn(
              "px-3 py-1 text-[12px] font-medium rounded-full transition-colors flex items-center gap-1",
              filter === "analytics"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
          >
            <BarChart2 className="h-3 w-3" />
            Analytics
          </button>
        </div>
      </div>

      {/* Message search bar */}
      {searchOpen && (
        <div className="px-4 py-2 border-b border-border bg-muted/10 flex items-center gap-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            placeholder="Search messages..."
            className="h-7 text-xs border-0 bg-transparent shadow-none focus-visible:ring-0"
            autoFocus
          />
          {searchTerm && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              {filteredCount} result{filteredCount !== 1 ? "s" : ""}
            </span>
          )}
          <button type="button"
            onClick={() => {
              onSearchToggle();
              onSearchTermChange("");
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
