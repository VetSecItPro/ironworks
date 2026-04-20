import type { IssueDocument } from "@ironworksai/shared";
import { Check, ChevronDown, ChevronRight, Copy, Download, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn, relativeTime } from "../../lib/utils";
import { MarkdownBody } from "../MarkdownBody";
import { MarkdownEditor, type MentionOption } from "../MarkdownEditor";

import type { DocumentConflictState, DraftState } from "./types";
import { downloadDocumentFile, isPlanKey, titlesMatchKey } from "./types";

function renderBody(body: string, className?: string) {
  return <MarkdownBody className={className}>{body}</MarkdownBody>;
}

interface DocumentCardProps {
  doc: IssueDocument;
  activeDraft: DraftState | null;
  activeConflict: DocumentConflictState | null;
  isFolded: boolean;
  highlightDocumentKey: string | null;
  copiedDocumentKey: string | null;
  autosaveDocumentKey: string | null;
  autosaveState: string;
  canDeleteDocuments: boolean;
  confirmDeleteKey: string | null;
  deletePending: boolean;
  upsertPending: boolean;
  mentions?: MentionOption[];
  imageUploadHandler?: (file: File) => Promise<string>;

  onToggleFold: (key: string) => void;
  onCopyBody: (key: string, body: string) => void;
  onSetConfirmDelete: (key: string | null) => void;
  onDelete: (key: string) => void;
  onBeginEdit: (key: string) => void;
  onDraftBlur: (event: React.FocusEvent<HTMLDivElement>) => void;
  onDraftKeyDown: (event: React.KeyboardEvent) => void;
  onTitleChange: (title: string) => void;
  onBodyChange: (key: string, body: string, docTitle: string, docRevisionId: string) => void;
  onSubmit: () => void;
  onMarkDirty: (key: string) => void;

  // Conflict resolution
  onToggleRemoteView: (key: string) => void;
  onKeepDraft: (key: string) => void;
  onReloadRemote: (key: string) => void;
  onOverwrite: (key: string) => void;
}

const documentBodyShellClassName = "mt-3 overflow-hidden rounded-md";
const documentBodyPaddingClassName = "";
const documentBodyContentClassName = "ironworks-edit-in-place-content min-h-[220px] text-[15px] leading-7";

export function DocumentCard({
  doc,
  activeDraft,
  activeConflict,
  isFolded,
  highlightDocumentKey,
  copiedDocumentKey,
  autosaveDocumentKey,
  autosaveState,
  canDeleteDocuments,
  confirmDeleteKey,
  deletePending,
  upsertPending,
  mentions,
  imageUploadHandler,
  onToggleFold,
  onCopyBody,
  onSetConfirmDelete,
  onDelete,
  onBeginEdit,
  onDraftBlur,
  onDraftKeyDown,
  onTitleChange,
  onBodyChange,
  onSubmit,
  onMarkDirty,
  onToggleRemoteView,
  onKeepDraft,
  onReloadRemote,
  onOverwrite,
}: DocumentCardProps) {
  const showTitle = !isPlanKey(doc.key) && !!doc.title?.trim() && !titlesMatchKey(doc.title, doc.key);

  return (
    <div
      id={`document-${doc.key}`}
      className={cn(
        "rounded-lg border border-border p-3 transition-colors duration-1000",
        highlightDocumentKey === doc.key && "border-primary/50 bg-primary/5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              onClick={() => onToggleFold(doc.key)}
              aria-label={isFolded ? `Expand ${doc.key} document` : `Collapse ${doc.key} document`}
              aria-expanded={!isFolded}
            >
              {isFolded ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {doc.key}
            </span>
            <a
              href={`#document-${encodeURIComponent(doc.key)}`}
              className="truncate text-[11px] text-muted-foreground transition-colors hover:text-foreground hover:underline"
            >
              rev {doc.latestRevisionNumber} • updated {relativeTime(doc.updatedAt)}
            </a>
          </div>
          {showTitle && <p className="mt-2 text-sm font-medium">{doc.title}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn(
              "text-muted-foreground transition-colors",
              copiedDocumentKey === doc.key && "text-foreground",
            )}
            title={copiedDocumentKey === doc.key ? "Copied" : "Copy document"}
            onClick={() => onCopyBody(doc.key, activeDraft?.body ?? doc.body)}
          >
            {copiedDocumentKey === doc.key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" className="text-muted-foreground" title="Document actions">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => downloadDocumentFile(doc.key, activeDraft?.body ?? doc.body)}>
                <Download className="h-3.5 w-3.5" />
                Download document
              </DropdownMenuItem>
              {canDeleteDocuments ? <DropdownMenuSeparator /> : null}
              {canDeleteDocuments ? (
                <DropdownMenuItem variant="destructive" onClick={() => onSetConfirmDelete(doc.key)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete document
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {!isFolded ? (
        <div
          className="mt-3 space-y-3"
          onFocusCapture={() => {
            if (!activeDraft) {
              onBeginEdit(doc.key);
            }
          }}
          onBlurCapture={async (event) => {
            if (activeDraft) {
              await onDraftBlur(event);
            }
          }}
          onKeyDown={async (event) => {
            if (activeDraft) {
              await onDraftKeyDown(event);
            }
          }}
        >
          {activeConflict && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-amber-200">Out of date</p>
                  <p className="text-xs text-muted-foreground">
                    This document changed while you were editing. Your local draft is preserved and autosave is paused.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => onToggleRemoteView(doc.key)}>
                    {activeConflict.showRemote ? "Hide remote" : "Review remote"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onKeepDraft(doc.key)}>
                    Keep my draft
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onReloadRemote(doc.key)}>
                    Reload remote
                  </Button>
                  <Button size="sm" onClick={() => onOverwrite(doc.key)} disabled={upsertPending}>
                    {upsertPending ? "Saving..." : "Overwrite remote"}
                  </Button>
                </div>
              </div>
              {activeConflict.showRemote && (
                <div className="mt-3 rounded-md border border-border/70 bg-background/60 p-3">
                  <div className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>Remote revision {activeConflict.serverDocument.latestRevisionNumber}</span>
                    <span>•</span>
                    <span>updated {relativeTime(activeConflict.serverDocument.updatedAt)}</span>
                  </div>
                  {!isPlanKey(doc.key) && activeConflict.serverDocument.title ? (
                    <p className="mb-2 text-sm font-medium">{activeConflict.serverDocument.title}</p>
                  ) : null}
                  {renderBody(activeConflict.serverDocument.body, "text-[14px] leading-7")}
                </div>
              )}
            </div>
          )}
          {activeDraft && !isPlanKey(doc.key) && (
            <Input
              value={activeDraft.title}
              onChange={(event) => {
                onMarkDirty(doc.key);
                onTitleChange(event.target.value);
              }}
              placeholder="Optional title"
            />
          )}
          <div
            className={`${documentBodyShellClassName} ${documentBodyPaddingClassName} ${
              activeDraft ? "" : "hover:bg-accent/10"
            }`}
          >
            <MarkdownEditor
              value={activeDraft?.body ?? doc.body}
              onChange={(body) => {
                onMarkDirty(doc.key);
                onBodyChange(doc.key, body, doc.title ?? "", doc.latestRevisionId ?? "");
              }}
              placeholder="Markdown body"
              bordered={false}
              className="bg-transparent"
              contentClassName={documentBodyContentClassName}
              mentions={mentions}
              imageUploadHandler={imageUploadHandler}
              onSubmit={onSubmit}
            />
          </div>
          <div className="flex min-h-4 items-center justify-end px-1">
            <span
              className={`text-[11px] transition-opacity duration-150 ${
                activeConflict
                  ? "text-amber-300"
                  : autosaveState === "error"
                    ? "text-destructive"
                    : "text-muted-foreground"
              } ${activeDraft ? "opacity-100" : "opacity-0"}`}
            >
              {activeDraft
                ? activeConflict
                  ? "Out of date"
                  : autosaveDocumentKey === doc.key
                    ? autosaveState === "saving"
                      ? "Autosaving..."
                      : autosaveState === "saved"
                        ? "Saved"
                        : autosaveState === "error"
                          ? "Could not save"
                          : ""
                    : ""
                : ""}
            </span>
          </div>
        </div>
      ) : null}

      {confirmDeleteKey === doc.key && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive font-medium">Delete this document? This cannot be undone.</p>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => onSetConfirmDelete(null)} disabled={deletePending}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={() => onDelete(doc.key)} disabled={deletePending}>
              {deletePending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
