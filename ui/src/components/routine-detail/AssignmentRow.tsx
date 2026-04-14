import type { RefObject, ReactNode } from "react";
import { AgentIcon } from "../AgentIconPicker";
import { InlineEntitySelector, type InlineEntityOption } from "../InlineEntitySelector";

interface AgentData {
  id: string;
  icon: string | null;
}

interface ProjectData {
  id: string;
  color: string | null;
}

export function AssignmentRow({
  assigneeAgentId,
  projectId,
  assigneeOptions,
  projectOptions,
  currentAssignee,
  currentProject,
  agentById,
  projectById,
  assigneeSelectorRef,
  projectSelectorRef,
  onAssigneeChange,
  onProjectChange,
  onAssigneeConfirm,
  onProjectConfirm,
}: {
  assigneeAgentId: string;
  projectId: string;
  assigneeOptions: InlineEntityOption[];
  projectOptions: InlineEntityOption[];
  currentAssignee: AgentData | null;
  currentProject: ProjectData | null;
  agentById: Map<string, AgentData>;
  projectById: Map<string, ProjectData>;
  assigneeSelectorRef: RefObject<HTMLButtonElement | null>;
  projectSelectorRef: RefObject<HTMLButtonElement | null>;
  onAssigneeChange: (id: string) => void;
  onProjectChange: (id: string) => void;
  onAssigneeConfirm: () => void;
  onProjectConfirm: () => void;
}) {
  return (
    <div className="overflow-x-auto overscroll-x-contain">
      <div className="inline-flex min-w-full flex-wrap items-center gap-2 text-sm text-muted-foreground sm:min-w-max sm:flex-nowrap">
        <span>For</span>
        <InlineEntitySelector
          ref={assigneeSelectorRef}
          value={assigneeAgentId}
          options={assigneeOptions}
          placeholder="Assignee"
          noneLabel="No assignee"
          searchPlaceholder="Search assignees..."
          emptyMessage="No assignees found."
          onChange={onAssigneeChange}
          onConfirm={onAssigneeConfirm}
          renderTriggerValue={(option) =>
            option ? (
              currentAssignee ? (
                <><AgentIcon icon={currentAssignee.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{option.label}</span></>
              ) : (
                <span className="truncate">{option.label}</span>
              )
            ) : (
              <span className="text-muted-foreground">Assignee</span>
            )
          }
          renderOption={(option) => {
            if (!option.id) return <span className="truncate">{option.label}</span>;
            const assignee = agentById.get(option.id);
            return <>{assignee ? <AgentIcon icon={assignee.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}<span className="truncate">{option.label}</span></>;
          }}
        />
        <span>in</span>
        <InlineEntitySelector
          ref={projectSelectorRef}
          value={projectId}
          options={projectOptions}
          placeholder="Project"
          noneLabel="No project"
          searchPlaceholder="Search projects..."
          emptyMessage="No projects found."
          onChange={onProjectChange}
          onConfirm={onProjectConfirm}
          renderTriggerValue={(option) =>
            option && currentProject ? (
              <><span className="h-3.5 w-3.5 shrink-0 rounded-sm" style={{ backgroundColor: currentProject.color ?? "#64748b" }} /><span className="truncate">{option.label}</span></>
            ) : (
              <span className="text-muted-foreground">Project</span>
            )
          }
          renderOption={(option) => {
            if (!option.id) return <span className="truncate">{option.label}</span>;
            const project = projectById.get(option.id);
            return <><span className="h-3.5 w-3.5 shrink-0 rounded-sm" style={{ backgroundColor: project?.color ?? "#64748b" }} /><span className="truncate">{option.label}</span></>;
          }}
        />
      </div>
    </div>
  );
}
