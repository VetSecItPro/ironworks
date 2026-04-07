import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CompanyPortabilityCollisionStrategy,
  CompanyPortabilityFileEntry,
  CompanyPortabilityPreviewResult,
  CompanyPortabilitySource,
  CompanyPortabilityAdapterOverride,
} from "@ironworksai/shared";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { authApi } from "../api/auth";
import { companiesApi } from "../api/companies";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { getAgentOrderStorageKey, writeAgentOrder } from "../lib/agent-order";
import { getProjectOrderStorageKey, writeProjectOrder } from "../lib/project-order";
import { Button } from "@/components/ui/button";
import { EmptyState } from "../components/EmptyState";
import { cn } from "../lib/utils";
import { Download, Github, Upload } from "lucide-react";
import { Field } from "../components/agent-config-primitives";
import { getUIAdapter } from "../adapters";
import type { CreateConfigValues } from "@ironworksai/adapter-utils";
import {
  type FileTreeNode,
  buildFileTree,
  countFiles,
  collectAllPaths,
  PackageFileTree,
} from "../components/PackageFileTree";
import { readZipArchive } from "../lib/zip";

// Extracted components
import {
  buildActionMap,
  buildConflictList,
  deriveSourcePrefix,
  prefixedName,
  ensureMarkdownPath,
  type ConflictItem,
} from "../components/import/ImportHelpers";
import { ImportPreviewPane } from "../components/import/ImportPreviewPane";
import { ConflictResolutionList } from "../components/import/ConflictResolutionList";
import {
  AdapterPickerList,
  type AdapterPickerItem,
} from "../components/import/AdapterPickerList";

// ── Import file tree customization ───────────────────────────────────

import { ACTION_COLORS } from "../components/import/ImportHelpers";

function renderImportFileExtra(
  node: FileTreeNode,
  checked: boolean,
  renameMap: Map<string, string>,
) {
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
        <span
          className="text-[10px] text-cyan-500 font-mono truncate max-w-[7rem]"
          title={renamedTo}
        >
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

// ── Sidebar order helper ─────────────────────────────────────────────

function applyImportedSidebarOrder(
  preview: CompanyPortabilityPreviewResult | null,
  result: {
    company: { id: string };
    agents: Array<{ slug: string; id: string | null }>;
    projects: Array<{ slug: string; id: string | null }>;
  },
  userId: string | null | undefined,
) {
  const sidebar = preview?.manifest.sidebar;
  if (!sidebar) return;
  if (!userId?.trim()) return;

  const agentIdBySlug = new Map(
    result.agents
      .filter(
        (agent): agent is { slug: string; id: string } =>
          typeof agent.id === "string" && agent.id.length > 0,
      )
      .map((agent) => [agent.slug, agent.id]),
  );
  const projectIdBySlug = new Map(
    result.projects
      .filter(
        (project): project is { slug: string; id: string } =>
          typeof project.id === "string" && project.id.length > 0,
      )
      .map((project) => [project.slug, project.id]),
  );

  const orderedAgentIds = sidebar.agents
    .map((slug) => agentIdBySlug.get(slug))
    .filter((id): id is string => Boolean(id));
  const orderedProjectIds = sidebar.projects
    .map((slug) => projectIdBySlug.get(slug))
    .filter((id): id is string => Boolean(id));

  if (orderedAgentIds.length > 0) {
    writeAgentOrder(
      getAgentOrderStorageKey(result.company.id, userId),
      orderedAgentIds,
    );
  }
  if (orderedProjectIds.length > 0) {
    writeProjectOrder(
      getProjectOrderStorageKey(result.company.id, userId),
      orderedProjectIds,
    );
  }
}

// ── Read local zip ───────────────────────────────────────────────────

async function readLocalPackageZip(file: File): Promise<{
  name: string;
  rootPath: string | null;
  files: Record<string, CompanyPortabilityFileEntry>;
}> {
  if (!/\.zip$/i.test(file.name)) {
    throw new Error("Select a .zip company package.");
  }
  const archive = await readZipArchive(await file.arrayBuffer());
  if (Object.keys(archive.files).length === 0) {
    throw new Error("No package files were found in the selected zip archive.");
  }
  return {
    name: file.name,
    rootPath: archive.rootPath,
    files: archive.files,
  };
}

// ── Main page ─────────────────────────────────────────────────────────

export function CompanyImport() {
  const { selectedCompanyId, selectedCompany, setSelectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const packageInputRef = useRef<HTMLInputElement | null>(null);

  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });
  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;

  // Source state
  const [sourceMode, setSourceMode] = useState<"github" | "local">("github");
  const [importUrl, setImportUrl] = useState("");
  const [localPackage, setLocalPackage] = useState<{
    name: string;
    rootPath: string | null;
    files: Record<string, CompanyPortabilityFileEntry>;
  } | null>(null);

  // Target state
  const [targetMode, setTargetMode] = useState<"existing" | "new">("new");
  const [newCompanyName, setNewCompanyName] = useState("");

  // Preview state
  const [importPreview, setImportPreview] = useState<CompanyPortabilityPreviewResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [checkedFiles, setCheckedFiles] = useState<Set<string>>(new Set());

  // Conflict resolution state
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({});
  const [skippedSlugs, setSkippedSlugs] = useState<Set<string>>(new Set());
  const [confirmedSlugs, setConfirmedSlugs] = useState<Set<string>>(new Set());
  const [collisionStrategy, setCollisionStrategy] = useState<CompanyPortabilityCollisionStrategy>("rename");

  // Adapter override state
  const [adapterOverrides, setAdapterOverrides] = useState<Record<string, string>>({});
  const [adapterExpandedSlugs, setAdapterExpandedSlugs] = useState<Set<string>>(new Set());
  const [adapterConfigValues, setAdapterConfigValues] = useState<Record<string, CreateConfigValues>>({});

  const { data: companyAgents } = useQuery({
    queryKey: selectedCompanyId ? queryKeys.agents.list(selectedCompanyId) : ["agents", "none"],
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const ceoAdapterType = useMemo(() => {
    if (!companyAgents) return "claude_local";
    const ceo = companyAgents.find((a) => a.role === "ceo");
    return ceo?.adapterType ?? "claude_local";
  }, [companyAgents]);

  const localZipHelpText =
    "Upload a .zip exported directly from Ironworks. Re-zipped archives created by Finder, Explorer, or other zip tools may not import correctly.";

  useEffect(() => {
    setBreadcrumbs([
      { label: "Org Chart", href: "/org" },
      { label: "Import" },
    ]);
  }, [setBreadcrumbs]);

  function buildSource(): CompanyPortabilitySource | null {
    if (sourceMode === "local") {
      if (!localPackage) return null;
      return { type: "inline", rootPath: localPackage.rootPath, files: localPackage.files };
    }
    const url = importUrl.trim();
    if (!url) return null;
    return { type: "github", url };
  }

  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: () => {
      const source = buildSource();
      if (!source) throw new Error("No source configured.");
      return companiesApi.importPreview({
        source,
        include: { company: true, agents: true, projects: true, issues: true },
        target:
          targetMode === "new"
            ? { mode: "new_company", newCompanyName: newCompanyName || null }
            : { mode: "existing_company", companyId: selectedCompanyId! },
        collisionStrategy,
      });
    },
    onSuccess: (result) => {
      setImportPreview(result);
      const conflicts = buildConflictList(result);
      const prefix = deriveSourcePrefix(
        sourceMode,
        importUrl,
        localPackage?.name ?? null,
        localPackage?.rootPath ?? null,
      );
      const defaultOverrides: Record<string, string> = {};
      for (const c of conflicts) {
        if (c.action === "rename" && prefix) {
          defaultOverrides[c.slug] = prefixedName(prefix, c.originalName);
        }
      }
      setNameOverrides(defaultOverrides);
      setSkippedSlugs(new Set());
      setConfirmedSlugs(new Set());

      const defaultAdapters: Record<string, string> = {};
      for (const agent of result.manifest.agents) {
        defaultAdapters[agent.slug] = ceoAdapterType;
      }
      setAdapterOverrides(defaultAdapters);
      setAdapterExpandedSlugs(new Set());
      setAdapterConfigValues({});

      const allFiles = new Set(Object.keys(result.files));
      if (
        targetMode === "existing" &&
        result.manifest.company &&
        result.plan.companyAction === "update"
      ) {
        const companyPath = ensureMarkdownPath(result.manifest.company.path);
        allFiles.delete(companyPath);
      }
      setCheckedFiles(allFiles);

      const am = buildActionMap(result);
      const tree = buildFileTree(result.files, am);
      const dirsToExpand = new Set<string>();
      for (const node of tree) {
        if (node.kind === "dir") dirsToExpand.add(node.path);
      }
      for (const [filePath, action] of am) {
        if (action === "update") {
          const segments = filePath.split("/").filter(Boolean);
          let current = "";
          for (let i = 0; i < segments.length - 1; i++) {
            current = current ? `${current}/${segments[i]}` : segments[i];
            dirsToExpand.add(current);
          }
        }
      }
      setExpandedDirs(dirsToExpand);
      const firstFile = Object.keys(result.files)[0];
      if (firstFile) setSelectedFile(firstFile);
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Preview failed",
        body: err instanceof Error ? err.message : "Failed to preview import.",
      });
    },
  });

  function buildFinalNameOverrides(): Record<string, string> | undefined {
    if (!importPreview) return undefined;
    const overrides: Record<string, string> = {};
    for (const [slug, name] of Object.entries(nameOverrides)) {
      if (name.trim()) overrides[slug] = name.trim();
    }
    return Object.keys(overrides).length > 0 ? overrides : undefined;
  }

  function buildSelectedFiles(): string[] | undefined {
    const selected = Array.from(checkedFiles).sort();
    return selected.length > 0 ? selected : undefined;
  }

  function buildFinalAdapterOverrides(): Record<string, CompanyPortabilityAdapterOverride> | undefined {
    if (adapterAgents.length === 0) return undefined;
    const overrides: Record<string, CompanyPortabilityAdapterOverride> = {};
    for (const agent of adapterAgents) {
      const selectedType = adapterOverrides[agent.slug] ?? agent.adapterType;
      const configVals = adapterConfigValues[agent.slug];
      const override: CompanyPortabilityAdapterOverride = { adapterType: selectedType };
      if (configVals) {
        const uiAdapter = getUIAdapter(selectedType);
        override.adapterConfig = uiAdapter.buildAdapterConfig(configVals);
      }
      overrides[agent.slug] = override;
    }
    return Object.keys(overrides).length > 0 ? overrides : undefined;
  }

  const importMutation = useMutation({
    mutationFn: () => {
      const source = buildSource();
      if (!source) throw new Error("No source configured.");
      return companiesApi.importBundle({
        source,
        include: { company: true, agents: true, projects: true, issues: true },
        target:
          targetMode === "new"
            ? { mode: "new_company", newCompanyName: newCompanyName || null }
            : { mode: "existing_company", companyId: selectedCompanyId! },
        collisionStrategy,
        nameOverrides: buildFinalNameOverrides(),
        selectedFiles: buildSelectedFiles(),
        adapterOverrides: buildFinalAdapterOverrides(),
      });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      const importedCompany = await companiesApi.get(result.company.id);
      const refreshedSession = currentUserId
        ? null
        : await queryClient.fetchQuery({
            queryKey: queryKeys.auth.session,
            queryFn: () => authApi.getSession(),
          });
      const sidebarOrderUserId =
        currentUserId ??
        refreshedSession?.user?.id ??
        refreshedSession?.session?.userId ??
        null;
      applyImportedSidebarOrder(importPreview, result, sidebarOrderUserId);
      setSelectedCompanyId(importedCompany.id);
      pushToast({
        tone: "success",
        title: "Import complete",
        body: `${result.company.name}: ${result.agents.length} agent${result.agents.length === 1 ? "" : "s"} processed.`,
      });
      window.location.assign(`/${importedCompany.issuePrefix}/dashboard`);
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Import failed",
        body: err instanceof Error ? err.message : "Failed to apply import.",
      });
    },
  });

  async function handleChooseLocalPackage(e: ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    try {
      const pkg = await readLocalPackageZip(fileList[0]!);
      setLocalPackage(pkg);
      setImportPreview(null);
    } catch (err) {
      pushToast({
        tone: "error",
        title: "Package read failed",
        body: err instanceof Error ? err.message : "Failed to read folder.",
      });
    }
  }

  const actionMap = useMemo(
    () => (importPreview ? buildActionMap(importPreview) : new Map<string, string>()),
    [importPreview],
  );

  const tree = useMemo(
    () => (importPreview ? buildFileTree(importPreview.files, actionMap) : []),
    [importPreview, actionMap],
  );

  const conflicts = useMemo(
    () => (importPreview ? buildConflictList(importPreview) : []),
    [importPreview],
  );

  const renameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!importPreview) return map;
    for (const c of conflicts) {
      if (!c.filePath) continue;
      const isSkipped = skippedSlugs.has(c.slug);
      if (isSkipped) continue;
      const renamedTo = nameOverrides[c.slug] ?? c.plannedName;
      if (renamedTo === c.originalName) continue;
      const parentDir = c.filePath.split("/").slice(0, -1).join("/");
      if (parentDir) map.set(parentDir, renamedTo);
      map.set(c.filePath, renamedTo);
    }
    return map;
  }, [importPreview, conflicts, nameOverrides, skippedSlugs]);

  const totalFiles = useMemo(() => countFiles(tree), [tree]);
  const selectedCount = checkedFiles.size;

  function handleToggleDir(path: string) {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function handleToggleCheck(path: string, kind: "file" | "dir") {
    if (!importPreview) return;
    setCheckedFiles((prev) => {
      const next = new Set(prev);
      if (kind === "file") {
        if (next.has(path)) next.delete(path);
        else next.add(path);
      } else {
        const findNode = (nodes: FileTreeNode[], target: string): FileTreeNode | null => {
          for (const n of nodes) {
            if (n.path === target) return n;
            const found = findNode(n.children, target);
            if (found) return found;
          }
          return null;
        };
        const dirNode = findNode(tree, path);
        if (dirNode) {
          const childFiles = collectAllPaths(dirNode.children, "file");
          for (const child of dirNode.children) {
            if (child.kind === "file") childFiles.add(child.path);
          }
          const allChecked = [...childFiles].every((p) => next.has(p));
          for (const f of childFiles) {
            if (allChecked) next.delete(f);
            else next.add(f);
          }
        }
      }
      return next;
    });
  }

  function handleConflictRename(slug: string, newName: string) {
    setNameOverrides((prev) => ({ ...prev, [slug]: newName }));
    setConfirmedSlugs((prev) => {
      if (!prev.has(slug)) return prev;
      const next = new Set(prev);
      next.delete(slug);
      return next;
    });
  }

  function handleConflictToggleConfirm(slug: string) {
    setConfirmedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function handleConflictToggleSkip(slug: string, filePath: string | null) {
    setSkippedSlugs((prev) => {
      const next = new Set(prev);
      const wasSkipped = next.has(slug);
      if (wasSkipped) next.delete(slug);
      else next.add(slug);
      if (filePath) {
        setCheckedFiles((prevChecked) => {
          const nextChecked = new Set(prevChecked);
          if (wasSkipped) nextChecked.add(filePath);
          else nextChecked.delete(filePath);
          return nextChecked;
        });
      }
      return next;
    });
  }

  function handleAdapterChange(slug: string, adapterType: string) {
    setAdapterOverrides((prev) => ({ ...prev, [slug]: adapterType }));
    setAdapterConfigValues((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
  }

  function handleAdapterToggleExpand(slug: string) {
    setAdapterExpandedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function handleAdapterConfigChange(slug: string, patch: Partial<CreateConfigValues>) {
    setAdapterConfigValues((prev) => ({
      ...prev,
      [slug]: {
        ...(prev[slug] ?? { adapterType: adapterOverrides[slug] ?? "claude_local" }),
        ...patch,
      },
    }));
  }

  const adapterAgents = useMemo<AdapterPickerItem[]>(() => {
    if (!importPreview) return [];
    return importPreview.manifest.agents.map((a) => ({
      slug: a.slug,
      name: a.name,
      adapterType: a.adapterType,
    }));
  }, [importPreview]);

  const hasSource = sourceMode === "local" ? !!localPackage : importUrl.trim().length > 0;
  const hasErrors = importPreview ? importPreview.errors.length > 0 : false;

  const previewContent =
    selectedFile && importPreview ? importPreview.files[selectedFile] ?? null : null;
  const selectedAction = selectedFile ? (actionMap.get(selectedFile) ?? null) : null;

  if (!selectedCompanyId) {
    return <EmptyState icon={Download} message="Select a company to import into." />;
  }

  return (
    <div>
      {/* Source form section */}
      <div className="border-b border-border px-5 py-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold">Import source</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Choose a GitHub repo or upload a local Ironworks zip package.
          </p>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          {(
            [
              { key: "github", icon: Github, label: "GitHub repo" },
              { key: "local", icon: Upload, label: "Local zip" },
            ] as const
          ).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              type="button"
              className={cn(
                "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                sourceMode === key ? "border-foreground bg-accent" : "border-border hover:bg-accent/50",
              )}
              onClick={() => { setSourceMode(key); setImportPreview(null); }}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {label}
              </div>
            </button>
          ))}
        </div>

        {sourceMode === "local" ? (
          <div className="rounded-md border border-dashed border-border px-3 py-3">
            <input
              ref={packageInputRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={handleChooseLocalPackage}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => packageInputRef.current?.click()}>
                Choose zip
              </Button>
              {localPackage && (
                <span className="text-xs text-muted-foreground">
                  {localPackage.name} with {Object.keys(localPackage.files).length} file
                  {Object.keys(localPackage.files).length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {!localPackage && (
              <p className="mt-2 text-xs text-muted-foreground">{localZipHelpText}</p>
            )}
          </div>
        ) : (
          <Field
            label="GitHub URL"
            hint="Repo tree path or blob URL to COMPANY.md (e.g. github.com/owner/repo/tree/main/company)."
          >
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
              type="text"
              value={importUrl}
              placeholder="https://github.com/owner/repo/tree/main/company"
              onChange={(e) => { setImportUrl(e.target.value); setImportPreview(null); }}
            />
          </Field>
        )}

        <Field label="Target" hint="Import into this company or create a new one.">
          <select
            className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
            value={targetMode}
            onChange={(e) => { setTargetMode(e.target.value as "existing" | "new"); setImportPreview(null); }}
          >
            <option value="new">Create new company</option>
            <option value="existing">Existing company: {selectedCompany?.name}</option>
          </select>
        </Field>

        {targetMode === "new" && (
          <Field label="New company name" hint="Optional override. Leave blank to use the package name.">
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
              type="text"
              value={newCompanyName}
              onChange={(e) => setNewCompanyName(e.target.value)}
              placeholder="Imported Company"
            />
          </Field>
        )}

        <Field
          label="Collision strategy"
          hint="Board imports can rename, skip, or replace matching company content."
        >
          <select
            className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
            value={collisionStrategy}
            onChange={(e) => {
              setCollisionStrategy(e.target.value as CompanyPortabilityCollisionStrategy);
              setImportPreview(null);
            }}
          >
            <option value="rename">Rename on conflict</option>
            <option value="skip">Skip on conflict</option>
            <option value="replace">Replace existing</option>
          </select>
        </Field>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => previewMutation.mutate()}
            disabled={previewMutation.isPending || !hasSource}
          >
            {previewMutation.isPending ? "Previewing..." : "Preview import"}
          </Button>
        </div>
      </div>

      {/* Preview results */}
      {importPreview && (
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
            onRename={handleConflictRename}
            onToggleSkip={handleConflictToggleSkip}
            onToggleConfirm={handleConflictToggleConfirm}
          />

          <AdapterPickerList
            agents={adapterAgents}
            adapterOverrides={adapterOverrides}
            expandedSlugs={adapterExpandedSlugs}
            configValues={adapterConfigValues}
            onChangeAdapter={handleAdapterChange}
            onToggleExpand={handleAdapterToggleExpand}
            onChangeConfig={handleAdapterConfigChange}
          />

          <div className="mx-5 mt-3 flex justify-end">
            <Button
              size="sm"
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending || hasErrors || selectedCount === 0}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {importMutation.isPending
                ? "Importing..."
                : `Import ${selectedCount} file${selectedCount === 1 ? "" : "s"}`}
            </Button>
          </div>

          {importPreview.warnings.length > 0 && (
            <div className="mx-5 mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3">
              {importPreview.warnings.map((w) => (
                <div key={w} className="text-xs text-amber-500">{w}</div>
              ))}
            </div>
          )}

          {importPreview.errors.length > 0 && (
            <div className="mx-5 mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
              {importPreview.errors.map((e) => (
                <div key={e} className="text-xs text-destructive">{e}</div>
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
                  onToggleDir={handleToggleDir}
                  onSelectFile={setSelectedFile}
                  onToggleCheck={handleToggleCheck}
                  renderFileExtra={(node, checked) =>
                    renderImportFileExtra(node, checked, renameMap)
                  }
                  fileRowClassName={importFileRowClassName}
                />
              </div>
            </aside>
            <div className="min-w-0 overflow-y-auto pl-6">
              <ImportPreviewPane
                selectedFile={selectedFile}
                content={previewContent}
                allFiles={importPreview?.files ?? {}}
                action={selectedAction}
                renamedTo={selectedFile ? (renameMap.get(selectedFile) ?? null) : null}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
