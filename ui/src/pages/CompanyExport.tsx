import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  Agent,
  CompanyPortabilityFileEntry,
  CompanyPortabilityExportPreviewResult,
  Project,
} from "@ironworksai/shared";
import { useNavigate, useLocation } from "@/lib/router";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { agentsApi } from "../api/agents";
import { authApi } from "../api/auth";
import { companiesApi } from "../api/companies";
import { projectsApi } from "../api/projects";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { queryKeys } from "../lib/queryKeys";
import { buildInitialExportCheckedFiles } from "../lib/company-export-selection";
import { useAgentOrder } from "../hooks/useAgentOrder";
import { useProjectOrder } from "../hooks/useProjectOrder";
import { buildPortableSidebarOrder } from "../lib/company-portability-sidebar";
import { Package } from "lucide-react";
import { buildFileTree, collectAllPaths, countFiles } from "../components/PackageFileTree";
import type { FileTreeNode } from "../components/PackageFileTree";
import {
  ExportPreviewPane,
  ExportActionBar,
  ExportWarnings,
  ExportSidebar,
  filterIronworksYaml,
  filterTree,
  collectMatchedParentDirs,
  sortByChecked,
  paginateTaskNodes,
  downloadZip,
  filePathFromLocation,
  expandAncestors,
  generateReadmeFromSelection,
  TASKS_PAGE_SIZE,
} from "../components/company-export";

export function CompanyExport() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // ── Queries ──────────────────────────────────────────────────────────
  const { data: session, isFetched: isSessionFetched } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });
  const { data: agents = [], isFetched: areAgentsFetched } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: projects = [], isFetched: areProjectsFetched } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // ── Local state ──────────────────────────────────────────────────────
  const [exportData, setExportData] = useState<CompanyPortabilityExportPreviewResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [checkedFiles, setCheckedFiles] = useState<Set<string>>(new Set());
  const [treeSearch, setTreeSearch] = useState("");
  const [taskLimit, setTaskLimit] = useState(TASKS_PAGE_SIZE);
  const savedExpandedRef = useRef<Set<string> | null>(null);
  const initialFileFromUrl = useRef(filePathFromLocation(location.pathname));

  // ── Derived state ────────────────────────────────────────────────────
  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;
  const visibleAgents = useMemo(() => agents.filter((agent: Agent) => agent.status !== "terminated"), [agents]);
  const visibleProjects = useMemo(() => projects.filter((project: Project) => !project.archivedAt), [projects]);
  const { orderedAgents } = useAgentOrder({ agents: visibleAgents, companyId: selectedCompanyId, userId: currentUserId });
  const { orderedProjects } = useProjectOrder({ projects: visibleProjects, companyId: selectedCompanyId, userId: currentUserId });
  const sidebarOrder = useMemo(
    () => buildPortableSidebarOrder({ agents: visibleAgents, orderedAgents, projects: visibleProjects, orderedProjects }),
    [orderedAgents, orderedProjects, visibleAgents, visibleProjects],
  );
  const sidebarOrderKey = useMemo(() => JSON.stringify(sidebarOrder ?? null), [sidebarOrder]);

  const selectFile = useCallback(
    (filePath: string | null, replace = false) => {
      setSelectedFile(filePath);
      if (filePath) navigate(`/company/export/files/${encodeURI(filePath)}`, { replace });
      else navigate("/company/export", { replace });
    },
    [navigate],
  );

  // ── Sync selectedFile from URL on browser back/forward ───────────────
  useEffect(() => {
    if (!exportData) return;
    const urlFile = filePathFromLocation(location.pathname);
    if (urlFile && urlFile in exportData.files && urlFile !== selectedFile) {
      setSelectedFile(urlFile);
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        for (const dir of expandAncestors(urlFile)) next.add(dir);
        return next;
      });
    } else if (!urlFile && selectedFile) {
      setSelectedFile(null);
    }
  }, [location.pathname, exportData]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setBreadcrumbs([{ label: "Org Chart", href: "/org" }, { label: "Export" }]);
  }, [setBreadcrumbs]);

  // ── Mutations ────────────────────────────────────────────────────────
  const exportPreviewMutation = useMutation({
    mutationFn: () =>
      companiesApi.exportPreview(selectedCompanyId!, {
        include: { company: true, agents: true, projects: true, issues: true },
        sidebarOrder,
      }),
    onSuccess: (result) => {
      setExportData(result);
      setCheckedFiles((prev) => buildInitialExportCheckedFiles(Object.keys(result.files), result.manifest.issues, prev));
      const tree = buildFileTree(result.files);
      const topDirs = new Set<string>();
      for (const node of tree) {
        if (node.kind === "dir" && node.name !== "tasks") topDirs.add(node.path);
      }
      const urlFile = initialFileFromUrl.current;
      if (urlFile && urlFile in result.files) {
        setSelectedFile(urlFile);
        setExpandedDirs(new Set([...topDirs, ...expandAncestors(urlFile)]));
      } else {
        const defaultFile = "README.md" in result.files ? "README.md" : Object.keys(result.files)[0];
        if (defaultFile) selectFile(defaultFile, true);
        setExpandedDirs(topDirs);
      }
    },
    onError: (err) => pushToast({ tone: "error", title: "Export failed", body: err instanceof Error ? err.message : "Failed to load export data." }),
  });

  const downloadMutation = useMutation({
    mutationFn: () =>
      companiesApi.exportPackage(selectedCompanyId!, {
        include: { company: true, agents: true, projects: true, issues: true },
        selectedFiles: Array.from(checkedFiles).sort(),
        sidebarOrder,
      }),
    onSuccess: (result) => {
      const resultCheckedFiles = new Set(Object.keys(result.files));
      downloadZip(result, resultCheckedFiles, result.files);
      pushToast({ tone: "success", title: "Export downloaded", body: `${resultCheckedFiles.size} file${resultCheckedFiles.size === 1 ? "" : "s"} exported as ${result.rootPath}.zip` });
    },
    onError: (err) => pushToast({ tone: "error", title: "Export failed", body: err instanceof Error ? err.message : "Failed to build export package." }),
  });

  useEffect(() => {
    if (!selectedCompanyId || exportPreviewMutation.isPending) return;
    if (!isSessionFetched || !areAgentsFetched || !areProjectsFetched) return;
    setExportData(null);
    exportPreviewMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId, isSessionFetched, areAgentsFetched, areProjectsFetched, sidebarOrderKey]);

  // ── Tree computations ────────────────────────────────────────────────
  const tree = useMemo(() => (exportData ? buildFileTree(exportData.files) : []), [exportData]);

  const { displayTree, totalTaskChildren, visibleTaskChildren } = useMemo(() => {
    let result = tree;
    if (treeSearch) result = filterTree(result, treeSearch);
    result = sortByChecked(result, checkedFiles);
    const paginated = paginateTaskNodes(result, taskLimit, checkedFiles, treeSearch);
    return { displayTree: paginated.nodes, totalTaskChildren: paginated.totalTaskChildren, visibleTaskChildren: paginated.visibleTaskChildren };
  }, [tree, treeSearch, checkedFiles, taskLimit]);

  const effectiveFiles = useMemo(() => {
    if (!exportData) return {} as Record<string, CompanyPortabilityFileEntry>;
    const filtered = { ...exportData.files };
    const yamlPath = exportData.ironworksExtensionPath;
    if (yamlPath && typeof exportData.files[yamlPath] === "string") {
      filtered[yamlPath] = filterIronworksYaml(exportData.files[yamlPath], checkedFiles);
    }
    if (typeof exportData.files["README.md"] === "string") {
      const companyName = exportData.manifest.company?.name ?? selectedCompany?.name ?? "Company";
      const companyDescription = exportData.manifest.company?.description ?? null;
      filtered["README.md"] = generateReadmeFromSelection(exportData.manifest, checkedFiles, companyName, companyDescription);
    }
    return filtered;
  }, [exportData, checkedFiles, selectedCompany?.name]);

  const totalFiles = useMemo(() => countFiles(tree), [tree]);
  const selectedCount = checkedFiles.size;
  const warnings = useMemo(() => {
    if (!exportData) return [] as string[];
    return exportData.warnings.filter((w) => !/terminated agent/i.test(w));
  }, [exportData]);

  // ── Handlers ─────────────────────────────────────────────────────────
  function handleToggleDir(path: string) {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }

  function handleToggleCheck(path: string, kind: "file" | "dir") {
    if (!exportData) return;
    setCheckedFiles((prev) => {
      const next = new Set(prev);
      if (kind === "file") {
        if (next.has(path)) next.delete(path); else next.add(path);
      } else {
        const dirTree = buildFileTree(exportData.files);
        const findNode = (nodes: FileTreeNode[], target: string): FileTreeNode | null => {
          for (const n of nodes) {
            if (n.path === target) return n;
            const found = findNode(n.children, target);
            if (found) return found;
          }
          return null;
        };
        const dirNode = findNode(dirTree, path);
        if (dirNode) {
          const childFiles = collectAllPaths(dirNode.children, "file");
          for (const child of dirNode.children) {
            if (child.kind === "file") childFiles.add(child.path);
          }
          const allChecked = [...childFiles].every((p) => next.has(p));
          for (const f of childFiles) {
            if (allChecked) next.delete(f); else next.add(f);
          }
        }
      }
      return next;
    });
  }

  function handleSearchChange(query: string) {
    const wasSearching = treeSearch.length > 0;
    const isSearching = query.length > 0;
    if (isSearching && !wasSearching) savedExpandedRef.current = new Set(expandedDirs);
    setTreeSearch(query);
    if (isSearching) {
      const matchedParents = collectMatchedParentDirs(tree, query);
      setExpandedDirs((prev) => { const next = new Set(prev); for (const d of matchedParents) next.add(d); return next; });
    } else if (wasSearching && savedExpandedRef.current) {
      setExpandedDirs(savedExpandedRef.current);
      savedExpandedRef.current = null;
    }
  }

  function handleSkillClick(skillKey: string) {
    if (!exportData) return;
    const manifestSkill = exportData.manifest.skills.find((skill) => skill.key === skillKey || skill.slug === skillKey);
    const skillPath = manifestSkill?.path ?? `skills/${skillKey}/SKILL.md`;
    if (!(skillPath in exportData.files)) return;
    selectFile(skillPath);
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      next.add("skills");
      const parts = skillPath.split("/").slice(0, -1);
      let current = "";
      for (const part of parts) { current = current ? `${current}/${part}` : part; next.add(current); }
      return next;
    });
  }

  function handleDownload() {
    if (!exportData || checkedFiles.size === 0 || downloadMutation.isPending) return;
    downloadMutation.mutate();
  }

  // ── Guard renders ────────────────────────────────────────────────────
  if (!selectedCompanyId) return <EmptyState icon={Package} message="Select a company to export." />;
  if (exportPreviewMutation.isPending && !exportData) return <PageSkeleton variant="detail" />;
  if (!exportData) return <EmptyState icon={Package} message="Loading export data..." />;

  const previewContent = selectedFile ? (effectiveFiles[selectedFile] ?? null) : null;

  return (
    <div>
      <ExportActionBar
        companyName={selectedCompany?.name ?? "Company"}
        selectedCount={selectedCount}
        totalFiles={totalFiles}
        warningCount={warnings.length}
        downloadPending={downloadMutation.isPending}
        onDownload={handleDownload}
      />
      <ExportWarnings warnings={warnings} />
      <div className="grid h-[calc(100vh-12rem)] gap-0 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <ExportSidebar
          displayTree={displayTree}
          selectedFile={selectedFile}
          expandedDirs={expandedDirs}
          checkedFiles={checkedFiles}
          treeSearch={treeSearch}
          onSearchChange={handleSearchChange}
          onToggleDir={handleToggleDir}
          onSelectFile={selectFile}
          onToggleCheck={handleToggleCheck}
          totalTaskChildren={totalTaskChildren}
          visibleTaskChildren={visibleTaskChildren}
          onShowMoreTasks={() => setTaskLimit((prev) => prev + TASKS_PAGE_SIZE)}
        />
        <div className="min-w-0 overflow-y-auto pl-6">
          <ExportPreviewPane selectedFile={selectedFile} content={previewContent} allFiles={effectiveFiles} onSkillClick={handleSkillClick} />
        </div>
      </div>
    </div>
  );
}
