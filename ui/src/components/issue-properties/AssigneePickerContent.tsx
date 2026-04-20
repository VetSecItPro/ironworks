import { User } from "lucide-react";
import { trackRecentAssignee } from "../../lib/recent-assignees";
import { cn } from "../../lib/utils";
import { AgentIcon } from "../AgentIconPicker";

interface AssigneePickerContentProps {
  assigneeSearch: string;
  setAssigneeSearch: (v: string) => void;
  inline?: boolean;
  issueAssigneeAgentId: string | null;
  issueAssigneeUserId: string | null;
  issueCreatedByUserId: string | null | undefined;
  currentUserId: string | null | undefined;
  creatorUserLabel: string | null;
  sortedAgents: Array<{ id: string; name: string; icon?: string | null }>;
  onUpdate: (data: Record<string, unknown>) => void;
  onClose: () => void;
}

export function AssigneePickerContent({
  assigneeSearch,
  setAssigneeSearch,
  inline,
  issueAssigneeAgentId,
  issueAssigneeUserId,
  issueCreatedByUserId,
  currentUserId,
  creatorUserLabel,
  sortedAgents,
  onUpdate,
  onClose,
}: AssigneePickerContentProps) {
  return (
    <>
      <input
        className="w-full px-2 py-1.5 text-xs bg-transparent outline-none border-b border-border mb-1 placeholder:text-muted-foreground/70"
        placeholder="Search assignees..."
        value={assigneeSearch}
        onChange={(e) => setAssigneeSearch(e.target.value)}
      />
      <div className="max-h-48 overflow-y-auto overscroll-contain">
        <button
          className={cn(
            "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
            !issueAssigneeAgentId && !issueAssigneeUserId && "bg-accent",
          )}
          onClick={() => {
            onUpdate({ assigneeAgentId: null, assigneeUserId: null });
            onClose();
          }}
        >
          No assignee
        </button>
        {currentUserId && (
          <button
            className={cn(
              "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
              issueAssigneeUserId === currentUserId && "bg-accent",
            )}
            onClick={() => {
              onUpdate({ assigneeAgentId: null, assigneeUserId: currentUserId });
              onClose();
            }}
          >
            <User className="h-3 w-3 shrink-0 text-muted-foreground" />
            Assign to me
          </button>
        )}
        {issueCreatedByUserId && issueCreatedByUserId !== currentUserId && (
          <button
            className={cn(
              "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
              issueAssigneeUserId === issueCreatedByUserId && "bg-accent",
            )}
            onClick={() => {
              onUpdate({ assigneeAgentId: null, assigneeUserId: issueCreatedByUserId });
              onClose();
            }}
          >
            <User className="h-3 w-3 shrink-0 text-muted-foreground" />
            {creatorUserLabel ? `Assign to ${creatorUserLabel}` : "Assign to requester"}
          </button>
        )}
        {sortedAgents
          .filter((a) => {
            if (!assigneeSearch.trim()) return true;
            return a.name.toLowerCase().includes(assigneeSearch.toLowerCase());
          })
          .map((a) => (
            <button
              key={a.id}
              className={cn(
                "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
                a.id === issueAssigneeAgentId && "bg-accent",
              )}
              onClick={() => {
                trackRecentAssignee(a.id);
                onUpdate({ assigneeAgentId: a.id, assigneeUserId: null });
                onClose();
              }}
            >
              <AgentIcon icon={a.icon} className="shrink-0 h-3 w-3 text-muted-foreground" />
              {a.name}
            </button>
          ))}
      </div>
    </>
  );
}
