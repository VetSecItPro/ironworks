import { useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { AgentIcon } from "../AgentIconPicker";
import { InlineEntitySelector, type InlineEntityOption } from "../InlineEntitySelector";
import { MarkdownEditor, type MarkdownEditorRef } from "../MarkdownEditor";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  autoResizeTextarea,
  concurrencyPolicies,
  catchUpPolicies,
  concurrencyPolicyDescriptions,
  catchUpPolicyDescriptions,
} from "./routine-constants";

export interface RoutineDraft {
  title: string;
  description: string;
  projectId: string;
  assigneeAgentId: string;
  priority: string;
  concurrencyPolicy: string;
  catchUpPolicy: string;
}

export interface CreateRoutineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: RoutineDraft;
  setDraft: React.Dispatch<React.SetStateAction<RoutineDraft>>;
  advancedOpen: boolean;
  setAdvancedOpen: (open: boolean) => void;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  onSubmit: () => void;
  assigneeOptions: InlineEntityOption[];
  projectOptions: InlineEntityOption[];
  agentById: Map<string, { id: string; name: string; icon?: string | null }>;
  projectById: Map<string, { id: string; name: string; color?: string | null }>;
  onTrackAssignee: (id: string) => void;
  descriptionEditorRef: React.RefObject<MarkdownEditorRef | null>;
}

export function CreateRoutineDialog({
  open,
  onOpenChange,
  draft,
  setDraft,
  advancedOpen,
  setAdvancedOpen,
  isPending,
  isError,
  error,
  onSubmit,
  assigneeOptions,
  projectOptions,
  agentById,
  projectById,
  onTrackAssignee,
  descriptionEditorRef,
}: CreateRoutineDialogProps) {
  const titleInputRef = useRef<HTMLTextAreaElement | null>(null);
  const assigneeSelectorRef = useRef<HTMLButtonElement | null>(null);
  const projectSelectorRef = useRef<HTMLButtonElement | null>(null);

  const currentAssignee = draft.assigneeAgentId ? agentById.get(draft.assigneeAgentId) ?? null : null;
  const currentProject = draft.projectId ? projectById.get(draft.projectId) ?? null : null;

  useEffect(() => {
    autoResizeTextarea(titleInputRef.current);
  }, [draft.title, open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!isPending) {
          onOpenChange(o);
        }
      }}
    >
      <DialogContent showCloseButton={false} className="max-w-3xl gap-0 overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">New routine</p>
            <p className="text-sm text-muted-foreground">
              Define the recurring work first. Trigger setup comes next on the detail page.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              setAdvancedOpen(false);
            }}
            disabled={isPending}
          >
            Cancel
          </Button>
        </div>

        <div className="px-5 pt-5 pb-3">
          <textarea
            ref={titleInputRef}
            className="w-full resize-none overflow-hidden bg-transparent text-xl font-semibold outline-none placeholder:text-muted-foreground/70"
            placeholder="Routine title"
            rows={1}
            value={draft.title}
            onChange={(event) => {
              setDraft((current) => ({ ...current, title: event.target.value }));
              autoResizeTextarea(event.target);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                descriptionEditorRef.current?.focus();
                return;
              }
              if (event.key === "Tab" && !event.shiftKey) {
                event.preventDefault();
                if (draft.assigneeAgentId) {
                  if (draft.projectId) {
                    descriptionEditorRef.current?.focus();
                  } else {
                    projectSelectorRef.current?.focus();
                  }
                } else {
                  assigneeSelectorRef.current?.focus();
                }
              }
            }}
            autoFocus
          />
        </div>

        <div className="px-5 pb-3">
          <div className="overflow-x-auto overscroll-x-contain">
            <div className="inline-flex min-w-full flex-wrap items-center gap-2 text-sm text-muted-foreground sm:min-w-max sm:flex-nowrap">
              <span>For</span>
              <InlineEntitySelector
                ref={assigneeSelectorRef}
                value={draft.assigneeAgentId}
                options={assigneeOptions}
                placeholder="Assignee"
                noneLabel="No assignee"
                searchPlaceholder="Search assignees..."
                emptyMessage="No assignees found."
                onChange={(assigneeAgentId) => {
                  if (assigneeAgentId) onTrackAssignee(assigneeAgentId);
                  setDraft((current) => ({ ...current, assigneeAgentId }));
                }}
                onConfirm={() => {
                  if (draft.projectId) {
                    descriptionEditorRef.current?.focus();
                  } else {
                    projectSelectorRef.current?.focus();
                  }
                }}
                renderTriggerValue={(option) =>
                  option ? (
                    currentAssignee ? (
                      <>
                        <AgentIcon icon={currentAssignee.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{option.label}</span>
                      </>
                    ) : (
                      <span className="truncate">{option.label}</span>
                    )
                  ) : (
                    <span className="text-muted-foreground">Assignee</span>
                  )
                }
                renderOption={(option) => {
                  if (!option.id) return <span className="truncate">{option.label}</span>;
                  const assignee = agentById.get(option.id);
                  return (
                    <>
                      {assignee ? <AgentIcon icon={assignee.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
                      <span className="truncate">{option.label}</span>
                    </>
                  );
                }}
              />
              <span>in</span>
              <InlineEntitySelector
                ref={projectSelectorRef}
                value={draft.projectId}
                options={projectOptions}
                placeholder="Project"
                noneLabel="No project"
                searchPlaceholder="Search projects..."
                emptyMessage="No projects found."
                onChange={(projectId) => setDraft((current) => ({ ...current, projectId }))}
                onConfirm={() => descriptionEditorRef.current?.focus()}
                renderTriggerValue={(option) =>
                  option && currentProject ? (
                    <>
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: currentProject.color ?? "#64748b" }}
                      />
                      <span className="truncate">{option.label}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Project</span>
                  )
                }
                renderOption={(option) => {
                  if (!option.id) return <span className="truncate">{option.label}</span>;
                  const project = projectById.get(option.id);
                  return (
                    <>
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: project?.color ?? "#64748b" }}
                      />
                      <span className="truncate">{option.label}</span>
                    </>
                  );
                }}
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border/60 px-5 py-4">
          <MarkdownEditor
            ref={descriptionEditorRef}
            value={draft.description}
            onChange={(description) => setDraft((current) => ({ ...current, description }))}
            placeholder="Add instructions..."
            bordered={false}
            contentClassName="min-h-[160px] text-sm text-muted-foreground"
            onSubmit={() => {
              if (!isPending && draft.title.trim() && draft.projectId && draft.assigneeAgentId) {
                onSubmit();
              }
            }}
          />
        </div>

        <div className="border-t border-border/60 px-5 py-3">
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
              <div>
                <p className="text-sm font-medium">Advanced delivery settings</p>
                <p className="text-sm text-muted-foreground">Keep policy controls secondary to the work definition.</p>
              </div>
              {advancedOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Concurrency</p>
                  <Select
                    value={draft.concurrencyPolicy}
                    onValueChange={(concurrencyPolicy) => setDraft((current) => ({ ...current, concurrencyPolicy }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {concurrencyPolicies.map((value) => (
                        <SelectItem key={value} value={value}>{value.replaceAll("_", " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{concurrencyPolicyDescriptions[draft.concurrencyPolicy]}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Catch-up</p>
                  <Select
                    value={draft.catchUpPolicy}
                    onValueChange={(catchUpPolicy) => setDraft((current) => ({ ...current, catchUpPolicy }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {catchUpPolicies.map((value) => (
                        <SelectItem key={value} value={value}>{value.replaceAll("_", " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{catchUpPolicyDescriptions[draft.catchUpPolicy]}</p>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div className="flex flex-col gap-3 border-t border-border/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            After creation, Ironworks takes you straight to trigger setup for schedules, webhooks, or internal runs.
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <Button
              onClick={onSubmit}
              disabled={
                isPending ||
                !draft.title.trim() ||
                !draft.projectId ||
                !draft.assigneeAgentId
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              {isPending ? "Creating..." : "Create routine"}
            </Button>
            {isError ? (
              <p role="alert" className="text-sm text-destructive">
                {error instanceof Error ? error.message : "Failed to create routine"}
              </p>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
