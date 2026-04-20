import { ChevronRight as ChevronRightIcon, FileText, Folder } from "lucide-react";
import { useMemo, useState } from "react";
import type { KnowledgePage } from "../../api/knowledge";
import { timeAgo } from "../../lib/timeAgo";
import { cn } from "../../lib/utils";

/* ── Folder tree data ── */

interface FolderNode {
  name: string;
  pages: KnowledgePage[];
  children: Map<string, FolderNode>;
}

function buildFolderTree(pages: KnowledgePage[]): { rootPages: KnowledgePage[]; folders: Map<string, FolderNode> } {
  const folders = new Map<string, FolderNode>();
  const rootPages: KnowledgePage[] = [];

  for (const page of pages) {
    const slug = page.slug ?? "";
    const slashIdx = slug.indexOf("/");
    if (slashIdx > 0) {
      const folderName = slug.substring(0, slashIdx);
      if (!folders.has(folderName)) {
        folders.set(folderName, { name: folderName, pages: [], children: new Map() });
      }
      folders.get(folderName)!.pages.push(page);
    } else {
      rootPages.push(page);
    }
  }

  return { rootPages, folders };
}

/* ── Page row ── */

function KBPageRow({
  page,
  selected,
  checked,
  selectMode,
  onSelect,
  onToggleCheck,
  indent,
}: {
  page: KnowledgePage;
  selected: boolean;
  checked?: boolean;
  selectMode?: boolean;
  onSelect: (id: string) => void;
  onToggleCheck?: (id: string) => void;
  indent?: boolean;
}) {
  return (
    <button type="button"
      className={cn(
        "w-full text-left px-3 py-2 transition-colors flex items-start gap-2",
        indent && "pl-6",
        selected ? "bg-accent" : "hover:bg-accent/50",
        checked && "bg-red-500/5",
      )}
      onClick={() => (selectMode ? onToggleCheck?.(page.id) : onSelect(page.id))}
    >
      {selectMode ? (
        <input
          type="checkbox"
          checked={checked}
          readOnly
          className="h-3 w-3 mt-1 rounded border-border accent-foreground shrink-0"
        />
      ) : (
        <FileText className="h-3.5 w-3.5 text-muted-foreground/70 mt-0.5 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{page.title}</div>
        <span className="text-[10px] text-muted-foreground">{timeAgo(page.updatedAt)}</span>
      </div>
    </button>
  );
}

/* ── Folder tree component ── */

export function KBFolderTree({
  pages,
  selectedPageId,
  onSelectPage,
  onBulkDelete,
}: {
  pages: KnowledgePage[];
  selectedPageId: string | null;
  onSelectPage: (id: string) => void;
  onBulkDelete?: (ids: string[]) => Promise<void>;
}) {
  const { rootPages, folders } = useMemo(() => buildFolderTree(pages), [pages]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    const expanded = new Set<string>();
    if (selectedPageId) {
      for (const [name, folder] of folders) {
        if (folder.pages.some((p) => p.id === selectedPageId)) expanded.add(name);
      }
    }
    return expanded;
  });
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  const toggleFolder = (name: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFolderAll = (folderPages: KnowledgePage[]) => {
    const ids = folderPages.map((p) => p.id);
    const allChecked = ids.every((id) => checkedIds.has(id));
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        // biome-ignore lint/suspicious/useIterableCallbackReturn: forEach side-effect, no return needed
        ids.forEach((id) => next.delete(id));
      } else {
        // biome-ignore lint/suspicious/useIterableCallbackReturn: forEach side-effect, no return needed
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const ACRONYM_FOLDERS: Record<string, string> = { hr: "HR", sla: "SLA", api: "API", it: "IT", qa: "QA" };
  const folderLabel = (name: string) =>
    ACRONYM_FOLDERS[name.toLowerCase()] ?? name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, " ");

  return (
    <div className="flex flex-col h-full">
      {/* Select mode toggle + bulk actions */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-border/50">
        <button type="button"
          className={cn(
            "text-[10px] transition-colors",
            selectMode ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => {
            setSelectMode((v) => !v);
            if (selectMode) setCheckedIds(new Set());
          }}
        >
          {selectMode ? `${checkedIds.size} selected` : "Select"}
        </button>
        {selectMode && checkedIds.size > 0 && (
          <button type="button"
            className="text-[10px] text-red-400 hover:text-red-300 font-medium transition-colors"
            onClick={async () => {
              if (
                confirm(`Delete ${checkedIds.size} page${checkedIds.size !== 1 ? "s" : ""}? This cannot be undone.`)
              ) {
                await onBulkDelete?.([...checkedIds]);
                setCheckedIds(new Set());
                setSelectMode(false);
              }
            }}
          >
            Delete ({checkedIds.size})
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-0.5 py-1">
        {[...folders.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, folder]) => {
            const isExpanded = expandedFolders.has(name);
            const folderCheckedCount = folder.pages.filter((p) => checkedIds.has(p.id)).length;
            return (
              <div key={name}>
                <button type="button"
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-accent/50 transition-colors"
                  onClick={() => (selectMode ? toggleFolderAll(folder.pages) : toggleFolder(name))}
                >
                  {selectMode && (
                    <input
                      type="checkbox"
                      checked={folderCheckedCount === folder.pages.length}
                      readOnly
                      className="h-3 w-3 rounded border-border accent-foreground shrink-0"
                    />
                  )}
                  {!selectMode && (
                    <ChevronRightIcon
                      className={cn(
                        "h-3 w-3 text-muted-foreground/80 transition-transform shrink-0",
                        isExpanded && "rotate-90",
                      )}
                    />
                  )}
                  <Folder className="h-3.5 w-3.5 text-amber-500/70 shrink-0" />
                  <span className="text-xs font-medium text-muted-foreground truncate">{folderLabel(name)}</span>
                  <span className="text-[10px] text-muted-foreground/70 ml-auto shrink-0">{folder.pages.length}</span>
                </button>
                {(isExpanded || selectMode) && (
                  <div className="ml-3">
                    {folder.pages.map((page) => (
                      <KBPageRow
                        key={page.id}
                        page={page}
                        selected={selectedPageId === page.id}
                        checked={checkedIds.has(page.id)}
                        selectMode={selectMode}
                        onSelect={onSelectPage}
                        onToggleCheck={toggleCheck}
                        indent
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        {rootPages.map((page) => (
          <KBPageRow
            key={page.id}
            page={page}
            selected={selectedPageId === page.id}
            checked={checkedIds.has(page.id)}
            selectMode={selectMode}
            onSelect={onSelectPage}
            onToggleCheck={toggleCheck}
          />
        ))}
      </div>
    </div>
  );
}
