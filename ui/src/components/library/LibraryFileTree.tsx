import { ChevronDown, ChevronRight, EyeOff, Folder, FolderOpen, Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LibraryEntry } from "../../api/library";
import { cn } from "../../lib/utils";
import { fileIcon } from "./libraryHelpers";

interface TreeNodeProps {
  entry: LibraryEntry;
  depth: number;
  selectedPath: string | null;
  expandedDirs: Set<string>;
  onToggleDir: (dirPath: string) => void;
  onSelectFile: (filePath: string) => void;
  childEntries: Map<string, LibraryEntry[]>;
}

export function TreeNode({
  entry,
  depth,
  selectedPath,
  expandedDirs,
  onToggleDir,
  onSelectFile,
  childEntries,
}: TreeNodeProps) {
  const isDir = entry.kind === "directory";
  const isExpanded = expandedDirs.has(entry.path);
  const isSelected = selectedPath === entry.path;
  const Icon = isDir ? (isExpanded ? FolderOpen : Folder) : fileIcon(entry.name);
  const children = childEntries.get(entry.path) ?? [];

  return (
    <div>
      <button type="button"
        onClick={() => (isDir ? onToggleDir(entry.path) : onSelectFile(entry.path))}
        className={cn(
          "flex items-center gap-1.5 w-full text-left px-2 py-1.5 text-[13px] hover:bg-accent/50 transition-colors group",
          isSelected && "bg-accent text-accent-foreground font-medium",
        )}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {isDir ? (
          isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <Icon className={cn("h-4 w-4 shrink-0", isDir ? "text-blue-500" : "text-muted-foreground")} />
        <span className="truncate flex-1">{entry.name}</span>
        {entry.meta?.visibility && entry.meta.visibility !== "company" && (
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <span className="shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                {entry.meta.visibility === "private" ? (
                  <Lock className="h-3 w-3 text-amber-500" />
                ) : (
                  <EyeOff className="h-3 w-3 text-blue-400" />
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {entry.meta.visibility}
            </TooltipContent>
          </Tooltip>
        )}
      </button>

      {isDir && isExpanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              expandedDirs={expandedDirs}
              onToggleDir={onToggleDir}
              onSelectFile={onSelectFile}
              childEntries={childEntries}
            />
          ))}
        </div>
      )}
    </div>
  );
}
