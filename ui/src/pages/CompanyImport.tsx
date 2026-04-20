import type { CreateConfigValues } from "@ironworksai/adapter-utils";
import type {
  CompanyPortabilityAdapterOverride,
  CompanyPortabilityCollisionStrategy,
  CompanyPortabilityFileEntry,
  CompanyPortabilityPreviewResult,
  CompanyPortabilitySource,
} from "@ironworksai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { getUIAdapter } from "../adapters";
import { agentsApi } from "../api/agents";
import { authApi } from "../api/auth";
import { companiesApi } from "../api/companies";
import { ImportPreviewResults } from "../components/company-import/ImportPreviewResults";
import { ImportSourceForm } from "../components/company-import/ImportSourceForm";
import { applyImportedSidebarOrder, readLocalPackageZip } from "../components/company-import/import-helpers";
import { EmptyState } from "../components/EmptyState";
import type { AdapterPickerItem } from "../components/import/AdapterPickerList";
import {
  buildActionMap,
  buildConflictList,
  deriveSourcePrefix,
  ensureMarkdownPath,
  prefixedName,
} from "../components/import/ImportHelpers";
import { buildFileTree, collectAllPaths, countFiles, type FileTreeNode } from "../components/PackageFileTree";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";

// ── Main page ─────────────────────────────────────────────────────────

export function CompanyImport() {
  const { selectedCompanyId, selectedCompany, setSelectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

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

  useEffect(() => {
    setBreadcrumbs([{ label: "Org Chart", href: "/org" }, { label: "Import" }]);
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
      if (targetMode === "existing" && result.manifest.company && result.plan.companyAction === "update") {
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
        currentUserId ?? refreshedSession?.user?.id ?? refreshedSession?.session?.userId ?? null;
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

  const conflicts = useMemo(() => (importPreview ? buildConflictList(importPreview) : []), [importPreview]);

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

  if (!selectedCompanyId) {
    return <EmptyState icon={Download} message="Select a company to import into." />;
  }

  return (
    <div>
      <ImportSourceForm
        sourceMode={sourceMode}
        onSourceModeChange={setSourceMode}
        importUrl={importUrl}
        onImportUrlChange={setImportUrl}
        localPackage={localPackage}
        onChooseLocalPackage={handleChooseLocalPackage}
        targetMode={targetMode}
        onTargetModeChange={setTargetMode}
        selectedCompanyName={selectedCompany?.name}
        newCompanyName={newCompanyName}
        onNewCompanyNameChange={setNewCompanyName}
        collisionStrategy={collisionStrategy}
        onCollisionStrategyChange={setCollisionStrategy}
        onPreview={() => previewMutation.mutate()}
        previewPending={previewMutation.isPending}
        hasSource={hasSource}
        onClearPreview={() => setImportPreview(null)}
      />

      {importPreview && (
        <ImportPreviewResults
          importPreview={importPreview}
          tree={tree}
          conflicts={conflicts}
          renameMap={renameMap}
          actionMap={actionMap}
          totalFiles={totalFiles}
          selectedCount={selectedCount}
          selectedFile={selectedFile}
          expandedDirs={expandedDirs}
          checkedFiles={checkedFiles}
          onToggleDir={handleToggleDir}
          onSelectFile={setSelectedFile}
          onToggleCheck={handleToggleCheck}
          nameOverrides={nameOverrides}
          skippedSlugs={skippedSlugs}
          confirmedSlugs={confirmedSlugs}
          onConflictRename={handleConflictRename}
          onConflictToggleSkip={handleConflictToggleSkip}
          onConflictToggleConfirm={handleConflictToggleConfirm}
          adapterAgents={adapterAgents}
          adapterOverrides={adapterOverrides}
          adapterExpandedSlugs={adapterExpandedSlugs}
          adapterConfigValues={adapterConfigValues}
          onAdapterChange={handleAdapterChange}
          onAdapterToggleExpand={handleAdapterToggleExpand}
          onAdapterConfigChange={handleAdapterConfigChange}
          onImport={() => importMutation.mutate()}
          importPending={importMutation.isPending}
          hasErrors={hasErrors}
        />
      )}
    </div>
  );
}
