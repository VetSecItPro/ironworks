import type { CreateConfigValues } from "@ironworksai/adapter-utils";
import type { CompanyPortabilityPreviewResult } from "@ironworksai/shared";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type AdapterPickerItem, AdapterPickerList } from "../../components/import/AdapterPickerList";
import { ConflictResolutionList } from "../../components/import/ConflictResolutionList";
import { ACTION_COLORS, type ConflictItem } from "../../components/import/ImportHelpers";
import { ImportPreviewPane } from "../../components/import/ImportPreviewPane";
import { type FileTreeNode, PackageFileTree } from "../../components/PackageFileTree";
import { cn } from "../../lib/utils";

// ── Import file tree customization ───────────────────────────────────

function renderImportFileExtra(node: FileTreeNode, checked: boolean, renameMap: Map<string, string>) {
  const renamedTo = node.kind === "dir" ? renameMap.get(node.path) : undefined;
  const actionBadge = node.action ? (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide",
        ACTION_COLORS[node.action] ?? ACTION_COLORS.skip,
      )}
    >
      {checked ? node.action : "skip"}
    </span>
  ) : null;

  if (!actionBadge && !renamedTo) return null;

  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      {renamedTo && checked && (
        <span className="text-[10px] text-cyan-500 font-mono truncate max-w-[7rem]" title={renamedTo}>
          &rarr; {renamedTo}
        </span>
      )}
      {actionBadge}
    </span>
  );
}

function importFileRowClassName(_node: FileTreeNode, checked: boolean) {
  return !checked ? "opacity-50" : undefined;
}

// ── Props ────────────────────────────────────────────────────────────

interface ImportPreviewResultsProps {
  importPreview: CompanyPortabilityPreviewResult;
  tree: FileTreeNode[];
  conflicts: ConflictItem[];
  renameMap: Map<string, string>;
  actionMap: Map<string, string>;
  totalFiles: number;
  selectedCount: number;
  selectedFile: string | null;
  expandedDirs: Set<string>;
  checkedFiles: Set<string>;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
  onToggleCheck: (path: string, kind: "file" | "dir") => void;
  // Conflict resolution
  nameOverrides: Record<string, string>;
  skippedSlugs: Set<string>;
  confirmedSlugs: Set<string>;
  onConflictRename: (slug: string, newName: string) => void;
  onConflictToggleSkip: (slug: string, filePath: string | null) => void;
  onConflictToggleConfirm: (slug: string) => void;
  // Adapter overrides
  adapterAgents: AdapterPickerItem[];
  adapterOverrides: Record<string, string>;
  adapterExpandedSlugs: Set<string>;
  adapterConfigValues: Record<string, CreateConfigValues>;
  onAdapterChange: (slug: string, adapterType: string) => void;
  onAdapterToggleExpand: (slug: string) => void;
  onAdapterConfigChange: (slug: string, patch: Partial<CreateConfigValues>) => void;
  // Import action
  onImport: () => void;
  importPending: boolean;
  hasErrors: boolean;
}

export function ImportPreviewResults({
  importPreview,
  tree,
  conflicts,
  renameMap,
  actionMap,
  totalFiles,
  selectedCount,
  selectedFile,
  expandedDirs,
  checkedFiles,
  onToggleDir,
  onSelectFile,
  onToggleCheck,
  nameOverrides,
  skippedSlugs,
  confirmedSlugs,
  onConflictRename,
  onConflictToggleSkip,
  onConflictToggleConfirm,
  adapterAgents,
  adapterOverrides,
  adapterExpandedSlugs,
  adapterConfigValues,
  onAdapterChange,
  onAdapterToggleExpand,
  onAdapterConfigChange,
  onImport,
  importPending,
  hasErrors,
}: ImportPreviewResultsProps) {
  const previewContent = selectedFile ? (importPreview.files[selectedFile] ?? null) : null;
  const selectedAction = selectedFile ? (actionMap.get(selectedFile) ?? null) : null;

  return (
    <>
      {/* Sticky import action bar */}
      <div className="sticky top-0 z-10 border-b border-border bg-background px-5 py-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="font-medium">Import preview</span>
          <span className="text-muted-foreground">
            {selectedCount} / {totalFiles} file{totalFiles === 1 ? "" : "s"} selected
          </span>
          {conflicts.length > 0 && (
            <span className="text-amber-500">
              {conflicts.length} conflict{conflicts.length === 1 ? "" : "s"}
            </span>
          )}
          {importPreview.errors.length > 0 && (
            <span className="text-destructive">
              {importPreview.errors.length} error{importPreview.errors.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      <ConflictResolutionList
        conflicts={conflicts}
        nameOverrides={nameOverrides}
        skippedSlugs={skippedSlugs}
        confirmedSlugs={confirmedSlugs}
        onRename={onConflictRename}
        onToggleSkip={onConflictToggleSkip}
        onToggleConfirm={onConflictToggleConfirm}
      />

      <AdapterPickerList
        agents={adapterAgents}
        adapterOverrides={adapterOverrides}
        expandedSlugs={adapterExpandedSlugs}
        configValues={adapterConfigValues}
        onChangeAdapter={onAdapterChange}
        onToggleExpand={onAdapterToggleExpand}
        onChangeConfig={onAdapterConfigChange}
      />

      <div className="mx-5 mt-3 flex justify-end">
        <Button size="sm" onClick={onImport} disabled={importPending || hasErrors || selectedCount === 0}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          {importPending ? "Importing..." : `Import ${selectedCount} file${selectedCount === 1 ? "" : "s"}`}
        </Button>
      </div>

      {importPreview.warnings.length > 0 && (
        <div className="mx-5 mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          {importPreview.warnings.map((w) => (
            <div key={w} className="text-xs text-amber-500">
              {w}
            </div>
          ))}
        </div>
      )}

      {importPreview.errors.length > 0 && (
        <div className="mx-5 mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
          {importPreview.errors.map((e) => (
            <div key={e} className="text-xs text-destructive">
              {e}
            </div>
          ))}
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid h-[calc(100vh-16rem)] gap-0 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="flex flex-col border-r border-border overflow-hidden">
          <div className="border-b border-border px-4 py-3 shrink-0">
            <h2 className="text-base font-semibold">Package files</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            <PackageFileTree
              nodes={tree}
              selectedFile={selectedFile}
              expandedDirs={expandedDirs}
              checkedFiles={checkedFiles}
              onToggleDir={onToggleDir}
              onSelectFile={onSelectFile}
              onToggleCheck={onToggleCheck}
              renderFileExtra={(node, checked) => renderImportFileExtra(node, checked, renameMap)}
              fileRowClassName={importFileRowClassName}
            />
          </div>
        </aside>
        <div className="min-w-0 overflow-y-auto pl-6">
          <ImportPreviewPane
            selectedFile={selectedFile}
            content={previewContent}
            allFiles={importPreview.files}
            action={selectedAction}
            renamedTo={selectedFile ? (renameMap.get(selectedFile) ?? null) : null}
          />
        </div>
      </div>
    </>
  );
}
