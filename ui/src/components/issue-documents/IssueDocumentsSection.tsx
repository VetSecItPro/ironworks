import type { Issue } from "@ironworksai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "@/lib/router";
import { ApiError } from "../../api/client";
import { issuesApi } from "../../api/issues";
import { useAutosaveIndicator } from "../../hooks/useAutosaveIndicator";
import { queryKeys } from "../../lib/queryKeys";
import { cn } from "../../lib/utils";
import { MarkdownBody } from "../MarkdownBody";
import { MarkdownEditor, type MentionOption } from "../MarkdownEditor";
import { DocumentCard } from "./DocumentCard";
import type { DocumentConflictState, DraftState } from "./types";
import {
  DOCUMENT_AUTOSAVE_DEBOUNCE_MS,
  DOCUMENT_KEY_PATTERN,
  isPlanKey,
  loadFoldedDocumentKeys,
  saveFoldedDocumentKeys,
} from "./types";

function isDocumentConflictError(error: unknown) {
  return error instanceof ApiError && error.status === 409;
}

function renderBody(body: string, className?: string) {
  return <MarkdownBody className={className}>{body}</MarkdownBody>;
}

export function IssueDocumentsSection({
  issue,
  canDeleteDocuments,
  mentions,
  imageUploadHandler,
  extraActions,
}: {
  issue: Issue;
  canDeleteDocuments: boolean;
  mentions?: MentionOption[];
  imageUploadHandler?: (file: File) => Promise<string>;
  extraActions?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [documentConflict, setDocumentConflict] = useState<DocumentConflictState | null>(null);
  const [foldedDocumentKeys, setFoldedDocumentKeys] = useState<string[]>(() => loadFoldedDocumentKeys(issue.id));
  const [autosaveDocumentKey, setAutosaveDocumentKey] = useState<string | null>(null);
  const [copiedDocumentKey, setCopiedDocumentKey] = useState<string | null>(null);
  const [highlightDocumentKey, setHighlightDocumentKey] = useState<string | null>(null);
  const autosaveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedDocumentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasScrolledToHashRef = useRef(false);
  const { state: autosaveState, markDirty, reset, runSave } = useAutosaveIndicator();

  const { data: documents } = useQuery({
    queryKey: queryKeys.issues.documents(issue.id),
    queryFn: () => issuesApi.listDocuments(issue.id),
  });

  const invalidateIssueDocuments = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issue.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.documents(issue.id) });
  };

  const upsertDocument = useMutation({
    mutationFn: async (nextDraft: DraftState) =>
      issuesApi.upsertDocument(issue.id, nextDraft.key, {
        title: isPlanKey(nextDraft.key) ? null : nextDraft.title.trim() || null,
        format: "markdown",
        body: nextDraft.body,
        baseRevisionId: nextDraft.baseRevisionId,
      }),
  });

  const deleteDocument = useMutation({
    mutationFn: (key: string) => issuesApi.deleteDocument(issue.id, key),
    onSuccess: () => {
      setError(null);
      setConfirmDeleteKey(null);
      invalidateIssueDocuments();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to delete document");
    },
  });

  const sortedDocuments = useMemo(() => {
    return [...(documents ?? [])].sort((a, b) => {
      if (a.key === "plan" && b.key !== "plan") return -1;
      if (a.key !== "plan" && b.key === "plan") return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [documents]);

  const hasRealPlan = sortedDocuments.some((doc) => doc.key === "plan");
  const isEmpty = sortedDocuments.length === 0 && !issue.legacyPlanDocument;
  const newDocumentKeyError =
    draft?.isNew && draft.key.trim().length > 0 && !DOCUMENT_KEY_PATTERN.test(draft.key.trim())
      ? "Use lowercase letters, numbers, -, or _, and start with a letter or number."
      : null;

  const resetAutosaveState = useCallback(() => {
    setAutosaveDocumentKey(null);
    reset();
  }, [reset]);

  const markDocumentDirty = useCallback(
    (key: string) => {
      setAutosaveDocumentKey(key);
      markDirty();
    },
    [markDirty],
  );

  const beginNewDocument = () => {
    resetAutosaveState();
    setDocumentConflict(null);
    setDraft({ key: "", title: "", body: "", baseRevisionId: null, isNew: true });
    setError(null);
  };

  const beginEdit = (key: string) => {
    const doc = sortedDocuments.find((entry) => entry.key === key);
    if (!doc) return;
    const conflictedDraft = documentConflict?.key === key ? documentConflict.localDraft : null;
    setFoldedDocumentKeys((current) => current.filter((entry) => entry !== key));
    resetAutosaveState();
    setDocumentConflict((current) => (current?.key === key ? current : null));
    setDraft({
      key: conflictedDraft?.key ?? doc.key,
      title: conflictedDraft?.title ?? doc.title ?? "",
      body: conflictedDraft?.body ?? doc.body,
      baseRevisionId: conflictedDraft?.baseRevisionId ?? doc.latestRevisionId,
      isNew: false,
    });
    setError(null);
  };

  const cancelDraft = () => {
    if (autosaveDebounceRef.current) clearTimeout(autosaveDebounceRef.current);
    resetAutosaveState();
    setDocumentConflict(null);
    setDraft(null);
    setError(null);
  };

  const commitDraft = useCallback(
    async (
      currentDraft: DraftState | null,
      options?: { clearAfterSave?: boolean; trackAutosave?: boolean; overrideConflict?: boolean },
    ) => {
      if (!currentDraft || upsertDocument.isPending) return false;
      const normalizedKey = currentDraft.key.trim().toLowerCase();
      const normalizedBody = currentDraft.body.trim();
      const normalizedTitle = currentDraft.title.trim();
      const activeConflict = documentConflict?.key === normalizedKey ? documentConflict : null;

      if (activeConflict && !options?.overrideConflict) {
        if (options?.trackAutosave) resetAutosaveState();
        return false;
      }

      if (!normalizedKey || !normalizedBody) {
        if (currentDraft.isNew) setError("Document key and body are required");
        else if (!normalizedBody) setError("Document body cannot be empty");
        if (options?.trackAutosave) resetAutosaveState();
        return false;
      }

      if (!DOCUMENT_KEY_PATTERN.test(normalizedKey)) {
        setError("Document key must start with a letter or number and use only lowercase letters, numbers, -, or _.");
        if (options?.trackAutosave) resetAutosaveState();
        return false;
      }

      const existing = sortedDocuments.find((doc) => doc.key === normalizedKey);
      if (
        !currentDraft.isNew &&
        existing &&
        existing.body === currentDraft.body &&
        (existing.title ?? "") === currentDraft.title
      ) {
        if (options?.clearAfterSave) setDraft((value) => (value?.key === normalizedKey ? null : value));
        if (options?.trackAutosave) resetAutosaveState();
        return true;
      }

      const save = async () => {
        const saved = await upsertDocument.mutateAsync({
          ...currentDraft,
          key: normalizedKey,
          title: isPlanKey(normalizedKey) ? "" : normalizedTitle,
          body: currentDraft.body,
          baseRevisionId: options?.overrideConflict
            ? (activeConflict?.serverDocument.latestRevisionId ?? currentDraft.baseRevisionId)
            : currentDraft.baseRevisionId,
        });
        setError(null);
        setDocumentConflict((current) => (current?.key === normalizedKey ? null : current));
        setDraft((value) => {
          if (!value || value.key !== normalizedKey) return value;
          if (options?.clearAfterSave) return null;
          return {
            key: saved.key,
            title: saved.title ?? "",
            body: saved.body,
            baseRevisionId: saved.latestRevisionId,
            isNew: false,
          };
        });
        invalidateIssueDocuments();
      };

      try {
        if (options?.trackAutosave) {
          setAutosaveDocumentKey(normalizedKey);
          await runSave(save);
        } else {
          await save();
        }
        return true;
      } catch (err) {
        if (isDocumentConflictError(err)) {
          try {
            const latestDocument = await issuesApi.getDocument(issue.id, normalizedKey);
            setDocumentConflict({
              key: normalizedKey,
              serverDocument: latestDocument,
              localDraft: {
                key: normalizedKey,
                title: isPlanKey(normalizedKey) ? "" : normalizedTitle,
                body: currentDraft.body,
                baseRevisionId: currentDraft.baseRevisionId,
                isNew: false,
              },
              showRemote: true,
            });
            setFoldedDocumentKeys((current) => current.filter((key) => key !== normalizedKey));
            setError(null);
            resetAutosaveState();
            return false;
          } catch {
            setError("Document changed remotely and the latest version could not be loaded");
            return false;
          }
        }
        setError(err instanceof Error ? err.message : "Failed to save document");
        return false;
      }
    },
    [
      documentConflict,
      invalidateIssueDocuments,
      issue.id,
      resetAutosaveState,
      runSave,
      sortedDocuments,
      upsertDocument,
    ],
  );

  const reloadDocumentFromServer = useCallback(
    (key: string) => {
      if (documentConflict?.key !== key) return;
      const serverDocument = documentConflict.serverDocument;
      setDraft({
        key: serverDocument.key,
        title: serverDocument.title ?? "",
        body: serverDocument.body,
        baseRevisionId: serverDocument.latestRevisionId,
        isNew: false,
      });
      setDocumentConflict(null);
      resetAutosaveState();
      setError(null);
    },
    [documentConflict, resetAutosaveState],
  );

  const overwriteDocumentFromDraft = useCallback(
    async (key: string) => {
      if (documentConflict?.key !== key) return;
      const sourceDraft = draft && draft.key === key && !draft.isNew ? draft : documentConflict.localDraft;
      await commitDraft(
        { ...sourceDraft, baseRevisionId: documentConflict.serverDocument.latestRevisionId },
        { clearAfterSave: false, trackAutosave: true, overrideConflict: true },
      );
    },
    [commitDraft, documentConflict, draft],
  );

  const keepConflictedDraft = useCallback(
    (key: string) => {
      if (documentConflict?.key !== key) return;
      setDraft(documentConflict.localDraft);
      setDocumentConflict((current) => (current?.key === key ? { ...current, showRemote: false } : current));
      setError(null);
    },
    [documentConflict],
  );

  const copyDocumentBody = useCallback(async (key: string, body: string) => {
    try {
      await navigator.clipboard.writeText(body);
      setCopiedDocumentKey(key);
      if (copiedDocumentTimerRef.current) clearTimeout(copiedDocumentTimerRef.current);
      copiedDocumentTimerRef.current = setTimeout(() => {
        setCopiedDocumentKey((current) => (current === key ? null : current));
      }, 1400);
    } catch {
      setError("Could not copy document");
    }
  }, []);

  const handleDraftBlur = async (event: React.FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    if (autosaveDebounceRef.current) clearTimeout(autosaveDebounceRef.current);
    await commitDraft(draft, { clearAfterSave: true, trackAutosave: true });
  };

  const handleDraftKeyDown = async (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelDraft();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (autosaveDebounceRef.current) clearTimeout(autosaveDebounceRef.current);
      await commitDraft(draft, { clearAfterSave: false, trackAutosave: true });
    }
  };

  // Effects
  useEffect(() => {
    setFoldedDocumentKeys(loadFoldedDocumentKeys(issue.id));
  }, [issue.id]);
  useEffect(() => {
    hasScrolledToHashRef.current = false;
  }, [issue.id, location.hash]);

  useEffect(() => {
    const validKeys = new Set(sortedDocuments.map((doc) => doc.key));
    setFoldedDocumentKeys((current) => {
      const next = current.filter((key) => validKeys.has(key));
      if (next.length !== current.length) saveFoldedDocumentKeys(issue.id, next);
      return next;
    });
  }, [issue.id, sortedDocuments]);

  useEffect(() => {
    saveFoldedDocumentKeys(issue.id, foldedDocumentKeys);
  }, [foldedDocumentKeys, issue.id]);

  useEffect(() => {
    if (!documentConflict) return;
    const latest = sortedDocuments.find((doc) => doc.key === documentConflict.key);
    if (!latest || latest.latestRevisionId === documentConflict.serverDocument.latestRevisionId) return;
    setDocumentConflict((current) => (current?.key === latest.key ? { ...current, serverDocument: latest } : current));
  }, [documentConflict, sortedDocuments]);

  useEffect(() => {
    const hash = location.hash;
    if (!hash.startsWith("#document-")) return;
    const documentKey = decodeURIComponent(hash.slice("#document-".length));
    const targetExists =
      sortedDocuments.some((doc) => doc.key === documentKey) ||
      (documentKey === "plan" && Boolean(issue.legacyPlanDocument));
    if (!targetExists || hasScrolledToHashRef.current) return;
    setFoldedDocumentKeys((current) => current.filter((key) => key !== documentKey));
    const element = document.getElementById(`document-${documentKey}`);
    if (!element) return;
    hasScrolledToHashRef.current = true;
    setHighlightDocumentKey(documentKey);
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = setTimeout(
      () => setHighlightDocumentKey((current) => (current === documentKey ? null : current)),
      3000,
    );
    return () => clearTimeout(timer);
  }, [issue.legacyPlanDocument, location.hash, sortedDocuments]);

  useEffect(() => {
    return () => {
      if (autosaveDebounceRef.current) clearTimeout(autosaveDebounceRef.current);
      if (copiedDocumentTimerRef.current) clearTimeout(copiedDocumentTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!draft || draft.isNew) return;
    if (documentConflict?.key === draft.key) return;
    const existing = sortedDocuments.find((doc) => doc.key === draft.key);
    if (!existing) return;
    const hasChanges = existing.body !== draft.body || (existing.title ?? "") !== draft.title;
    if (!hasChanges) {
      if (autosaveState !== "saved") resetAutosaveState();
      return;
    }
    markDocumentDirty(draft.key);
    if (autosaveDebounceRef.current) clearTimeout(autosaveDebounceRef.current);
    autosaveDebounceRef.current = setTimeout(() => {
      void commitDraft(draft, { clearAfterSave: false, trackAutosave: true });
    }, DOCUMENT_AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveDebounceRef.current) clearTimeout(autosaveDebounceRef.current);
    };
  }, [autosaveState, commitDraft, documentConflict, draft, markDocumentDirty, resetAutosaveState, sortedDocuments]);

  const toggleFoldedDocument = (key: string) => {
    setFoldedDocumentKeys((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    );
  };

  return (
    <div className="space-y-3">
      {isEmpty && !draft?.isNew ? (
        <div className="flex items-center justify-end gap-2 min-w-0">
          {extraActions}
          <Button variant="outline" size="sm" onClick={beginNewDocument} className="shrink-0">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">New document</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 min-w-0">
          <h3 className="text-sm font-medium text-muted-foreground shrink-0">Documents</h3>
          <div className="flex items-center gap-2 min-w-0">
            {extraActions}
            <Button variant="outline" size="sm" onClick={beginNewDocument} className="shrink-0">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              <span className="hidden sm:inline">New document</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {draft?.isNew && (
        <div
          className="space-y-3 rounded-lg border border-border bg-accent/10 p-3"
          onBlurCapture={handleDraftBlur}
          onKeyDown={handleDraftKeyDown}
        >
          <Input
            autoFocus
            value={draft.key}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, key: event.target.value.toLowerCase() } : current))
            }
            placeholder="Document key"
          />
          {newDocumentKeyError && <p className="text-xs text-destructive">{newDocumentKeyError}</p>}
          {!isPlanKey(draft.key) && (
            <Input
              value={draft.title}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, title: event.target.value } : current))
              }
              placeholder="Optional title"
            />
          )}
          <MarkdownEditor
            value={draft.body}
            onChange={(body) => setDraft((current) => (current ? { ...current, body } : current))}
            placeholder="Markdown body"
            bordered={false}
            className="bg-transparent"
            contentClassName="min-h-[220px] text-[15px] leading-7"
            mentions={mentions}
            imageUploadHandler={imageUploadHandler}
            onSubmit={() => void commitDraft(draft, { clearAfterSave: false, trackAutosave: false })}
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={cancelDraft}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void commitDraft(draft, { clearAfterSave: false, trackAutosave: false })}
              disabled={upsertDocument.isPending}
            >
              {upsertDocument.isPending ? "Saving..." : "Create document"}
            </Button>
          </div>
        </div>
      )}

      {!hasRealPlan && issue.legacyPlanDocument ? (
        <div
          id="document-plan"
          className={cn(
            "rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 transition-colors duration-1000",
            highlightDocumentKey === "plan" && "border-primary/50 bg-primary/5",
          )}
        >
          <div className="mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4 text-amber-600" />
            <span className="rounded-full border border-amber-500/30 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
              PLAN
            </span>
          </div>
          <div>
            {renderBody(
              issue.legacyPlanDocument.body,
              "ironworks-edit-in-place-content min-h-[220px] text-[15px] leading-7",
            )}
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {sortedDocuments.map((doc) => {
          const activeDraft = draft?.key === doc.key && !draft.isNew ? draft : null;
          const activeConflict = documentConflict?.key === doc.key ? documentConflict : null;
          const isFolded = foldedDocumentKeys.includes(doc.key);

          return (
            <DocumentCard
              key={doc.id}
              doc={doc}
              activeDraft={activeDraft}
              activeConflict={activeConflict}
              isFolded={isFolded}
              highlightDocumentKey={highlightDocumentKey}
              copiedDocumentKey={copiedDocumentKey}
              autosaveDocumentKey={autosaveDocumentKey}
              autosaveState={autosaveState}
              canDeleteDocuments={canDeleteDocuments}
              confirmDeleteKey={confirmDeleteKey}
              deletePending={deleteDocument.isPending}
              upsertPending={upsertDocument.isPending}
              mentions={mentions}
              imageUploadHandler={imageUploadHandler}
              onToggleFold={toggleFoldedDocument}
              onCopyBody={(key, body) => void copyDocumentBody(key, body)}
              onSetConfirmDelete={setConfirmDeleteKey}
              onDelete={(key) => deleteDocument.mutate(key)}
              onBeginEdit={beginEdit}
              onDraftBlur={handleDraftBlur}
              onDraftKeyDown={handleDraftKeyDown}
              onTitleChange={(title) => setDraft((current) => (current ? { ...current, title } : current))}
              onBodyChange={(key, body, docTitle, docRevisionId) => {
                setDraft((current) => {
                  if (current && current.key === key && !current.isNew) return { ...current, body };
                  return { key, title: docTitle, body, baseRevisionId: docRevisionId, isNew: false };
                });
              }}
              onSubmit={() => void commitDraft(activeDraft ?? draft, { clearAfterSave: false, trackAutosave: true })}
              onMarkDirty={markDocumentDirty}
              onToggleRemoteView={(key) =>
                setDocumentConflict((current) =>
                  current?.key === key ? { ...current, showRemote: !current.showRemote } : current,
                )
              }
              onKeepDraft={keepConflictedDraft}
              onReloadRemote={reloadDocumentFromServer}
              onOverwrite={(key) => void overwriteDocumentFromDraft(key)}
            />
          );
        })}
      </div>
    </div>
  );
}
