import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trackFeatureUsed } from "../lib/analytics";
import { BookTemplate, Plus, Wand2 } from "lucide-react";
import { playbooksApi, type Playbook, type PlaybookWithSteps } from "../api/playbooks";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NewPlaybookDialog } from "../components/NewPlaybookDialog";
import { RunPlaybookDialog } from "../components/RunPlaybookDialog";
import { PlaybookCard, PlaybookDetailPanel, DryRunDialog } from "../components/playbooks";

/* ------------------------------------------------------------------ */
/*  Main Playbooks Page                                                */
/* ------------------------------------------------------------------ */

export function Playbooks() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([{ label: "Playbooks" }]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showRunDialog, setShowRunDialog] = useState(false);
  const [showDryRunDialog, setShowDryRunDialog] = useState(false);
  const [dryRunPlaybook, setDryRunPlaybook] = useState<PlaybookWithSteps | null>(null);

  const { data: playbooksList, isLoading } = useQuery({
    queryKey: queryKeys.playbooks.list(selectedCompanyId!),
    queryFn: () => playbooksApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const runMutation = useMutation({
    mutationFn: ({ playbookId, name, repoUrl }: { playbookId: string; name?: string; repoUrl?: string }) =>
      playbooksApi.run(selectedCompanyId!, playbookId, undefined /* projectId */, name, repoUrl),
    onSuccess: (data) => {
      trackFeatureUsed("run_playbook");
      pushToast({
        title: "Playbook started",
        body: `${data.stepsCreated} tasks created`,
        tone: "success",
      });
      setShowRunDialog(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.playbooks.list(selectedCompanyId!) });
      if (selectedId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.playbooks.detail(selectedCompanyId!, selectedId) });
      }
    },
    onError: () => {
      pushToast({ title: "Failed to run playbook", tone: "error" });
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: Parameters<typeof playbooksApi.create>[1]) =>
      playbooksApi.create(selectedCompanyId!, payload),
    onSuccess: (data) => {
      pushToast({ title: "Playbook created", body: data.name, tone: "success" });
      queryClient.invalidateQueries({ queryKey: queryKeys.playbooks.list(selectedCompanyId!) });
      setSelectedId(data.id);
      setShowNewDialog(false);
    },
    onError: () => {
      pushToast({ title: "Failed to create playbook", tone: "error" });
    },
  });

  const seedMutation = useMutation({
    mutationFn: () => playbooksApi.seed(selectedCompanyId!),
    onSuccess: (data) => {
      if (data.seeded) {
        pushToast({ title: "Playbooks seeded", body: `${data.count} playbook templates added`, tone: "success" });
      } else {
        pushToast({ title: "Already seeded", body: "Default playbooks already exist", tone: "info" });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.playbooks.list(selectedCompanyId!) });
    },
  });

  const filteredPlaybooks = (playbooksList ?? []).filter(
    (pb) =>
      !filter ||
      pb.name.toLowerCase().includes(filter.toLowerCase()) ||
      pb.category.toLowerCase().includes(filter.toLowerCase()),
  );

  // Group by category
  const grouped = filteredPlaybooks.reduce(
    (acc, pb) => {
      const cat = pb.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(pb);
      return acc;
    },
    {} as Record<string, Playbook[]>,
  );

  if (!selectedCompanyId) return null;

  const totalPlaybooks = filteredPlaybooks.length;

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Playbooks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Multi-agent workflows you can run with one click.
          </p>
          {totalPlaybooks > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {totalPlaybooks} playbook{totalPlaybooks !== 1 ? "s" : ""} available
            </p>
          )}
        </div>
        <Button size="sm" onClick={() => setShowNewDialog(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Create Playbook
        </Button>
      </div>

      {/* Two-pane content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left pane: Playbook list */}
      <div className="w-80 shrink-0 border-r border-border flex flex-col bg-background">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter playbooks..."
            className="h-7 text-xs"
          />
        </div>

        <ScrollArea className="flex-1 min-h-0">
          {isLoading && !playbooksList ? (
            <div className="p-3">
              <PageSkeleton variant="list" />
            </div>
          ) : filteredPlaybooks.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <BookTemplate className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No playbooks yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Click the wand icon to load templates
              </p>
            </div>
          ) : (
            Object.entries(grouped).map(([category, pbs]) => (
              <div key={category}>
                <div className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider bg-muted/30 border-b border-border">
                  {category}
                </div>
                {pbs.map((pb) => (
                  <PlaybookCard
                    key={pb.id}
                    playbook={pb}
                    isSelected={pb.id === selectedId}
                    onSelect={() => setSelectedId(pb.id)}
                  />
                ))}
              </div>
            ))
          )}
        </ScrollArea>
      </div>

      {/* Right pane: Detail */}
      <div className="flex-1 min-w-0 bg-background">
        {selectedId ? (
          <PlaybookDetailPanel
            companyId={selectedCompanyId}
            playbookId={selectedId}
            onRun={() => setShowRunDialog(true)}
            onDryRun={() => {
              const cached = playbooksApi.detail(selectedCompanyId, selectedId);
              cached.then((data) => {
                setDryRunPlaybook(data);
                setShowDryRunDialog(true);
              }).catch((err: unknown) => {
                console.error("Failed to fetch playbook for dry run", err instanceof Error ? err.message : err);
                setShowDryRunDialog(true);
              });
            }}
            isRunning={runMutation.isPending}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <BookTemplate className="h-12 w-12 text-muted-foreground/20 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              Select a playbook to view
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Playbooks are reusable multi-agent workflows. Select one to see the steps, or load templates to get started.
            </p>
            {(!playbooksList || playbooksList.length === 0) && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
              >
                <Wand2 className={cn("h-3.5 w-3.5 mr-1.5", seedMutation.isPending && "animate-pulse")} />
                Load Template Playbooks
              </Button>
            )}
          </div>
        )}
      </div>

      </div>

      <NewPlaybookDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onSubmit={(payload) => createMutation.mutate(payload)}
        isPending={createMutation.isPending}
      />

      {selectedId && (
        <RunPlaybookDialog
          open={showRunDialog}
          onOpenChange={setShowRunDialog}
          playbookName={filteredPlaybooks.find((p) => p.id === selectedId)?.name ?? "Playbook"}
          onRun={(input) => runMutation.mutate({ playbookId: selectedId, ...input })}
          isPending={runMutation.isPending}
        />
      )}

      {dryRunPlaybook && (
        <DryRunDialog
          open={showDryRunDialog}
          onOpenChange={(open) => {
            setShowDryRunDialog(open);
            if (!open) setDryRunPlaybook(null);
          }}
          playbook={dryRunPlaybook}
        />
      )}
    </div>
  );
}
