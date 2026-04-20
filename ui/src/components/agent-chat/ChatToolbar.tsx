import { ChevronRight, FileText, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CHAT_TEMPLATES } from "./chat-helpers";

interface ChatToolbarProps {
  showSearch: boolean;
  setShowSearch: (v: boolean) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  filteredCount: number;
  showTemplates: boolean;
  setShowTemplates: (v: boolean) => void;
  onTemplateSelect: (prompt: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

export function ChatToolbar({
  showSearch,
  setShowSearch,
  searchQuery,
  setSearchQuery,
  filteredCount,
  showTemplates,
  setShowTemplates,
  onTemplateSelect,
  searchInputRef,
}: ChatToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
      {showSearch ? (
        <div className="flex items-center gap-2 flex-1">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <span className="text-xs text-muted-foreground shrink-0">
              {filteredCount} {filteredCount === 1 ? "result" : "results"}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setShowSearch(false);
              setSearchQuery("");
            }}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setShowSearch(true)}>
            <Search className="h-3.5 w-3.5 mr-1" />
            Search
          </Button>
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setShowTemplates(!showTemplates)}
            >
              <FileText className="h-3.5 w-3.5 mr-1" />
              Templates
            </Button>
            {showTemplates && (
              <div className="absolute top-full left-0 z-50 mt-1 w-64 rounded-lg border border-border bg-popover p-1 shadow-md">
                {CHAT_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => onTemplateSelect(tpl.prompt)}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-left hover:bg-accent transition-colors"
                  >
                    <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    {tpl.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
