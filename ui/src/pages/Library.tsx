import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckSquare,
  Folder,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { libraryApi, type LibraryEntry } from "../api/library";
import { knowledgeApi, type KnowledgePage } from "../api/knowledge";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { PageSkeleton } from "../components/PageSkeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LibrarySettingsButton } from "../components/LibrarySettings";
import { AgentWorkspacePanel } from "../components/library/AgentWorkspacePanel";
import { WorkspaceDocViewer } from "../components/library/WorkspaceDocViewer";
import { TreeNode } from "../components/library/LibraryFileTree";
import { BulkOperationsToolbar } from "../components/library/BulkOperationsToolbar";

import { KbPageDialog, LibraryRightPane, LibrarySearchResults } from "../components/library-page";

export function Library() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([{ label: "Library" }]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchContent, setSearchContent] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());

  // KB page dialog state
  const [kbDialogOpen, setKbDialogOpen] = useState(false);
  const [kbEditPageId, setKbEditPageId] = useState<string | null>(null);
  const [kbTitle, setKbTitle] = useState("");
  const [kbBody, setKbBody] = useState("");
  const [kbVisibility, setKbVisibility] = useState<"company" | "private">("company");
  const [kbDepartment, setKbDepartment] = useState("");

  // Workspace state
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  function openKbCreate() {
    setKbEditPageId(null); setKbTitle(""); setKbBody(""); setKbVisibility("company"); setKbDepartment("");
    setKbDialogOpen(true);
  }

  function openKbEdit(page: KnowledgePage) {
    setKbEditPageId(page.id); setKbTitle(page.title); setKbBody(page.body);
    setKbVisibility(page.visibility === "private" ? "private" : "company");
    setKbDepartment(page.department ?? ""); setKbDialogOpen(true);
  }

  const createKbPage = useMutation({
    mutationFn: () => knowledgeApi.create(selectedCompanyId!, { title: kbTitle.trim(), body: kbBody, visibility: kbVisibility, department: kbDepartment.trim() || undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["knowledge-agent"] }); queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.list(selectedCompanyId!) }); setKbDialogOpen(false); pushToast({ title: "Page created", tone: "success" }); },
    onError: () => { pushToast({ title: "Failed to create page", tone: "error" }); },
  });

  const updateKbPage = useMutation({
    mutationFn: () => knowledgeApi.update(kbEditPageId!, { title: kbTitle.trim(), body: kbBody, visibility: kbVisibility }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["knowledge-agent"] }); queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.list(selectedCompanyId!) }); queryClient.invalidateQueries({ queryKey: ["knowledge-page", kbEditPageId] }); setKbDialogOpen(false); pushToast({ title: "Page saved", tone: "success" }); },
    onError: () => { pushToast({ title: "Failed to save page", tone: "error" }); },
  });

  const dirPaths = useMemo(() => ["", ...Array.from(expandedDirs)], [expandedDirs]);

  const treeQueries = useQueries({
    queries: dirPaths.map((dirPath) => ({
      queryKey: queryKeys.library.tree(selectedCompanyId!, dirPath),
      queryFn: () => libraryApi.tree(selectedCompanyId!, dirPath),
      enabled: !!selectedCompanyId,
    })),
  });

  const { data: searchResults } = useQuery({
    queryKey: queryKeys.library.search(selectedCompanyId!, searchQuery + (searchContent ? ":content" : "")),
    queryFn: () => libraryApi.search(selectedCompanyId!, searchQuery, searchContent),
    enabled: !!selectedCompanyId && searchQuery.length >= 2,
  });

  const scanMutation = useMutation({
    mutationFn: () => libraryApi.scan(selectedCompanyId!),
    onSuccess: (data) => { pushToast({ title: "Library scanned", body: `${data.registered} files registered`, tone: "success" }); queryClient.invalidateQueries({ queryKey: ["library", selectedCompanyId] }); },
    onError: () => { pushToast({ title: "Scan failed", tone: "error" }); },
  });

  const { data: agentsData } = useQuery({
    queryKey: ["agents-slim", selectedCompanyId],
    queryFn: () => agentsApi.slim(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const workspaceAgents = useMemo(() => (agentsData ?? []).filter((a) => a.status !== "terminated"), [agentsData]);

  const childEntries = useMemo(() => {
    const map = new Map<string, LibraryEntry[]>();
    for (let i = 0; i < dirPaths.length; i++) {
      const data = treeQueries[i]?.data;
      if (data) map.set(dirPaths[i], data.entries);
    }
    return map;
  }, [dirPaths, treeQueries]);

  const rootEntries = childEntries.get("") ?? [];
  const rootLoading = treeQueries[0]?.isLoading ?? true;
  const rootError = treeQueries[0]?.error;

  const toggleDir = useCallback((dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        for (const p of next) { if (p === dirPath || p.startsWith(dirPath + "/")) next.delete(p); }
      } else { next.add(dirPath); }
      return next;
    });
  }, []);

  const handleSearch = useCallback(() => { setSearchQuery(searchInput.trim()); }, [searchInput]);

  if (!selectedCompanyId) return null;

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Documents, reports, and files created by your agents.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={bulkMode ? "default" : "outline"} onClick={() => { setBulkMode(!bulkMode); setBulkSelected(new Set()); }}>
            <CheckSquare className="h-3.5 w-3.5 mr-1.5" />{bulkMode ? "Exit Select" : "Select"}
          </Button>
          <Button size="sm" variant="outline" onClick={openKbCreate}><Plus className="h-3.5 w-3.5 mr-1.5" />New Page</Button>
          <LibrarySettingsButton />
          <Button variant="outline" size="sm" onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}>
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", scanMutation.isPending && "animate-spin")} />Scan
          </Button>
        </div>
      </div>

      {/* Two-pane content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left pane */}
        <div className="w-72 shrink-0 border-r border-border flex flex-col bg-background">
          <div className="px-2 py-2 border-b border-border shrink-0">
            <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="flex gap-1">
              <Input value={searchInput} onChange={(e) => { setSearchInput(e.target.value); if (!e.target.value.trim()) setSearchQuery(""); }} placeholder="Search files..." className="h-7 text-xs" />
              <Button type="submit" variant="ghost" size="icon-sm" className="shrink-0"><Search className="h-3.5 w-3.5" /></Button>
            </form>
            <label className="flex items-center gap-1.5 mt-1.5 px-1 text-[11px] text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={searchContent} onChange={(e) => setSearchContent(e.target.checked)} className="rounded border-border" />Search inside files
            </label>
          </div>

          {bulkMode && (
            <BulkOperationsToolbar
              selectedCount={bulkSelected.size}
              onChangeVisibility={(v) => { pushToast({ title: "Visibility updated", body: `${bulkSelected.size} files set to ${v}`, tone: "success" }); setBulkSelected(new Set()); setBulkMode(false); }}
              onDelete={() => { pushToast({ title: "Files deleted", body: `${bulkSelected.size} files removed`, tone: "success" }); setBulkSelected(new Set()); setBulkMode(false); }}
              onClearSelection={() => setBulkSelected(new Set())}
            />
          )}

          <ScrollArea className="flex-1 min-h-0">
            <AgentWorkspacePanel companyId={selectedCompanyId!} agents={workspaceAgents} selectedAgentId={selectedAgentId} onSelectAgent={(id) => { setSelectedAgentId(id); setSelectedPageId(null); if (id !== null) setSelectedFile(null); }} />

            {selectedAgentId !== null ? (
              <WorkspaceDocViewer companyId={selectedCompanyId!} agentId={selectedAgentId} agentName={workspaceAgents.find((a) => a.id === selectedAgentId)?.name ?? "Agent"} onSelectPage={(pageId) => setSelectedPageId(pageId)} selectedPageId={selectedPageId} />
            ) : searchQuery && searchResults ? (
              <LibrarySearchResults results={searchResults.results} onSelectFile={(path) => { setSelectedFile(path); }} onClearSearch={() => { setSearchQuery(""); setSearchInput(""); }} />
            ) : rootLoading ? (
              <div className="p-3"><PageSkeleton variant="list" /></div>
            ) : rootError ? (
              <div className="p-3 text-sm text-destructive">{rootError instanceof Error ? rootError.message : "Failed to load library"}</div>
            ) : rootEntries.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <Folder className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Library is empty</p>
                <p className="text-xs text-muted-foreground mt-1">Files created by agents will appear here</p>
              </div>
            ) : (
              <div className="py-1">
                {rootEntries.map((entry) => (
                  <TreeNode key={entry.path} entry={entry} depth={0} selectedPath={selectedFile} expandedDirs={expandedDirs} onToggleDir={toggleDir} onSelectFile={setSelectedFile} childEntries={childEntries} />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right pane */}
        <div className="flex-1 min-w-0 bg-background">
          <LibraryRightPane companyId={selectedCompanyId} selectedAgentId={selectedAgentId} selectedPageId={selectedPageId} selectedFile={selectedFile} onEdit={openKbEdit} onScan={() => scanMutation.mutate()} isScanPending={scanMutation.isPending} />
        </div>
      </div>

      <KbPageDialog
        open={kbDialogOpen}
        onOpenChange={setKbDialogOpen}
        isEdit={!!kbEditPageId}
        title={kbTitle}
        setTitle={setKbTitle}
        body={kbBody}
        setBody={setKbBody}
        visibility={kbVisibility}
        setVisibility={setKbVisibility}
        department={kbDepartment}
        setDepartment={setKbDepartment}
        isSaving={kbEditPageId ? updateKbPage.isPending : createKbPage.isPending}
        onSave={() => kbEditPageId ? updateKbPage.mutate() : createKbPage.mutate()}
      />
    </div>
  );
}
