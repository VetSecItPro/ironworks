import { Search } from "lucide-react";
import { type FileTreeNode, PackageFileTree } from "../PackageFileTree";

export function ExportSidebar({
  displayTree,
  selectedFile,
  expandedDirs,
  checkedFiles,
  treeSearch,
  onSearchChange,
  onToggleDir,
  onSelectFile,
  onToggleCheck,
  totalTaskChildren,
  visibleTaskChildren,
  onShowMoreTasks,
}: {
  displayTree: FileTreeNode[];
  selectedFile: string | null;
  expandedDirs: Set<string>;
  checkedFiles: Set<string>;
  treeSearch: string;
  onSearchChange: (query: string) => void;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string | null, replace?: boolean) => void;
  onToggleCheck: (path: string, kind: "file" | "dir") => void;
  totalTaskChildren: number;
  visibleTaskChildren: number;
  onShowMoreTasks: () => void;
}) {
  return (
    <aside className="flex flex-col border-r border-border overflow-hidden">
      <div className="border-b border-border px-4 py-3 shrink-0">
        <h2 className="text-base font-semibold">Package files</h2>
      </div>
      <div className="border-b border-border px-3 py-2 shrink-0">
        <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={treeSearch}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search files..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <PackageFileTree
          nodes={displayTree}
          selectedFile={selectedFile}
          expandedDirs={expandedDirs}
          checkedFiles={checkedFiles}
          onToggleDir={onToggleDir}
          onSelectFile={onSelectFile}
          onToggleCheck={onToggleCheck}
        />
        {totalTaskChildren > visibleTaskChildren && !treeSearch && (
          <div className="px-4 py-2">
            <button
              type="button"
              onClick={onShowMoreTasks}
              className="w-full rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/30 hover:text-foreground transition-colors"
            >
              Show more issues ({visibleTaskChildren} of {totalTaskChildren})
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
