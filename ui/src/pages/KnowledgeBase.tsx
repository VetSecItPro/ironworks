import { useEffect, useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { knowledgeApi, type KnowledgePage } from "../api/knowledge";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "../lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookOpen, Plus, Search } from "lucide-react";
import {
  KBFolderTree,
  FormattingToolbar,
  KBPageHeader,
  KBPageMetadata,
  KBRevisionHistory,
  KBPageContent,
} from "../components/knowledge-base";

/* ── Main component ── */

export function KnowledgeBase() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDepartment, setNewDepartment] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [showHistory, setShowHistory] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [compareRevision, setCompareRevision] = useState<number | null>(null);
  const editBodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Knowledge Base" }]);
  }, [setBreadcrumbs]);

  /* ── Queries ── */

  const { data: pages, isLoading, error: pagesError } = useQuery({
    queryKey: [...queryKeys.knowledge.list(selectedCompanyId!), departmentFilter],
    queryFn: () => knowledgeApi.list(selectedCompanyId!, undefined, departmentFilter),
    enabled: !!selectedCompanyId,
  });

  const selectedPage = useMemo(
    () => (pages ?? []).find((p) => p.id === selectedPageId) ?? null,
    [pages, selectedPageId],
  );

  const { data: revisions } = useQuery({
    queryKey: ["knowledge", "revisions", selectedPageId],
    queryFn: () => knowledgeApi.listRevisions(selectedPageId!),
    enabled: !!selectedPageId && showHistory,
  });

  const { data: compareRevisionData } = useQuery({
    queryKey: ["knowledge", "revision", selectedPageId, compareRevision],
    queryFn: () => knowledgeApi.getRevision(selectedPageId!, compareRevision!),
    enabled: !!selectedPageId && compareRevision !== null,
  });

  /* ── Derived data ── */
  const filteredPages = useMemo(() => {
    if (!search.trim()) return pages ?? [];
    const q = search.toLowerCase();
    return (pages ?? []).filter((p) => p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q));
  }, [pages, search]);
  const departments = useMemo(() => {
    const depts = new Set<string>();
    for (const p of pages ?? []) { if (p.department) depts.add(p.department); }
    return [...depts].sort();
  }, [pages]);
  const existingFolders = useMemo(() => {
    const folderSet = new Set<string>();
    for (const p of pages ?? []) {
      const slug = p.slug ?? "";
      const idx = slug.indexOf("/");
      if (idx > 0) folderSet.add(slug.substring(0, idx));
    }
    return [...folderSet].sort();
  }, [pages]);
  const ACRONYM_FOLDERS: Record<string, string> = { hr: "HR", sla: "SLA", api: "API", it: "IT", qa: "QA" };
  const folderDisplayName = (name: string) => ACRONYM_FOLDERS[name.toLowerCase()] ?? name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, " ");
  const suggestedPages = useMemo(() => {
    if (!selectedPage || !pages || pages.length < 2) return [];
    const words = new Set(selectedPage.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
    if (words.size === 0) return [];
    return (pages ?? [])
      .filter((p) => p.id !== selectedPage.id)
      .map((p) => {
        const overlap = p.title.toLowerCase().split(/\s+/).filter((w) => words.has(w)).length;
        const bodyOverlap = p.body.toLowerCase().split(/\s+/).filter((w) => w.length > 3 && words.has(w)).length;
        return { page: p, score: overlap * 3 + Math.min(bodyOverlap, 3) };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((s) => s.page);
  }, [selectedPage, pages]);

  /* ── Mutations ── */
  const createPage = useMutation({
    mutationFn: () =>
      knowledgeApi.create(selectedCompanyId!, {
        title: newTitle.trim(),
        department: newDepartment || undefined,
        folder: (newFolder && newFolder !== "__root__") ? newFolder : undefined,
      }),
    onSuccess: (page) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.list(selectedCompanyId!) });
      setSelectedPageId(page.id);
      setCreating(false);
      setNewTitle("");
      setNewDepartment("");
      setNewFolder("");
      setEditing(true);
      setEditTitle(page.title);
      setEditBody(page.body);
    },
  });
  const updatePage = useMutation({
    mutationFn: () => knowledgeApi.update(selectedPageId!, { title: editTitle, body: editBody }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.list(selectedCompanyId!) });
      setEditing(false);
    },
  });
  const deletePage = useMutation({
    mutationFn: () => knowledgeApi.remove(selectedPageId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.list(selectedCompanyId!) });
      setSelectedPageId(null);
      setEditing(false);
    },
  });
  const revertPage = useMutation({
    mutationFn: (revisionNumber: number) => knowledgeApi.revert(selectedPageId!, revisionNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: ["knowledge", "revisions", selectedPageId] });
      setShowHistory(false);
    },
  });
  const updateVisibility = useMutation({
    mutationFn: (visibility: string) =>
      knowledgeApi.update(selectedPageId!, { visibility }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.list(selectedCompanyId!) });
    },
  });

  /* ── Handlers ── */
  function startEditing() {
    if (!selectedPage) return;
    setEditTitle(selectedPage.title);
    setEditBody(selectedPage.body);
    setEditing(true);
    setTimeout(() => editBodyRef.current?.focus(), 50);
  }

  function navigateToSlug(slug: string) {
    const page = (pages ?? []).find((p) => p.slug === slug);
    if (page) {
      setSelectedPageId(page.id);
      setEditing(false);
      setShowHistory(false);
    }
  }

  /* ── Guards ── */
  if (!selectedCompanyId) {
    return <EmptyState icon={BookOpen} message="Select a company to view the Knowledge Base." />;
  }

  if (isLoading && !pages) return <PageSkeleton variant="list" />;

  /* ── Layout ── */
  return (
    <div className="flex h-full gap-0 -m-4 md:-m-6">
      {/* Left panel - page list */}
      <div className={cn(
        "flex flex-col border-r border-border bg-background shrink-0 transition-[width]",
        selectedPageId ? "w-0 md:w-72 overflow-hidden" : "w-full md:w-72",
      )}>
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Knowledge Base</h2>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCreating(true)}>
              <Plus className="h-3 w-3 mr-1" />New Page
            </Button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-7 text-xs h-8" />
          </div>
          {departments.length > 0 && (
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {creating && (
          <div className="p-3 border-b border-border space-y-2">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Page title..."
              className="text-xs h-8"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && newTitle.trim()) createPage.mutate(); if (e.key === "Escape") setCreating(false); }}
            />
            <Select value={newFolder} onValueChange={setNewFolder}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Folder (root)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__root__">Root (no folder)</SelectItem>
                {existingFolders.map((f) => (
                  <SelectItem key={f} value={f}>{folderDisplayName(f)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Button size="sm" className="h-7 text-xs" disabled={!newTitle.trim() || createPage.isPending} onClick={() => createPage.mutate()}>
                {createPage.isPending ? "Creating..." : "Create"}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setCreating(false); setNewTitle(""); setNewDepartment(""); setNewFolder(""); }}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {pagesError && (
            <div className="p-4 text-xs text-destructive text-center">
              Failed to load pages. Please try again.
            </div>
          )}
          {!pagesError && filteredPages.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground text-center">
              {search.trim() ? "No pages match your search." : "No pages yet. Create one to get started."}
            </div>
          ) : (
            <KBFolderTree
              pages={filteredPages}
              selectedPageId={selectedPageId}
              onSelectPage={(id) => { setSelectedPageId(id); setEditing(false); setShowHistory(false); }}
              onBulkDelete={async (ids) => {
                for (const id of ids) {
                  await knowledgeApi.remove(id).catch(() => {});
                }
                queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.list(selectedCompanyId!) });
                if (selectedPageId && ids.includes(selectedPageId)) setSelectedPageId(null);
              }}
            />
          )}
        </div>
      </div>

      {/* Right panel - page content */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {!selectedPage ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a page or create a new one</p>
            </div>
          </div>
        ) : (
          <>
            <KBPageHeader
              selectedPage={selectedPage}
              editing={editing}
              editTitle={editTitle}
              onEditTitleChange={setEditTitle}
              onSave={() => updatePage.mutate()}
              onCancelEdit={() => setEditing(false)}
              onStartEditing={startEditing}
              onToggleHistory={() => setShowHistory(!showHistory)}
              onDelete={() => setShowDeleteConfirm(true)}
              onBack={() => setSelectedPageId(null)}
              isSaving={updatePage.isPending}
              showHistory={showHistory}
            />

            <KBPageMetadata
              selectedPage={selectedPage}
              onVisibilityChange={(v) => updateVisibility.mutate(v)}
            />

            {/* Content area */}
            <div className="flex-1 overflow-y-auto">
              {showHistory ? (
                <KBRevisionHistory
                  selectedPage={selectedPage}
                  revisions={revisions ?? []}
                  compareRevision={compareRevision}
                  compareRevisionData={compareRevisionData ?? null}
                  onSetCompareRevision={setCompareRevision}
                  onRevert={(rev) => revertPage.mutate(rev)}
                  isReverting={revertPage.isPending}
                />
              ) : editing ? (
                <div className="flex flex-col h-full">
                  <FormattingToolbar
                    textareaRef={editBodyRef}
                    value={editBody}
                    onChange={setEditBody}
                  />
                  <textarea
                    ref={editBodyRef}
                    className="w-full flex-1 p-4 text-sm bg-transparent outline-none resize-none font-mono"
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    placeholder="Write your page content in markdown..."
                  />
                </div>
              ) : (
                <KBPageContent
                  selectedPage={selectedPage}
                  pages={pages ?? []}
                  suggestedPages={suggestedPages}
                  onNavigateToSlug={navigateToSlug}
                  onSelectPage={(id) => {
                    setSelectedPageId(id);
                    setEditing(false);
                    setShowHistory(false);
                  }}
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* Delete page confirmation dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete page?</DialogTitle>
            <DialogDescription>
              {selectedPage
                ? `"${selectedPage.title}" will be permanently deleted along with all its revision history. This cannot be undone.`
                : "This page will be permanently deleted. This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deletePage.isPending}
              onClick={() => {
                deletePage.mutate();
                setShowDeleteConfirm(false);
              }}
            >
              {deletePage.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
