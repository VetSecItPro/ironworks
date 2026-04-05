import { memo, useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MarkdownEditor, type MarkdownEditorRef } from "./MarkdownEditor";
import {
  Edit3,
  History,
  MessageSquareQuote,
  MoreHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { cn, formatDateTime } from "../lib/utils";

// ---------------------------------------------------------------------------
// Comment Edit/Delete with history
// ---------------------------------------------------------------------------

export interface CommentEdit {
  body: string;
  editedAt: string;
  editedBy: string;
}

const EDIT_HISTORY_KEY = "ironworks:comment-edit-history";

function loadEditHistory(): Record<string, CommentEdit[]> {
  try {
    const raw = localStorage.getItem(EDIT_HISTORY_KEY);
    if (raw) return JSON.parse(raw) as Record<string, CommentEdit[]>;
  } catch { /* ignore */ }
  return {};
}

function saveEditHistory(history: Record<string, CommentEdit[]>) {
  try {
    localStorage.setItem(EDIT_HISTORY_KEY, JSON.stringify(history));
  } catch { /* ignore */ }
}

export function addEditHistoryEntry(commentId: string, previousBody: string) {
  const history = loadEditHistory();
  if (!history[commentId]) history[commentId] = [];
  history[commentId].push({
    body: previousBody,
    editedAt: new Date().toISOString(),
    editedBy: "You",
  });
  saveEditHistory(history);
}

export function getEditHistory(commentId: string): CommentEdit[] {
  const history = loadEditHistory();
  return history[commentId] ?? [];
}

// ---------------------------------------------------------------------------
// Inline Edit Component
// ---------------------------------------------------------------------------

interface InlineEditProps {
  commentId: string;
  initialBody: string;
  onSave: (commentId: string, newBody: string) => void;
  onCancel: () => void;
}

export function InlineCommentEdit({ commentId, initialBody, onSave, onCancel }: InlineEditProps) {
  const [body, setBody] = useState(initialBody);
  const editorRef = useRef<MarkdownEditorRef>(null);

  function handleSave() {
    const trimmed = body.trim();
    if (!trimmed || trimmed === initialBody) {
      onCancel();
      return;
    }
    addEditHistoryEntry(commentId, initialBody);
    onSave(commentId, trimmed);
  }

  return (
    <div className="space-y-2">
      <MarkdownEditor
        ref={editorRef}
        value={body}
        onChange={setBody}
        placeholder="Edit comment..."
        onSubmit={handleSave}
        contentClassName="min-h-[60px] text-sm"
      />
      <div className="flex items-center gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel} className="h-7 text-xs">
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} className="h-7 text-xs" disabled={!body.trim()}>
          Save edit
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit History Viewer
// ---------------------------------------------------------------------------

interface EditHistoryViewerProps {
  commentId: string;
  open: boolean;
  onClose: () => void;
}

export function EditHistoryViewer({ commentId, open, onClose }: EditHistoryViewerProps) {
  const history = getEditHistory(commentId);

  if (!open) return null;

  return (
    <div className="mt-2 rounded-md border border-border bg-muted/30 p-3 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 font-medium text-muted-foreground">
          <History className="h-3 w-3" />
          Edit history ({history.length} revision{history.length !== 1 ? "s" : ""})
        </div>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-3 w-3" />
        </button>
      </div>
      {history.length === 0 ? (
        <p className="text-muted-foreground">No edit history</p>
      ) : (
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {history.map((entry, i) => (
            <div key={i} className="border-l-2 border-border pl-2 py-1">
              <div className="text-muted-foreground">
                {entry.editedBy} - {formatDateTime(entry.editedAt)}
              </div>
              <div className="mt-0.5 whitespace-pre-wrap text-foreground/70">{entry.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comment Action Menu
// ---------------------------------------------------------------------------

interface CommentActionMenuProps {
  commentId: string;
  commentBody: string;
  isOwn: boolean;
  onEdit: () => void;
  onDelete: (commentId: string) => void;
  onQuoteReply: (text: string) => void;
  onViewHistory: () => void;
}

export const CommentActionMenu = memo(function CommentActionMenu({
  commentId,
  commentBody,
  isOwn,
  onEdit,
  onDelete,
  onQuoteReply,
  onViewHistory,
}: CommentActionMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
        aria-label="Comment actions"
      >
        <MoreHorizontal className="h-3 w-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-md border border-border bg-popover p-1 shadow-md">
            <button
              type="button"
              onClick={() => { onQuoteReply(commentBody); close(); }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent transition-colors"
            >
              <MessageSquareQuote className="h-3 w-3" />
              Quote reply
            </button>
            {isOwn && (
              <>
                <button
                  type="button"
                  onClick={() => { onEdit(); close(); }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent transition-colors"
                >
                  <Edit3 className="h-3 w-3" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => { onDelete(commentId); close(); }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => { onViewHistory(); close(); }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent transition-colors"
            >
              <History className="h-3 w-3" />
              View edit history
            </button>
          </div>
        </>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Watching Toggle
// ---------------------------------------------------------------------------

const WATCHING_KEY = "ironworks:watching";

function loadWatching(): Set<string> {
  try {
    const raw = localStorage.getItem(WATCHING_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}

function saveWatching(watching: Set<string>) {
  try {
    localStorage.setItem(WATCHING_KEY, JSON.stringify([...watching]));
  } catch { /* ignore */ }
}

export function useWatching(entityId: string) {
  const [watching, setWatching] = useState(() => loadWatching().has(entityId));

  const toggle = useCallback(() => {
    const current = loadWatching();
    if (current.has(entityId)) {
      current.delete(entityId);
    } else {
      current.add(entityId);
    }
    saveWatching(current);
    setWatching(current.has(entityId));
  }, [entityId]);

  return { watching, toggle };
}

interface WatchingToggleProps {
  entityId: string;
  className?: string;
}

export function WatchingToggle({ entityId, className }: WatchingToggleProps) {
  const { watching, toggle } = useWatching(entityId);

  return (
    <Button
      variant={watching ? "secondary" : "ghost"}
      size="sm"
      onClick={toggle}
      className={cn("h-7 text-xs gap-1", className)}
    >
      {watching ? "Watching" : "Watch"}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Typing Indicator
// ---------------------------------------------------------------------------

interface TypingIndicatorProps {
  agentName?: string;
  visible: boolean;
}

export function TypingIndicator({ agentName, visible }: TypingIndicatorProps) {
  if (!visible) return null;

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground animate-in fade-in slide-in-from-bottom-1 duration-200"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-0.5">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
      </div>
      <span>{agentName ?? "Agent"} is typing...</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quote-reply helper
// ---------------------------------------------------------------------------

export function formatQuoteReply(text: string): string {
  const lines = text.split("\n").map((line) => `> ${line}`);
  return lines.join("\n") + "\n\n";
}
