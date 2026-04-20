import type { Agent } from "@ironworksai/shared";
import { Reply } from "lucide-react";
import { memo } from "react";
import { Link } from "react-router-dom";
import { PluginSlotOutlet } from "@/plugins/slots";
import { formatDateTime } from "../../lib/utils";
import { Identity } from "../Identity";
import { MarkdownBody } from "../MarkdownBody";
import { StatusBadge } from "../StatusBadge";
import type { CommentWithRunMeta, ReactionMap, TimelineItem } from "./comment-thread-utils";
import { CopyMarkdownButton, ReactionBar } from "./comment-thread-utils";

// ---------------------------------------------------------------------------
// Single comment card (used for both top-level and reply comments)
// ---------------------------------------------------------------------------

export function CommentCard({
  comment,
  agentMap,
  companyId,
  projectId,
  highlightCommentId,
  reactions,
  onToggleReaction,
  onReply,
  depth = 0,
}: {
  comment: CommentWithRunMeta;
  agentMap?: Map<string, Agent>;
  companyId?: string | null;
  projectId?: string | null;
  highlightCommentId?: string | null;
  reactions: ReactionMap;
  onToggleReaction: (commentId: string, emoji: string) => void;
  onReply?: (commentId: string) => void;
  depth?: number;
}) {
  const isHighlighted = highlightCommentId === comment.id;
  return (
    <div
      id={`comment-${comment.id}`}
      className={`border p-3 overflow-hidden min-w-0 rounded-sm transition-colors duration-1000 ${isHighlighted ? "border-primary/50 bg-primary/5" : "border-border"} ${depth > 0 ? "ml-6 border-l-2 border-l-primary/20" : ""}`}
    >
      <div className="flex items-center justify-between mb-1">
        {comment.authorAgentId ? (
          <Link to={`/agents/${comment.authorAgentId}`} className="hover:underline">
            <Identity
              name={agentMap?.get(comment.authorAgentId)?.name ?? comment.authorAgentId.slice(0, 8)}
              size="sm"
            />
          </Link>
        ) : (
          <Identity name="You" size="sm" />
        )}
        <span className="flex items-center gap-1.5">
          {companyId ? (
            <PluginSlotOutlet
              slotTypes={["commentContextMenuItem"]}
              entityType="comment"
              context={{
                companyId,
                projectId: projectId ?? null,
                entityId: comment.id,
                entityType: "comment",
                parentEntityId: comment.issueId,
              }}
              className="flex flex-wrap items-center gap-1.5"
              itemClassName="inline-flex"
              missingBehavior="placeholder"
            />
          ) : null}
          {onReply && depth === 0 && (
            <button
              type="button"
              onClick={() => onReply(comment.id)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Reply to this comment"
            >
              <Reply className="h-3 w-3" />
            </button>
          )}
          <a
            href={`#comment-${comment.id}`}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
          >
            {formatDateTime(comment.createdAt)}
          </a>
          <CopyMarkdownButton text={comment.body} />
        </span>
      </div>
      <MarkdownBody className="text-sm">{comment.body}</MarkdownBody>
      <ReactionBar commentId={comment.id} reactions={reactions[comment.id]} onToggle={onToggleReaction} />
      {companyId ? (
        <div className="mt-2 space-y-2">
          <PluginSlotOutlet
            slotTypes={["commentAnnotation"]}
            entityType="comment"
            context={{
              companyId,
              projectId: projectId ?? null,
              entityId: comment.id,
              entityType: "comment",
              parentEntityId: comment.issueId,
            }}
            className="space-y-2"
            itemClassName="rounded-md"
            missingBehavior="placeholder"
          />
        </div>
      ) : null}
      {comment.runId && (
        <div className="mt-2 pt-2 border-t border-border/60">
          {comment.runAgentId ? (
            <Link
              to={`/agents/${comment.runAgentId}/runs/${comment.runId}`}
              className="inline-flex items-center rounded-md border border-border bg-accent/30 px-2 py-1 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            >
              run {comment.runId.slice(0, 8)}
            </Link>
          ) : (
            <span className="inline-flex items-center rounded-md border border-border bg-accent/30 px-2 py-1 text-[10px] font-mono text-muted-foreground">
              run {comment.runId.slice(0, 8)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline list with threaded replies
// ---------------------------------------------------------------------------

export const TimelineList = memo(function TimelineList({
  timeline,
  agentMap,
  companyId,
  projectId,
  highlightCommentId,
  reactions,
  onToggleReaction,
  onReply,
  commentsByParent,
}: {
  timeline: TimelineItem[];
  agentMap?: Map<string, Agent>;
  companyId?: string | null;
  projectId?: string | null;
  highlightCommentId?: string | null;
  reactions: ReactionMap;
  onToggleReaction: (commentId: string, emoji: string) => void;
  onReply?: (commentId: string) => void;
  commentsByParent: Map<string, CommentWithRunMeta[]>;
}) {
  if (timeline.length === 0) {
    return <p className="text-sm text-muted-foreground">No comments or runs yet.</p>;
  }

  return (
    <div className="space-y-3">
      {timeline.map((item) => {
        if (item.kind === "run") {
          const run = item.run;
          return (
            <div
              key={`run:${run.runId}`}
              className="border border-border bg-accent/20 p-3 overflow-hidden min-w-0 rounded-sm"
            >
              <div className="flex items-center justify-between mb-2">
                <Link to={`/agents/${run.agentId}`} className="hover:underline">
                  <Identity name={agentMap?.get(run.agentId)?.name ?? run.agentId.slice(0, 8)} size="sm" />
                </Link>
                <span className="text-xs text-muted-foreground">{formatDateTime(run.startedAt ?? run.createdAt)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Run</span>
                <Link
                  to={`/agents/${run.agentId}/runs/${run.runId}`}
                  className="inline-flex items-center rounded-md border border-border bg-accent/40 px-2 py-1 font-mono text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
                >
                  {run.runId.slice(0, 8)}
                </Link>
                <StatusBadge status={run.status} />
              </div>
            </div>
          );
        }

        const comment = item.comment;
        const replies = commentsByParent.get(comment.id) ?? [];
        return (
          <div key={comment.id} className="space-y-2">
            <CommentCard
              comment={comment}
              agentMap={agentMap}
              companyId={companyId}
              projectId={projectId}
              highlightCommentId={highlightCommentId}
              reactions={reactions}
              onToggleReaction={onToggleReaction}
              onReply={onReply}
              depth={0}
            />
            {replies.map((reply) => (
              <CommentCard
                key={reply.id}
                comment={reply}
                agentMap={agentMap}
                companyId={companyId}
                projectId={projectId}
                highlightCommentId={highlightCommentId}
                reactions={reactions}
                onToggleReaction={onToggleReaction}
                depth={1}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
});
