import { memo } from "react";
import { Link } from "@/lib/router";
import { Identity } from "./Identity";
import { timeAgo } from "../lib/timeAgo";
import { cn } from "../lib/utils";
import { deriveProjectUrlKey, type ActivityEvent, type Agent } from "@ironworksai/shared";

const ACTION_VERBS: Record<string, string> = {
  "issue.created": "created issue",
  "issue.updated": "updated issue",
  "issue.checked_out": "checked out issue",
  "issue.released": "released issue",
  "issue.comment_added": "commented on issue",
  "issue.attachment_added": "attached file to issue",
  "issue.attachment_removed": "removed attachment from issue",
  "issue.document_created": "created document for issue",
  "issue.document_updated": "updated document on issue",
  "issue.document_deleted": "deleted document from issue",
  "issue.commented": "commented on issue",
  "issue.deleted": "deleted issue",
  "agent.created": "hired agent",
  "agent.updated": "updated agent",
  "agent.paused": "paused agent",
  "agent.resumed": "resumed agent",
  "agent.terminated": "terminated agent",
  "agent.key_created": "created API key for agent",
  "agent.budget_updated": "updated budget for agent",
  "agent.runtime_session_reset": "reset session for agent",
  "heartbeat.invoked": "invoked heartbeat for agent",
  "heartbeat.cancelled": "cancelled heartbeat for agent",
  "approval.created": "requested approval",
  "approval.approved": "approved request",
  "approval.rejected": "rejected request",
  "project.created": "created project",
  "project.updated": "updated project",
  "project.deleted": "deleted project",
  "goal.created": "created goal",
  "goal.updated": "updated goal",
  "goal.deleted": "deleted goal",
  "cost.reported": "logged cost event",
  "cost.recorded": "recorded cost event",
  "company.created": "created company",
  "company.updated": "updated company settings",
  "company.archived": "archived company",
  "company.budget_updated": "updated company budget",
  "company.imported": "imported company data",
  "privacy.erasure_requested": "requested data erasure",
};

const ACTION_COLORS: Record<string, string> = {
  created: "text-emerald-500",
  hired: "text-emerald-500",
  deleted: "text-red-500",
  terminated: "text-red-500",
  paused: "text-amber-500",
  archived: "text-amber-500",
  rejected: "text-red-500",
  approved: "text-emerald-500",
  resumed: "text-blue-500",
  updated: "text-blue-500",
  commented: "text-muted-foreground",
};

function humanizeValue(value: unknown): string {
  if (typeof value !== "string") return String(value ?? "none");
  return value.replace(/_/g, " ");
}

function formatVerb(action: string, details?: Record<string, unknown> | null): string {
  if (action === "issue.updated" && details) {
    const previous = (details._previous ?? {}) as Record<string, unknown>;
    if (details.status !== undefined) {
      const from = previous.status;
      return from
        ? `changed status from ${humanizeValue(from)} to ${humanizeValue(details.status)} on`
        : `changed status to ${humanizeValue(details.status)} on`;
    }
    if (details.priority !== undefined) {
      const from = previous.priority;
      return from
        ? `changed priority from ${humanizeValue(from)} to ${humanizeValue(details.priority)} on`
        : `changed priority to ${humanizeValue(details.priority)} on`;
    }
  }
  return ACTION_VERBS[action] ?? action.replace(/[._]/g, " ");
}

const STATUS_BADGE_COLORS: Record<string, string> = {
  todo: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
  in_progress: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  done: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  cancelled: "bg-red-500/15 text-red-600 dark:text-red-400",
  backlog: "bg-zinc-400/15 text-zinc-500 dark:text-zinc-500",
  blocked: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

function StatusTransitionBadges({ details }: { details: Record<string, unknown> | null }) {
  if (!details) return null;
  const previous = (details._previous ?? {}) as Record<string, unknown>;
  if (details.status === undefined || !previous.status) return null;
  const fromStatus = String(previous.status);
  const toStatus = String(details.status);
  const fromColor = STATUS_BADGE_COLORS[fromStatus] ?? "bg-muted text-muted-foreground";
  const toColor = STATUS_BADGE_COLORS[toStatus] ?? "bg-muted text-muted-foreground";
  return (
    <span className="inline-flex items-center gap-1 ml-1">
      <span className={cn("inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none", fromColor)}>
        {fromStatus.replace(/_/g, " ")}
      </span>
      <span className="text-[10px] text-muted-foreground">&rarr;</span>
      <span className={cn("inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none", toColor)}>
        {toStatus.replace(/_/g, " ")}
      </span>
    </span>
  );
}

function entityLink(entityType: string, entityId: string, name?: string | null): string | null {
  switch (entityType) {
    case "issue": return `/issues/${name ?? entityId}`;
    case "agent": return `/agents/${entityId}`;
    case "project": return `/projects/${deriveProjectUrlKey(name, entityId)}`;
    case "goal": return `/goals/${entityId}`;
    case "approval": return `/approvals/${entityId}`;
    default: return null;
  }
}

interface ActivityRowProps {
  event: ActivityEvent;
  agentMap: Map<string, Agent>;
  entityNameMap: Map<string, string>;
  entityTitleMap?: Map<string, string>;
  className?: string;
}

export const ActivityRow = memo(function ActivityRow({ event, agentMap, entityNameMap, entityTitleMap, className }: ActivityRowProps) {
  const verb = formatVerb(event.action, event.details);

  // Determine verb color
  const verbColor = Object.entries(ACTION_COLORS).find(
    ([keyword]) => verb.toLowerCase().includes(keyword),
  )?.[1] ?? "text-muted-foreground";

  const isHeartbeatEvent = event.entityType === "heartbeat_run";
  const heartbeatAgentId = isHeartbeatEvent
    ? (event.details as Record<string, unknown> | null)?.agentId as string | undefined
    : undefined;

  const isCostEvent = event.action.startsWith("cost.");
  const details = event.details as Record<string, unknown> | null;

  // For cost events, try to find the agent name from details
  const costAgentId = isCostEvent ? (details?.agentId as string | undefined) : undefined;
  const costAgentName = costAgentId ? entityNameMap.get(`agent:${costAgentId}`) : null;
  const costModel = isCostEvent ? (details?.model as string | undefined) : undefined;
  const costProvider = isCostEvent ? (details?.provider as string | undefined) : undefined;

  const name = isHeartbeatEvent
    ? (heartbeatAgentId ? entityNameMap.get(`agent:${heartbeatAgentId}`) : null)
    : isCostEvent
      ? costAgentName
      : entityNameMap.get(`${event.entityType}:${event.entityId}`);

  const entityTitle = isCostEvent
    ? (costModel ? `${costProvider ?? ""}${costProvider && costModel ? " · " : ""}${costModel}` : undefined)
    : entityTitleMap?.get(`${event.entityType}:${event.entityId}`);

  const link = isHeartbeatEvent && heartbeatAgentId
    ? `/agents/${heartbeatAgentId}/runs/${event.entityId}`
    : entityLink(event.entityType, event.entityId, name);

  const actor = event.actorType === "agent" ? agentMap.get(event.actorId) : null;
  const actorName = actor?.name ?? (event.actorType === "system" ? "System" : event.actorType === "user" ? "Board" : event.actorId || "Unknown");

  const inner = (
    <div className="flex gap-3">
      <p className="flex-1 min-w-0 truncate">
        <Identity
          name={actorName}
          size="xs"
          className="align-baseline"
        />
        <span className={cn("ml-1", verbColor)}>{verb} </span>
        {name && <span className="font-medium">{name}</span>}
        {event.action === "issue.updated" && details && (details._previous as Record<string, unknown> | undefined)?.status !== undefined && (
          <StatusTransitionBadges details={details} />
        )}
        {entityTitle && <span className="text-muted-foreground ml-1">- {entityTitle}</span>}
      </p>
      <span className="text-xs text-muted-foreground shrink-0 pt-0.5">{timeAgo(event.createdAt)}</span>
    </div>
  );

  const classes = cn(
    "px-4 py-2 text-sm",
    link && "cursor-pointer hover:bg-accent/50 transition-colors",
    className,
  );

  if (link) {
    return (
      <Link to={link} className={cn(classes, "no-underline text-inherit block")}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={classes}>
      {inner}
    </div>
  );
});
