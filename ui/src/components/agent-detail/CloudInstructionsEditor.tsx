import type { Agent } from "@ironworksai/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { agentsApi } from "../../api/agents";
import { queryKeys } from "../../lib/queryKeys";

/**
 * Provider-agnostic instructions editor for non-local (cloud/HTTP) adapters.
 * Edits systemPrompt and agentInstructions directly in the DB via PATCH.
 */
export function CloudInstructionsEditor({
  agent,
  companyId,
  onDirtyChange,
  onSaveActionChange,
  onCancelActionChange,
  onSavingChange,
}: {
  agent: Agent;
  companyId?: string;
  onDirtyChange: (dirty: boolean) => void;
  onSaveActionChange: (save: (() => void) | null) => void;
  onCancelActionChange: (cancel: (() => void) | null) => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [soulDraft, setSoulDraft] = useState<string | null>(null);
  const [instructionsDraft, setInstructionsDraft] = useState<string | null>(null);

  // Reset drafts when agent changes
  useEffect(() => {
    setSoulDraft(null);
    setInstructionsDraft(null);
  }, [agent.id]);

  const persistedSoul = agent.systemPrompt ?? "";
  const persistedInstructions = agent.agentInstructions ?? "";
  const displaySoul = soulDraft ?? persistedSoul;
  const displayInstructions = instructionsDraft ?? persistedInstructions;

  const soulDirty = soulDraft !== null && soulDraft !== persistedSoul;
  const instructionsDirty = instructionsDraft !== null && instructionsDraft !== persistedInstructions;
  const isDirty = soulDirty || instructionsDirty;

  const saveMutation = useMutation({
    mutationFn: (data: { systemPrompt?: string | null; agentInstructions?: string | null }) =>
      agentsApi.update(agent.id, data, companyId),
    onSuccess: () => {
      setSoulDraft(null);
      setInstructionsDraft(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agent.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agent.urlKey) });
    },
  });

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [onDirtyChange, isDirty]);
  useEffect(() => {
    onSavingChange(saveMutation.isPending);
  }, [onSavingChange, saveMutation.isPending]);

  useEffect(() => {
    onSaveActionChange(
      isDirty
        ? () => {
            const patch: Record<string, string | null> = {};
            if (soulDirty) patch.systemPrompt = displaySoul || null;
            if (instructionsDirty) patch.agentInstructions = displayInstructions || null;
            saveMutation.mutate(patch);
          }
        : null,
    );
  }, [isDirty, soulDirty, instructionsDirty, displaySoul, displayInstructions, onSaveActionChange, saveMutation]);

  useEffect(() => {
    onCancelActionChange(
      isDirty
        ? () => {
            setSoulDraft(null);
            setInstructionsDraft(null);
          }
        : null,
    );
  }, [isDirty, onCancelActionChange]);

  const [selectedFile, setSelectedFile] = useState<"soul" | "agents">("soul");

  const files = [
    {
      key: "soul" as const,
      name: "SOUL.md",
      description: "Identity and personality",
      hasContent: !!displaySoul,
      dirty: soulDirty,
    },
    {
      key: "agents" as const,
      name: "AGENTS.md",
      description: "Responsibilities and procedures",
      hasContent: !!displayInstructions,
      dirty: instructionsDirty,
    },
  ];

  return (
    <div
      className="flex gap-0 border border-border rounded-lg overflow-hidden"
      style={{ height: "calc(100vh - 280px)", minHeight: 400 }}
    >
      {/* File tree sidebar */}
      <div className="w-52 shrink-0 border-r border-border bg-muted/20 flex flex-col">
        <div className="px-3 py-2 border-b border-border">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Files</span>
        </div>
        <div className="flex-1 py-1">
          {files.map((file) => (
            <button
              key={file.key}
              onClick={() => setSelectedFile(file.key)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                selectedFile === file.key
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="shrink-0 opacity-60">
                <path d="M3.5 2A1.5 1.5 0 0 0 2 3.5v9A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5V6.621a1.5 1.5 0 0 0-.44-1.06L10.94 2.94A1.5 1.5 0 0 0 9.878 2.5H9.5V5a1 1 0 0 1-1 1H5.5V3.5A1.5 1.5 0 0 0 4 2H3.5z" />
              </svg>
              <span className="truncate">{file.name}</span>
              {file.dirty && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Unsaved changes" />
              )}
              {!file.hasContent && <span className="text-[10px] text-muted-foreground/70 shrink-0">empty</span>}
            </button>
          ))}
        </div>
        <div className="px-3 py-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            These files define the agent's behavior across all LLM providers.
          </p>
        </div>
      </div>

      {/* Editor pane */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/10">
          <span className="text-xs font-mono text-muted-foreground">
            {selectedFile === "soul" ? "SOUL.md" : "AGENTS.md"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {selectedFile === "soul"
              ? "Identity, personality, and guiding principles"
              : "Responsibilities, channel rules, and operational procedures"}
          </span>
        </div>
        <textarea
          value={selectedFile === "soul" ? displaySoul : displayInstructions}
          onChange={(e) =>
            selectedFile === "soul" ? setSoulDraft(e.target.value) : setInstructionsDraft(e.target.value)
          }
          className="flex-1 w-full bg-transparent px-4 py-3 font-mono text-sm outline-none resize-none"
          placeholder={
            selectedFile === "soul"
              ? "# SOUL.md\n\nYou are [Agent Name], [Role].\n\n## Core Identity\n- ...\n\n## Reports To\n...\n\n## Responsibilities\n1. ..."
              : "# AGENTS.md\n\n## Channel Communication\n- ...\n\n## Heartbeat Process\n1. ...\n\n## Process Discipline\n- ..."
          }
          spellCheck={false}
        />
      </div>
    </div>
  );
}

export function PromptsTabSkeleton() {
  return (
    <div className="max-w-5xl space-y-4">
      <div className="rounded-lg border border-border p-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-[30rem] max-w-full" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="rounded-lg border border-border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-8 w-16" />
          </div>
          <Skeleton className="h-10 w-full" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full rounded-none" />
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-28" />
          </div>
          <PromptEditorSkeleton />
        </div>
      </div>
    </div>
  );
}

export function PromptEditorSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[420px] w-full" />
    </div>
  );
}
