import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useLocation } from "react-router-dom";
import type { Agent } from "@ironworksai/shared";
import { Button } from "@/components/ui/button";
import { CornerDownRight, Paperclip, X } from "lucide-react";
import { InlineEntitySelector, type InlineEntityOption } from "../InlineEntitySelector";
import { MarkdownEditor, type MarkdownEditorRef, type MentionOption } from "../MarkdownEditor";
import { AgentIcon } from "../AgentIconPicker";
import type { CommentWithRunMeta, LinkedRunItem, CommentReassignment } from "./comment-thread-utils";
import {
  useCommentReactions,
  loadDraft,
  saveDraft,
  clearDraft,
  parseReassignment,
  DRAFT_DEBOUNCE_MS,
} from "./comment-thread-utils";
import { TimelineList } from "./CommentCards";
import type { TimelineItem } from "./comment-thread-utils";

interface CommentThreadProps {
  comments: CommentWithRunMeta[];
  linkedRuns?: LinkedRunItem[];
  companyId?: string | null;
  projectId?: string | null;
  onAdd: (body: string, reopen?: boolean, reassignment?: CommentReassignment, replyToId?: string | null) => Promise<void>;
  issueStatus?: string;
  agentMap?: Map<string, Agent>;
  imageUploadHandler?: (file: File) => Promise<string>;
  /** Callback to attach an image file to the parent issue (not inline in a comment). */
  onAttachImage?: (file: File) => Promise<void>;
  draftKey?: string;
  liveRunSlot?: React.ReactNode;
  enableReassign?: boolean;
  reassignOptions?: InlineEntityOption[];
  currentAssigneeValue?: string;
  suggestedAssigneeValue?: string;
  mentions?: MentionOption[];
}

export function CommentThread({
  comments,
  linkedRuns = [],
  companyId,
  projectId,
  onAdd,
  agentMap,
  imageUploadHandler,
  onAttachImage,
  draftKey,
  liveRunSlot,
  enableReassign = false,
  reassignOptions = [],
  currentAssigneeValue = "",
  suggestedAssigneeValue,
  mentions: providedMentions,
}: CommentThreadProps) {
  const { reactions, toggleReaction } = useCommentReactions();
  const [body, setBody] = useState("");
  const [reopen, setReopen] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [pastedImage, setPastedImage] = useState<{ file: File; preview: string } | null>(null);
  const effectiveSuggestedAssigneeValue = suggestedAssigneeValue ?? currentAssigneeValue;
  const [reassignTarget, setReassignTarget] = useState(effectiveSuggestedAssigneeValue);
  const [highlightCommentId, setHighlightCommentId] = useState<string | null>(null);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const editorRef = useRef<MarkdownEditorRef>(null);
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location = useLocation();
  const hasScrolledRef = useRef(false);

  // Separate top-level comments from replies
  const { commentsByParent, topLevelComments } = useMemo(() => {
    const byParent = new Map<string, CommentWithRunMeta[]>();
    const topLevel: CommentWithRunMeta[] = [];
    for (const comment of comments) {
      if (comment.replyToId) {
        const existing = byParent.get(comment.replyToId) ?? [];
        existing.push(comment);
        byParent.set(comment.replyToId, existing);
      } else {
        topLevel.push(comment);
      }
    }
    // Sort replies by creation time
    for (const [, replies] of byParent) {
      replies.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
    return { commentsByParent: byParent, topLevelComments: topLevel };
  }, [comments]);

  // Find the comment being replied to
  const replyToComment = useMemo(() => {
    if (!replyToId) return null;
    return comments.find((c) => c.id === replyToId) ?? null;
  }, [replyToId, comments]);

  const timeline = useMemo<TimelineItem[]>(() => {
    const commentItems: TimelineItem[] = topLevelComments.map((comment) => ({
      kind: "comment",
      id: comment.id,
      createdAtMs: new Date(comment.createdAt).getTime(),
      comment,
    }));
    const runItems: TimelineItem[] = linkedRuns.map((run) => ({
      kind: "run",
      id: run.runId,
      createdAtMs: new Date(run.startedAt ?? run.createdAt).getTime(),
      run,
    }));
    return [...commentItems, ...runItems].sort((a, b) => {
      if (a.createdAtMs !== b.createdAtMs) return a.createdAtMs - b.createdAtMs;
      if (a.kind === b.kind) return a.id.localeCompare(b.id);
      return a.kind === "comment" ? -1 : 1;
    });
  }, [topLevelComments, linkedRuns]);

  // Build mention options from agent map (exclude terminated agents)
  const mentions = useMemo<MentionOption[]>(() => {
    if (providedMentions) return providedMentions;
    if (!agentMap) return [];
    return Array.from(agentMap.values())
      .filter((a) => a.status !== "terminated")
      .map((a) => ({
        id: `agent:${a.id}`,
        name: a.name,
        kind: "agent",
        agentId: a.id,
        agentIcon: a.icon,
      }));
  }, [agentMap, providedMentions]);

  useEffect(() => {
    if (!draftKey) return;
    setBody(loadDraft(draftKey));
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      saveDraft(draftKey, body);
    }, DRAFT_DEBOUNCE_MS);
  }, [body, draftKey]);

  useEffect(() => {
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, []);

  useEffect(() => {
    setReassignTarget(effectiveSuggestedAssigneeValue);
  }, [effectiveSuggestedAssigneeValue]);

  // Scroll to comment when URL hash matches #comment-{id}
  useEffect(() => {
    const hash = location.hash;
    if (!hash.startsWith("#comment-") || comments.length === 0) return;
    const commentId = hash.slice("#comment-".length);
    // Only scroll once per hash
    if (hasScrolledRef.current) return;
    const el = document.getElementById(`comment-${commentId}`);
    if (el) {
      hasScrolledRef.current = true;
      setHighlightCommentId(commentId);
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Clear highlight after animation
      const timer = setTimeout(() => setHighlightCommentId(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [location.hash, comments]);

  async function handleSubmit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    const hasReassignment = enableReassign && reassignTarget !== currentAssigneeValue;
    const reassignment = hasReassignment ? parseReassignment(reassignTarget) : null;

    setSubmitting(true);
    try {
      await onAdd(trimmed, reopen ? true : undefined, reassignment ?? undefined, replyToId);
      setBody("");
      if (draftKey) clearDraft(draftKey);
      setReopen(true);
      setReplyToId(null);
      setReassignTarget(effectiveSuggestedAssigneeValue);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAttachFile(evt: ChangeEvent<HTMLInputElement>) {
    const file = evt.target.files?.[0];
    if (!file) return;
    setAttaching(true);
    try {
      if (imageUploadHandler) {
        const url = await imageUploadHandler(file);
        const safeName = file.name.replace(/[[\]]/g, "\\$&");
        const markdown = `![${safeName}](${url})`;
        setBody((prev) => prev ? `${prev}\n\n${markdown}` : markdown);
      } else if (onAttachImage) {
        await onAttachImage(file);
      }
    } finally {
      setAttaching(false);
      if (attachInputRef.current) attachInputRef.current.value = "";
    }
  }

  // Paste image handler: detect paste event with image data
  async function handlePaste(e: { clipboardData: DataTransfer | null; preventDefault: () => void }) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const preview = URL.createObjectURL(file);
        setPastedImage({ file, preview });
        return;
      }
    }
  }

  async function handlePastedImageAttach() {
    if (!pastedImage) return;
    setAttaching(true);
    try {
      if (imageUploadHandler) {
        const url = await imageUploadHandler(pastedImage.file);
        const markdown = `![pasted image](${url})`;
        setBody((prev) => prev ? `${prev}\n\n${markdown}` : markdown);
      } else if (onAttachImage) {
        await onAttachImage(pastedImage.file);
      }
    } finally {
      setAttaching(false);
      URL.revokeObjectURL(pastedImage.preview);
      setPastedImage(null);
    }
  }

  function dismissPastedImage() {
    if (pastedImage) {
      URL.revokeObjectURL(pastedImage.preview);
      setPastedImage(null);
    }
  }

  const canSubmit = !submitting && !!body.trim();

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Comments &amp; Runs ({timeline.length})</h3>

      <TimelineList
        timeline={timeline}
        agentMap={agentMap}
        companyId={companyId}
        projectId={projectId}
        highlightCommentId={highlightCommentId}
        reactions={reactions}
        onToggleReaction={toggleReaction}
        onReply={(commentId) => {
          setReplyToId(commentId);
          editorRef.current?.focus();
        }}
        commentsByParent={commentsByParent}
      />

      {liveRunSlot}

      <div className="space-y-2" onPaste={handlePaste}>
        {replyToComment && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
            <CornerDownRight className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">
              Replying to{" "}
              <span className="font-medium text-foreground">
                {replyToComment.authorAgentId
                  ? (agentMap?.get(replyToComment.authorAgentId)?.name ?? "Agent")
                  : "You"}
              </span>
            </span>
            <span className="flex-1 truncate text-muted-foreground">
              {replyToComment.body.slice(0, 80)}{replyToComment.body.length > 80 ? "..." : ""}
            </span>
            <button
              type="button"
              onClick={() => setReplyToId(null)}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              title="Cancel reply"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <MarkdownEditor
          ref={editorRef}
          value={body}
          onChange={setBody}
          placeholder={replyToId ? "Write a reply..." : "Leave a comment..."}
          mentions={mentions}
          onSubmit={handleSubmit}
          imageUploadHandler={imageUploadHandler}
          contentClassName="min-h-[60px] text-sm"
        />
        {/* Pasted image preview */}
        {pastedImage && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-2">
            <img src={pastedImage.preview} alt="Pasted" className="h-16 w-16 object-cover rounded" />
            <div className="flex-1 text-xs text-muted-foreground">
              <p>Image pasted from clipboard</p>
              <p className="text-[10px]">{pastedImage.file.name} ({(pastedImage.file.size / 1024).toFixed(1)} KB)</p>
            </div>
            <Button variant="outline" size="sm" onClick={handlePastedImageAttach} disabled={attaching}>
              {attaching ? "Uploading..." : "Attach"}
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={dismissPastedImage}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        <div className="flex items-center justify-end gap-3">
          {(imageUploadHandler || onAttachImage) && (
            <div className="mr-auto flex items-center gap-3">
              <input
                ref={attachInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleAttachFile}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => attachInputRef.current?.click()}
                disabled={attaching}
                title="Attach image"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
            </div>
          )}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={reopen}
              onChange={(e) => setReopen(e.target.checked)}
              className="rounded border-border"
            />
            Re-open
          </label>
          {enableReassign && reassignOptions.length > 0 && (
            <InlineEntitySelector
              value={reassignTarget}
              options={reassignOptions}
              placeholder="Assignee"
              noneLabel="No assignee"
              searchPlaceholder="Search assignees..."
              emptyMessage="No assignees found."
              onChange={setReassignTarget}
              className="text-xs h-8"
              renderTriggerValue={(option) => {
                if (!option) return <span className="text-muted-foreground">Assignee</span>;
                const agentId = option.id.startsWith("agent:") ? option.id.slice("agent:".length) : null;
                const agent = agentId ? agentMap?.get(agentId) : null;
                return (
                  <>
                    {agent ? (
                      <AgentIcon icon={agent.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : null}
                    <span className="truncate">{option.label}</span>
                  </>
                );
              }}
              renderOption={(option) => {
                if (!option.id) return <span className="truncate">{option.label}</span>;
                const agentId = option.id.startsWith("agent:") ? option.id.slice("agent:".length) : null;
                const agent = agentId ? agentMap?.get(agentId) : null;
                return (
                  <>
                    {agent ? (
                      <AgentIcon icon={agent.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : null}
                    <span className="truncate">{option.label}</span>
                  </>
                );
              }}
            />
          )}
          <Button size="sm" disabled={!canSubmit} onClick={handleSubmit}>
            {submitting ? "Posting..." : replyToId ? "Reply" : "Comment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
