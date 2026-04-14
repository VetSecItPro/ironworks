import type { AgentDetail } from "@ironworksai/shared";
import { cn, relativeTime } from "../../lib/utils";
import { AgentIcon } from "../AgentIconPicker";
import { getRoleLevel } from "../../lib/role-icons";
import type { ChatMessage } from "./chat-helpers";

interface ChatMessageListProps {
  agent: AgentDetail;
  messages: ChatMessage[];
  isTyping: boolean;
  isEmpty: boolean;
  showSearch: boolean;
  searchQuery: string;
  filteredCount: number;
  suggestedActions: { label: string; icon: React.ElementType }[];
  onSuggestedAction: (label: string) => void;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  issueLoading: boolean;
  commentsLoading: boolean;
  rawMessageCount: number;
}

export function ChatMessageList({
  agent,
  messages,
  isTyping,
  isEmpty,
  showSearch,
  searchQuery,
  filteredCount,
  suggestedActions,
  onSuggestedAction,
  bottomRef,
  issueLoading,
  commentsLoading,
  rawMessageCount,
}: ChatMessageListProps) {
  const agentRoleLevel = getRoleLevel(agent.role);
  const agentColor =
    agentRoleLevel === "executive"
      ? "text-amber-600 dark:text-amber-400"
      : agentRoleLevel === "management"
        ? "text-blue-600 dark:text-blue-400"
        : "text-muted-foreground";

  const avatarBg =
    agentRoleLevel === "executive"
      ? "bg-amber-500/10"
      : agentRoleLevel === "management"
        ? "bg-blue-500/10"
        : "bg-accent";

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
      {(issueLoading || commentsLoading) && rawMessageCount === 0 && (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          Loading conversation...
        </div>
      )}

      {isEmpty && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className={cn("flex items-center justify-center h-12 w-12 rounded-full", avatarBg)}>
            <AgentIcon icon={agent.icon} className={cn("h-7 w-7", agentColor)} />
          </div>
          <div>
            <p className="text-sm font-medium">{agent.name}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Send a message to start a conversation.
            </p>
          </div>
        </div>
      )}

      {showSearch && searchQuery.trim() && filteredCount === 0 && (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          No messages match "{searchQuery}"
        </div>
      )}

      {messages.map((msg) => (
        <div
          key={msg.id}
          className={cn(
            "flex gap-2.5 max-w-[85%]",
            msg.fromUser ? "ml-auto flex-row-reverse" : "mr-auto flex-row",
          )}
        >
          {!msg.fromUser && (
            <div className={cn("shrink-0 flex items-center justify-center h-7 w-7 rounded-full", avatarBg)}>
              <AgentIcon icon={agent.icon} className={cn("h-4 w-4", agentColor)} />
            </div>
          )}

          <div className="flex flex-col gap-0.5">
            <div
              className={cn(
                "px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words",
                msg.fromUser
                  ? "bg-blue-600 text-white rounded-tr-sm"
                  : "bg-accent text-foreground rounded-tl-sm",
              )}
            >
              {msg.body}
            </div>
            <span
              className={cn(
                "text-[11px] text-muted-foreground",
                msg.fromUser ? "text-right" : "text-left",
              )}
            >
              {relativeTime(msg.createdAt)}
            </span>
          </div>
        </div>
      ))}

      {isTyping && (
        <div className="flex gap-2.5 max-w-[85%] mr-auto">
          <div className={cn("shrink-0 flex items-center justify-center h-7 w-7 rounded-full", avatarBg)}>
            <AgentIcon icon={agent.icon} className={cn("h-4 w-4", agentColor)} />
          </div>
          <div className="bg-accent px-3 py-2.5 rounded-2xl rounded-tl-sm flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]" />
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]" />
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" />
          </div>
        </div>
      )}

      {!isTyping && suggestedActions.length > 0 && rawMessageCount > 0 && !showSearch && (
        <div className="flex flex-wrap gap-2 pt-1">
          {suggestedActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                onClick={() => onSuggestedAction(action.label)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Icon className="h-3 w-3" />
                {action.label}
              </button>
            );
          })}
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
