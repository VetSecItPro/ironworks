import {
  Check,
  Copy,
  EyeOff,
  Hexagon,
  KeyRound,
  Lock,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Radio,
  Repeat,
  SlidersHorizontal,
  Trash2,
  Unlock,
  Webhook,
} from "lucide-react";
import { PriorityIcon } from "@/components/PriorityIcon";
import { StatusIcon } from "@/components/StatusIcon";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { pickTextColorForPillBg } from "@/lib/color-contrast";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";

interface Label {
  id: string;
  name: string;
  color: string;
}

interface Project {
  id: string;
  name: string;
}

interface IssueHeaderBarProps {
  issueId: string;
  identifier: string | null;
  status: string;
  priority: string;
  projectId: string | null;
  projects: Project[];
  labels: Label[];
  hasLiveRuns: boolean;
  originKind: string | null;
  originId: string | null;
  panelVisible: boolean;
  copied: boolean;
  moreOpen: boolean;
  onStatusChange: (status: string) => void;
  onPriorityChange: (priority: string) => void;
  onCopy: () => void;
  onMobilePropsOpen: () => void;
  onPanelShow: () => void;
  onMoreOpenChange: (open: boolean) => void;
  onHide: () => void;
  onDelete: () => void;
  /** Currently checked-out agent (in_progress + assigneeAgentId set), if any. */
  checkedOutAgentName?: string | null;
  /** Active agents available to park missions to. */
  parkableAgents?: Array<{ id: string; name: string }>;
  onParkToAgent: (agentId: string) => void;
  onReleaseCheckout: () => void;
  isParkPending: boolean;
  isReleasePending: boolean;
}

export function IssueHeaderBar({
  issueId,
  identifier,
  status,
  priority,
  projectId,
  projects,
  labels,
  hasLiveRuns,
  originKind,
  originId,
  panelVisible,
  copied,
  moreOpen,
  onStatusChange,
  onPriorityChange,
  onCopy,
  onMobilePropsOpen,
  onPanelShow,
  onMoreOpenChange,
  onHide,
  onDelete,
  checkedOutAgentName = null,
  parkableAgents = [],
  onParkToAgent,
  onReleaseCheckout,
  isParkPending,
  isReleasePending,
}: IssueHeaderBarProps) {
  return (
    <div className="flex items-center gap-2 min-w-0 flex-wrap">
      <StatusIcon status={status} onChange={onStatusChange} />
      <PriorityIcon priority={priority} onChange={onPriorityChange} />
      <span className="text-sm font-mono text-muted-foreground shrink-0">{identifier ?? issueId.slice(0, 8)}</span>

      {hasLiveRuns && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-medium text-cyan-600 dark:text-cyan-400 shrink-0">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
          </span>
          Live
        </span>
      )}

      {originKind === "routine_execution" && originId && (
        <Link
          to={`/routines/${originId}`}
          className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 border border-violet-500/30 px-2 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400 shrink-0 hover:bg-violet-500/20 transition-colors"
        >
          <Repeat className="h-3 w-3" />
          Routine
        </Link>
      )}
      {originKind && originKind !== "routine_execution" && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400 shrink-0"
          title={`Origin: ${originKind}${originId ? ` (${originId})` : ""}`}
        >
          {originKind === "telegram" || originKind === "messaging_bridge" ? (
            <MessageSquare className="h-3 w-3" />
          ) : originKind === "email" || originKind === "email_inbound" ? (
            <Mail className="h-3 w-3" />
          ) : originKind === "webhook" ? (
            <Webhook className="h-3 w-3" />
          ) : (
            <Radio className="h-3 w-3" />
          )}
          {originKind === "telegram" || originKind === "messaging_bridge"
            ? "Telegram"
            : originKind === "email" || originKind === "email_inbound"
              ? "Email"
              : originKind === "webhook"
                ? "Webhook"
                : originKind}
        </span>
      )}

      {projectId ? (
        <Link
          to={`/projects/${projectId}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors rounded px-1 -mx-1 py-0.5 min-w-0"
        >
          <Hexagon className="h-3 w-3 shrink-0" />
          <span className="truncate">{projects.find((p) => p.id === projectId)?.name ?? projectId.slice(0, 8)}</span>
        </Link>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground opacity-50 px-1 -mx-1 py-0.5">
          <Hexagon className="h-3 w-3 shrink-0" />
          No project
        </span>
      )}

      {labels.length > 0 && (
        <div className="hidden sm:flex items-center gap-1">
          {labels.slice(0, 4).map((label) => (
            <span
              key={label.id}
              className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
              style={{
                borderColor: label.color,
                color: pickTextColorForPillBg(label.color, 0.12),
                backgroundColor: `${label.color}1f`,
              }}
            >
              {label.name}
            </span>
          ))}
          {labels.length > 4 && <span className="text-[10px] text-muted-foreground">+{labels.length - 4}</span>}
        </div>
      )}

      <div className="ml-auto flex items-center gap-0.5 md:hidden shrink-0">
        <Button variant="ghost" size="icon-xs" onClick={onCopy} title="Copy mission as markdown">
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={onMobilePropsOpen} title="Properties">
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </div>

      <div className="hidden md:flex items-center md:ml-auto shrink-0">
        <Button variant="ghost" size="icon-xs" onClick={onCopy} title="Copy mission as markdown">
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className={cn(
            "shrink-0 transition-opacity duration-200",
            panelVisible ? "opacity-0 pointer-events-none w-0 overflow-hidden" : "opacity-100",
          )}
          onClick={onPanelShow}
          title="Show properties"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>

        {/* Park / Release lives inline so operators can manually claim a mission
            for a specific agent (forces in_progress + sets assigneeAgentId) or
            release a stuck checkout. Agent runs do this implicitly; humans
            previously had no surface for the same operation. */}
        {checkedOutAgentName ? (
          <Button
            variant="ghost"
            size="icon-xs"
            className="shrink-0"
            title={`Release checkout (${checkedOutAgentName})`}
            disabled={isReleasePending}
            onClick={() => {
              if (window.confirm(`Release ${checkedOutAgentName}'s checkout on this mission?`)) {
                onReleaseCheckout();
              }
            }}
          >
            <Unlock className="h-4 w-4" />
          </Button>
        ) : parkableAgents.length > 0 ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0"
                title="Park to agent"
                disabled={isParkPending}
              >
                <Lock className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1" align="end">
              <div className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                Park to agent (locks status to in-progress)
              </div>
              <div className="max-h-60 overflow-y-auto">
                {parkableAgents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 text-left"
                    onClick={() => onParkToAgent(agent.id)}
                    disabled={isParkPending}
                  >
                    <KeyRound className="h-3 w-3" />
                    <span className="truncate">{agent.name}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : null}

        <Popover open={moreOpen} onOpenChange={onMoreOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-xs" className="shrink-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1" align="end">
            <button
              type="button"
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 text-destructive"
              onClick={onHide}
            >
              <EyeOff className="h-3 w-3" />
              Hide this Mission
            </button>
            <button
              type="button"
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" />
              Delete permanently
            </button>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
