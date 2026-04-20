import { useQuery } from "@tanstack/react-query";
import {
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Crown,
  GitPullRequest,
  MessageSquare,
  Pin,
  PinOff,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link } from "@/lib/router";
import type { ChannelMessage } from "../../api/channels";
import { channelsApi } from "../../api/channels";
import { queryKeys } from "../../lib/queryKeys";
import { getRoleLevel } from "../../lib/role-icons";
import { cn } from "../../lib/utils";
import { AgentIcon } from "../AgentIconPicker";

/* ------------------------------------------------------------------ */
/*  Role badge                                                         */
/* ------------------------------------------------------------------ */

function RoleBadge({ role, employmentType }: { role?: string | null; employmentType?: string }) {
  const level = getRoleLevel(role);

  if (employmentType === "contractor") {
    return (
      <span className="text-[10px] font-medium px-1 py-0 rounded-full leading-tight border border-dashed border-amber-500 text-amber-600 dark:text-amber-400 shrink-0">
        CTR
      </span>
    );
  }
  if (level === "executive") {
    return (
      <span className="text-[10px] font-medium px-1 py-0 rounded-full leading-tight bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">
        C
      </span>
    );
  }
  if (level === "management") {
    return (
      <span className="text-[10px] font-medium px-1 py-0 rounded-full leading-tight bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 shrink-0">
        M
      </span>
    );
  }
  return (
    <span className="text-[10px] font-medium px-1 py-0 rounded-full leading-tight bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-500 shrink-0">
      FTE
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Message type badge + colored left border                           */
/* ------------------------------------------------------------------ */

const MESSAGE_TYPE_STYLES: Record<string, string> = {
  status_update: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  question: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  decision: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-500",
  escalation: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  announcement: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  deliberation_start: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  deliberation_summary: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
};

const MESSAGE_TYPE_BORDER: Record<string, string> = {
  status_update: "border-l-blue-400",
  question: "border-l-amber-400",
  decision: "border-l-green-400",
  escalation: "border-l-red-400",
  announcement: "border-l-purple-400",
  deliberation_start: "border-l-indigo-400",
  deliberation_summary: "border-l-teal-400",
};

function MessageTypeBadge({ type }: { type: string }) {
  if (!type || type === "message") return null;
  const cls = MESSAGE_TYPE_STYLES[type] ?? "bg-muted text-muted-foreground";
  const label = type.replace(/_/g, " ");
  return <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none", cls)}>{label}</span>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function ReasoningBlock({ reasoning }: { reasoning: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-1">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <Brain className="h-3 w-3" />
        {expanded ? "Hide reasoning" : "Show reasoning"}
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {expanded && (
        <div className="mt-1 ml-3 border-l-2 border-border pl-3 text-[12px] text-muted-foreground whitespace-pre-wrap break-words bg-muted/20 rounded-sm py-1 pr-2">
          {reasoning}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Quorum Indicator                                                   */
/* ------------------------------------------------------------------ */

function QuorumIndicator({
  companyId,
  channelId,
  messageId,
}: {
  companyId: string;
  channelId: string;
  messageId: string;
}) {
  const { data } = useQuery({
    queryKey: queryKeys.channels.quorum(companyId, channelId, messageId),
    queryFn: () => channelsApi.quorum(companyId, channelId, messageId),
    staleTime: 30_000,
  });

  if (!data || data.required.length === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full shrink-0 mt-0.5",
        data.quorumReached
          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      )}
    >
      <Users className="h-2.5 w-2.5" />
      {data.responded.length}/{data.required.length}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Issue ID chip renderer                                             */
/* ------------------------------------------------------------------ */

const ISSUE_ID_REGEX = /\b([A-Z]{2,8}-\d{1,6})\b/g;

function IssueStatusIcon({ status }: { status?: string }) {
  if (status === "done") return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
  if (status === "in_progress") return <CircleDot className="h-3 w-3 text-blue-500" />;
  if (status === "blocked") return <ShieldAlert className="h-3 w-3 text-red-500" />;
  return <CircleDot className="h-3 w-3 text-muted-foreground" />;
}

function renderBodyWithEmbeds(
  body: string,
  issueMap: Map<string, { identifier: string; title: string; status?: string }>,
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(ISSUE_ID_REGEX.source, "g");

  while ((match = regex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push(body.slice(lastIndex, match.index));
    }
    const issueId = match[1];
    const issue = [...issueMap.values()].find((i) => i.identifier === issueId);
    if (issue) {
      parts.push(
        <Link
          key={`${issueId}-${match.index}`}
          to={`/issues/${issueId}`}
          className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 text-[11px] font-medium border border-border rounded-md bg-muted/30 hover:bg-accent/50 transition-colors no-underline text-inherit"
          onClick={(e) => e.stopPropagation()}
        >
          <IssueStatusIcon status={issue.status} />
          {issueId}
        </Link>,
      );
    } else {
      parts.push(
        <span
          key={`${issueId}-${match.index}`}
          className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 text-[11px] font-mono border border-border rounded-md bg-muted/20"
        >
          {issueId}
        </span>,
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < body.length) {
    parts.push(body.slice(lastIndex));
  }
  return parts.length > 0 ? parts : [body];
}

/* ------------------------------------------------------------------ */
/*  MessageRow                                                         */
/* ------------------------------------------------------------------ */

export interface MessageRowProps {
  msg: ChannelMessage;
  agentMap: Map<string, { name: string; icon: string | null; role: string | null; employmentType?: string }>;
  issueMap: Map<string, { identifier: string; title: string; status?: string }>;
  replyMap: Map<string, ChannelMessage>;
  onPin?: (messageId: string) => void;
  onUnpin?: (messageId: string) => void;
  isPinned?: boolean;
  onCreateIssue?: (messageId: string) => void;
  onReply?: (messageId: string) => void;
  threadReplies?: ChannelMessage[];
  companyId?: string;
  channelId?: string;
}

export function MessageRow({
  msg,
  agentMap,
  issueMap,
  replyMap,
  onPin,
  onUnpin,
  isPinned,
  onCreateIssue,
  onReply,
  threadReplies,
  companyId,
  channelId,
}: MessageRowProps) {
  const isHumanUser = Boolean(msg.authorUserId);
  const isBoard = !msg.authorAgentId && !msg.authorUserId;
  const isHumanOrBoard = isHumanUser || isBoard;
  const agent = msg.authorAgentId ? agentMap.get(msg.authorAgentId) : null;
  const authorUserName = (msg as unknown as Record<string, unknown>).authorUserName as string | null | undefined;
  const authorName = isHumanOrBoard ? (authorUserName ?? "Board") : (agent?.name ?? "Agent");
  const replyTo = msg.replyToId ? replyMap.get(msg.replyToId) : null;
  const linkedIssue = msg.linkedIssueId ? issueMap.get(msg.linkedIssueId) : null;

  const borderClass =
    msg.messageType && msg.messageType !== "message" ? (MESSAGE_TYPE_BORDER[msg.messageType] ?? "") : "";

  return (
    <div
      className={cn(
        "group relative flex gap-3 px-4 py-2 hover:bg-accent/30 transition-colors",
        borderClass && `border-l-[3px] ${borderClass}`,
        isBoard && !borderClass && "border-l-[3px] border-l-amber-400 bg-amber-50/30 dark:bg-amber-900/10",
        isPinned && "bg-amber-50/20 dark:bg-amber-900/5",
      )}
    >
      {/* Action buttons shown on hover */}
      <div className="absolute right-3 top-2 hidden group-hover:flex items-center gap-1.5">
        {onReply && (
          <button
            onClick={() => onReply(msg.id)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            title="Reply to message"
          >
            <MessageSquare className="h-3 w-3" />
          </button>
        )}
        {onCreateIssue && !msg.linkedIssueId && msg.messageType === "message" && (
          <button
            onClick={() => onCreateIssue(msg.id)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            title="Create mission from message"
          >
            <GitPullRequest className="h-3 w-3" />
          </button>
        )}
        {(onPin || onUnpin) && (
          <button
            onClick={() => (isPinned ? onUnpin?.(msg.id) : onPin?.(msg.id))}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            title={isPinned ? "Unpin message" : "Pin message"}
          >
            {isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          </button>
        )}
      </div>

      {/* Author icon */}
      <div className="shrink-0 mt-0.5">
        {isHumanOrBoard ? (
          <div className="h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <Crown className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
        ) : (
          <div className="h-9 w-9 rounded-full bg-accent flex items-center justify-center">
            <AgentIcon
              icon={agent?.icon ?? null}
              className={cn(
                "h-5 w-5",
                getRoleLevel(agent?.role) === "executive"
                  ? "text-amber-500 dark:text-amber-400"
                  : getRoleLevel(agent?.role) === "management"
                    ? "text-blue-500 dark:text-blue-400"
                    : "text-muted-foreground",
              )}
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span
            className={cn(
              "text-[13px] font-semibold leading-tight",
              isBoard ? "text-amber-700 dark:text-amber-400" : "text-foreground",
            )}
          >
            {authorName}
          </span>
          {!isBoard && agent && <RoleBadge role={agent.role} employmentType={agent.employmentType} />}
          {isBoard && (
            <span className="text-[10px] font-medium px-1 py-0 rounded-full leading-tight bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-300 dark:border-amber-700 shrink-0">
              BOARD
            </span>
          )}
          {msg.messageType === "decision" && companyId && channelId && (
            <QuorumIndicator companyId={companyId} channelId={channelId} messageId={msg.id} />
          )}
          <span className="ml-auto text-[11px] text-muted-foreground shrink-0">{formatTime(msg.createdAt)}</span>
        </div>

        {msg.messageType && msg.messageType !== "message" && (
          <div className="mb-1">
            <MessageTypeBadge type={msg.messageType} />
          </div>
        )}

        {replyTo && (
          <div className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground border-l-2 border-border pl-2">
            <span>Replying to</span>
            <span className="font-medium truncate max-w-[200px]">{replyTo.body}</span>
          </div>
        )}

        <p className="text-[13px] text-foreground/90 whitespace-pre-wrap break-words">
          {renderBodyWithEmbeds(msg.body, issueMap)}
        </p>

        {msg.reasoning && <ReasoningBlock reasoning={msg.reasoning} />}

        {linkedIssue && (
          <div className="mt-1.5">
            <Link
              to={`/issues/${msg.linkedIssueId}`}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground border border-border rounded-md px-2 py-0.5 bg-muted/30 hover:bg-accent/50 transition-colors"
            >
              <span className="text-muted-foreground">{"->"}</span>
              <span className="font-medium">{linkedIssue.identifier}:</span>
              <span className="truncate max-w-[200px]">{linkedIssue.title}</span>
            </Link>
          </div>
        )}

        {threadReplies && threadReplies.length > 0 && (
          <div className="mt-2 ml-2 border-l-2 border-border/50 pl-3 space-y-1">
            {threadReplies.map((reply) => {
              const replyAgent = reply.authorAgentId ? agentMap.get(reply.authorAgentId) : null;
              const replyIsHuman = Boolean(reply.authorUserId) || (!reply.authorAgentId && !reply.authorUserId);
              const replyUserName = (reply as unknown as Record<string, unknown>).authorUserName as
                | string
                | null
                | undefined;
              const replyAuthor = replyIsHuman ? (replyUserName ?? "Board") : (replyAgent?.name ?? "Agent");
              return (
                <div key={reply.id} className="flex items-start gap-2 py-1">
                  <div className="h-5 w-5 rounded-full bg-accent flex items-center justify-center shrink-0 mt-0.5">
                    <AgentIcon icon={replyAgent?.icon ?? null} className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-semibold">{replyAuthor}</span>
                      <span className="text-[10px] text-muted-foreground">{formatTime(reply.createdAt)}</span>
                    </div>
                    <p className="text-[12px] text-foreground/80 whitespace-pre-wrap break-words">
                      {renderBodyWithEmbeds(reply.body, issueMap)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
