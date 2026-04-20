import { Folder } from "lucide-react";
import { fileIcon } from "../library/libraryHelpers";

interface SearchResult {
  path: string;
  name: string;
  kind: string;
  matchContext?: string;
}

interface LibrarySearchResultsProps {
  results: SearchResult[];
  onSelectFile: (path: string) => void;
  onClearSearch: () => void;
}

export function LibrarySearchResults({ results, onSelectFile, onClearSearch }: LibrarySearchResultsProps) {
  return (
    <div className="py-1">
      <div className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        {results.length} result{results.length !== 1 ? "s" : ""}
      </div>
      {results.map((entry) => {
        const Icon = entry.kind === "directory" ? Folder : fileIcon(entry.name);
        return (
          <button
            type="button"
            key={entry.path}
            onClick={() => {
              if (entry.kind === "file") {
                onSelectFile(entry.path);
                onClearSearch();
              }
            }}
            className="flex items-center gap-1.5 w-full text-left px-3 py-1.5 text-[13px] hover:bg-accent/50 transition-colors"
          >
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate">{entry.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">{entry.path}</div>
              {entry.matchContext && (
                <div className="text-[11px] text-muted-foreground/70 truncate mt-0.5 italic">{entry.matchContext}</div>
              )}
            </div>
          </button>
        );
      })}
      {results.length === 0 && (
        <div className="px-3 py-4 text-sm text-muted-foreground text-center">No files found</div>
      )}
    </div>
  );
}
