import type { CompanySkillDetail, CompanySkillFileDetail, CompanySkillUpdateStatus } from "@ironworksai/shared";
import { Boxes, Code2, Eye, Pencil, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/lib/router";
import { useToast } from "../../context/ToastContext";
import { cn } from "../../lib/utils";
import { EmptyState } from "../EmptyState";
import { MarkdownBody } from "../MarkdownBody";
import { MarkdownEditor } from "../MarkdownEditor";
import { PageSkeleton } from "../PageSkeleton";
import { shortRef, sourceMeta, stripFrontmatter } from "./utils";

export function SkillPane({
  loading,
  detail,
  file,
  fileLoading,
  updateStatus,
  updateStatusLoading,
  viewMode,
  editMode,
  draft,
  setViewMode,
  setEditMode,
  setDraft,
  onCheckUpdates,
  checkUpdatesPending,
  onInstallUpdate,
  installUpdatePending,
  onSave,
  savePending,
}: {
  loading: boolean;
  detail: CompanySkillDetail | null | undefined;
  file: CompanySkillFileDetail | null | undefined;
  fileLoading: boolean;
  updateStatus: CompanySkillUpdateStatus | null | undefined;
  updateStatusLoading: boolean;
  viewMode: "preview" | "code";
  editMode: boolean;
  draft: string;
  setViewMode: (mode: "preview" | "code") => void;
  setEditMode: (value: boolean) => void;
  setDraft: (value: string) => void;
  onCheckUpdates: () => void;
  checkUpdatesPending: boolean;
  onInstallUpdate: () => void;
  installUpdatePending: boolean;
  onSave: () => void;
  savePending: boolean;
}) {
  const { pushToast } = useToast();

  if (!detail) {
    if (loading) {
      return <PageSkeleton variant="detail" />;
    }
    return <EmptyState icon={Boxes} message="Select a skill to inspect its files." />;
  }

  const source = sourceMeta(detail.sourceBadge, detail.sourceLabel);
  const SourceIcon = source.icon;
  const usedBy = detail.usedByAgents;
  const body = file?.markdown ? stripFrontmatter(file.content) : (file?.content ?? "");
  const currentPin = shortRef(detail.sourceRef);
  const latestPin = shortRef(updateStatus?.latestRef);

  return (
    <div className="min-w-0">
      <div className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 truncate text-2xl font-semibold">
              <SourceIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
              {detail.name}
            </h1>
            {detail.description && <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{detail.description}</p>}
          </div>
          {detail.editable ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setEditMode(!editMode)}
            >
              <Pencil className="h-3.5 w-3.5" />
              {editMode ? "Stop editing" : "Edit"}
            </button>
          ) : (
            <div className="text-sm text-muted-foreground">{detail.editableReason}</div>
          )}
        </div>

        <div className="mt-4 space-y-3 border-t border-border pt-4 text-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Source</span>
              <span className="flex items-center gap-2">
                <SourceIcon className="h-3.5 w-3.5 text-muted-foreground" />
                {detail.sourcePath ? (
                  <button
                    type="button"
                    className="truncate hover:text-foreground text-muted-foreground transition-colors cursor-pointer"
                    onClick={() => {
                      navigator.clipboard.writeText(detail.sourcePath!);
                      pushToast({ title: "Copied path to workspace" });
                    }}
                  >
                    {source.label}
                  </button>
                ) : (
                  <span className="truncate">{source.label}</span>
                )}
              </span>
            </div>
            {detail.sourceType === "github" && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Pin</span>
                <span className="font-mono text-xs">{currentPin ?? "untracked"}</span>
                {updateStatus?.trackingRef && (
                  <span className="text-xs text-muted-foreground">tracking {updateStatus.trackingRef}</span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onCheckUpdates}
                  disabled={checkUpdatesPending || updateStatusLoading}
                >
                  <RefreshCw
                    className={cn("mr-1.5 h-3.5 w-3.5", (checkUpdatesPending || updateStatusLoading) && "animate-spin")}
                  />
                  Check for updates
                </Button>
                {updateStatus?.supported && updateStatus.hasUpdate && (
                  <Button size="sm" onClick={onInstallUpdate} disabled={installUpdatePending}>
                    <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", installUpdatePending && "animate-spin")} />
                    Install update{latestPin ? ` ${latestPin}` : ""}
                  </Button>
                )}
                {updateStatus?.supported && !updateStatus.hasUpdate && !updateStatusLoading && (
                  <span className="text-xs text-muted-foreground">Up to date</span>
                )}
                {!updateStatus?.supported && updateStatus?.reason && (
                  <span className="text-xs text-muted-foreground">{updateStatus.reason}</span>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Key</span>
              <span className="font-mono text-xs">{detail.key}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Mode</span>
              <span>{detail.editable ? "Editable" : "Read only"}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Used by</span>
            {usedBy.length === 0 ? (
              <span className="text-muted-foreground">No agents attached</span>
            ) : (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {usedBy.map((agent) => (
                  <Link
                    key={agent.id}
                    to={`/agents/${agent.urlKey}/skills`}
                    className="text-foreground no-underline hover:underline"
                  >
                    {agent.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-b border-border px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-mono text-sm">{file?.path ?? "SKILL.md"}</div>
          </div>
          <div className="flex items-center gap-2">
            {file?.markdown && !editMode && (
              <div className="flex items-center border border-border">
                <button
                  type="button"
                  className={cn(
                    "px-3 py-1.5 text-sm",
                    viewMode === "preview" && "text-foreground",
                    viewMode !== "preview" && "text-muted-foreground",
                  )}
                  onClick={() => setViewMode("preview")}
                >
                  <span className="flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </span>
                </button>
                <button
                  type="button"
                  className={cn(
                    "border-l border-border px-3 py-1.5 text-sm",
                    viewMode === "code" && "text-foreground",
                    viewMode !== "code" && "text-muted-foreground",
                  )}
                  onClick={() => setViewMode("code")}
                >
                  <span className="flex items-center gap-1.5">
                    <Code2 className="h-3.5 w-3.5" />
                    Code
                  </span>
                </button>
              </div>
            )}
            {editMode && file?.editable && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setEditMode(false)} disabled={savePending}>
                  Cancel
                </Button>
                <Button size="sm" onClick={onSave} disabled={savePending}>
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  {savePending ? "Saving..." : "Save"}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-[560px] px-5 py-5">
        {fileLoading ? (
          <PageSkeleton variant="detail" />
        ) : !file ? (
          <div className="text-sm text-muted-foreground">Select a file to inspect.</div>
        ) : editMode && file.editable ? (
          file.markdown ? (
            <MarkdownEditor value={draft} onChange={setDraft} bordered={false} className="min-h-[520px]" />
          ) : (
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-h-[520px] rounded-none border-0 bg-transparent px-0 py-0 font-mono text-sm shadow-none focus-visible:ring-0"
            />
          )
        ) : file.markdown && viewMode === "preview" ? (
          <MarkdownBody>{body}</MarkdownBody>
        ) : (
          <pre className="overflow-x-auto whitespace-pre-wrap break-words border-0 bg-transparent p-0 font-mono text-sm text-foreground">
            <code>{file.content}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
