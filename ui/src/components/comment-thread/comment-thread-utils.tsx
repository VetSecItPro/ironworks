import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, SmilePlus } from "lucide-react";
import type { IssueComment } from "@ironworksai/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommentWithRunMeta extends IssueComment {
  runId?: string | null;
  runAgentId?: string | null;
}

export interface LinkedRunItem {
  runId: string;
  status: string;
  agentId: string;
  createdAt: Date | string;
  startedAt: Date | string | null;
}

export interface CommentReassignment {
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
}

export type TimelineItem =
  | { kind: "comment"; id: string; createdAtMs: number; comment: CommentWithRunMeta }
  | { kind: "run"; id: string; createdAtMs: number; run: LinkedRunItem };

export type ReactionMap = Record<string, Record<string, number>>;

// ---------------------------------------------------------------------------
// Emoji Reactions
// ---------------------------------------------------------------------------

const REACTION_EMOJIS = [
  { emoji: "\uD83D\uDC4D", label: "thumbsup" },
  { emoji: "\uD83D\uDC4E", label: "thumbsdown" },
  { emoji: "\u2764\uFE0F", label: "heart" },
  { emoji: "\uD83D\uDE80", label: "rocket" },
  { emoji: "\uD83D\uDC40", label: "eyes" },
  { emoji: "\u2705", label: "check" },
] as const;

const REACTIONS_STORAGE_KEY = "ironworks:comment-reactions";

function loadReactions(): ReactionMap {
  try {
    const raw = localStorage.getItem(REACTIONS_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ReactionMap;
  } catch { /* ignore */ }
  return {};
}

function saveReactions(reactions: ReactionMap) {
  try {
    localStorage.setItem(REACTIONS_STORAGE_KEY, JSON.stringify(reactions));
  } catch { /* ignore */ }
}

export function useCommentReactions() {
  const [reactions, setReactions] = useState<ReactionMap>(loadReactions);

  const toggleReaction = useCallback((commentId: string, emoji: string) => {
    setReactions((prev) => {
      const next = { ...prev };
      if (!next[commentId]) next[commentId] = {};
      const current = next[commentId][emoji] ?? 0;
      if (current > 0) {
        next[commentId][emoji] = 0;
      } else {
        next[commentId][emoji] = 1;
      }
      // Clean up zeros
      if (next[commentId][emoji] === 0) delete next[commentId][emoji];
      if (Object.keys(next[commentId]).length === 0) delete next[commentId];
      saveReactions(next);
      return next;
    });
  }, []);

  return { reactions, toggleReaction };
}

export function ReactionBar({
  commentId,
  reactions,
  onToggle,
}: {
  commentId: string;
  reactions: Record<string, number> | undefined;
  onToggle: (commentId: string, emoji: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPicker) return;
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPicker]);

  const activeReactions = reactions
    ? REACTION_EMOJIS.filter((r) => (reactions[r.emoji] ?? 0) > 0)
    : [];

  return (
    <div className="flex items-center gap-1 mt-1">
      {activeReactions.map((r) => (
        <button
          key={r.label}
          type="button"
          onClick={() => onToggle(commentId, r.emoji)}
          className="inline-flex items-center gap-0.5 rounded-full border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-xs hover:bg-primary/10 transition-colors"
          title={`Remove ${r.label} reaction`}
        >
          <span>{r.emoji}</span>
          <span className="text-[10px] text-muted-foreground">{reactions![r.emoji]}</span>
        </button>
      ))}
      <div className="relative" ref={pickerRef}>
        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          className="inline-flex items-center justify-center h-5 w-5 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Add reaction"
        >
          <SmilePlus className="h-3 w-3" />
        </button>
        {showPicker && (
          <div className="absolute bottom-full left-0 mb-1 z-50 flex gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-md">
            {REACTION_EMOJIS.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => { onToggle(commentId, r.emoji); setShowPicker(false); }}
                className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-accent transition-colors text-base"
                title={r.label}
              >
                {r.emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft helpers
// ---------------------------------------------------------------------------

export const DRAFT_DEBOUNCE_MS = 800;

export function loadDraft(draftKey: string): string {
  try {
    return localStorage.getItem(draftKey) ?? "";
  } catch {
    return "";
  }
}

export function saveDraft(draftKey: string, value: string) {
  try {
    if (value.trim()) {
      localStorage.setItem(draftKey, value);
    } else {
      localStorage.removeItem(draftKey);
    }
  } catch {
    // Ignore localStorage failures.
  }
}

export function clearDraft(draftKey: string) {
  try {
    localStorage.removeItem(draftKey);
  } catch {
    // Ignore localStorage failures.
  }
}

export function parseReassignment(target: string): CommentReassignment | null {
  if (!target || target === "__none__") {
    return { assigneeAgentId: null, assigneeUserId: null };
  }
  if (target.startsWith("agent:")) {
    const assigneeAgentId = target.slice("agent:".length);
    return assigneeAgentId ? { assigneeAgentId, assigneeUserId: null } : null;
  }
  if (target.startsWith("user:")) {
    const assigneeUserId = target.slice("user:".length);
    return assigneeUserId ? { assigneeAgentId: null, assigneeUserId } : null;
  }
  return null;
}

export function CopyMarkdownButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground transition-colors"
      title="Copy as markdown"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}
