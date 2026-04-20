import type { RefObject } from "react";
import { parseAssigneeValue } from "../../lib/assignees";
import { trackRecentAssignee } from "../../lib/recent-assignees";
import { AgentIcon } from "../AgentIconPicker";
import { type InlineEntityOption, InlineEntitySelector } from "../InlineEntitySelector";
import type { MarkdownEditorRef } from "../MarkdownEditor";

interface Agent {
  id: string;
  name: string;
  icon?: string | null;
  status?: string;
}

interface Project {
  id: string;
  name: string;
  color?: string | null;
}

interface AssignmentRowProps {
  assigneeValue: string;
  setAssigneeValue: (value: string) => void;
  assigneeOptions: InlineEntityOption[];
  projectId: string;
  handleProjectChange: (projectId: string) => void;
  projectOptions: InlineEntityOption[];
  goalId: string;
  setGoalId: (goalId: string) => void;
  goalOptions: InlineEntityOption[];
  currentAssignee: Agent | null | undefined;
  currentProject: Project | null | undefined;
  orderedProjects: Project[];
  agents: Agent[] | undefined;
  descriptionEditorRef: RefObject<MarkdownEditorRef | null>;
  assigneeSelectorRef: RefObject<HTMLButtonElement | null>;
  projectSelectorRef: RefObject<HTMLButtonElement | null>;
}

export function AssignmentRow({
  assigneeValue,
  setAssigneeValue,
  assigneeOptions,
  projectId,
  handleProjectChange,
  projectOptions,
  goalId,
  setGoalId,
  goalOptions,
  currentAssignee,
  currentProject,
  orderedProjects,
  agents,
  descriptionEditorRef,
  assigneeSelectorRef,
  projectSelectorRef,
}: AssignmentRowProps) {
  return (
    <div className="px-4 pb-2 shrink-0">
      <div className="overflow-x-auto overscroll-x-contain">
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground flex-wrap sm:flex-nowrap sm:min-w-max">
          <span>For</span>
          <InlineEntitySelector
            ref={assigneeSelectorRef}
            value={assigneeValue}
            options={assigneeOptions}
            placeholder="Assignee"
            disablePortal
            noneLabel="No assignee"
            searchPlaceholder="Search assignees..."
            emptyMessage="No assignees found."
            onChange={(value) => {
              const nextAssignee = parseAssigneeValue(value);
              if (nextAssignee.assigneeAgentId) {
                trackRecentAssignee(nextAssignee.assigneeAgentId);
              }
              setAssigneeValue(value);
            }}
            onConfirm={() => {
              if (projectId) {
                descriptionEditorRef.current?.focus();
              } else {
                projectSelectorRef.current?.focus();
              }
            }}
            renderTriggerValue={(option) =>
              option ? (
                currentAssignee ? (
                  <>
                    <AgentIcon icon={currentAssignee.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{option.label}</span>
                  </>
                ) : (
                  <span className="truncate">{option.label}</span>
                )
              ) : (
                <span className="text-muted-foreground">Assignee</span>
              )
            }
            renderOption={(option) => {
              if (!option.id) return <span className="truncate">{option.label}</span>;
              const assignee = parseAssigneeValue(option.id).assigneeAgentId
                ? (agents ?? []).find((agent) => agent.id === parseAssigneeValue(option.id).assigneeAgentId)
                : null;
              return (
                <>
                  {assignee ? (
                    <AgentIcon icon={assignee.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : null}
                  <span className="truncate">{option.label}</span>
                </>
              );
            }}
          />
          <span>in</span>
          <InlineEntitySelector
            ref={projectSelectorRef}
            value={projectId}
            options={projectOptions}
            placeholder="Project"
            disablePortal
            noneLabel="No project"
            searchPlaceholder="Search projects..."
            emptyMessage="No projects found."
            onChange={handleProjectChange}
            onConfirm={() => {
              descriptionEditorRef.current?.focus();
            }}
            renderTriggerValue={(option) =>
              option && currentProject ? (
                <>
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: currentProject.color ?? "#6366f1" }}
                  />
                  <span className="truncate">{option.label}</span>
                </>
              ) : (
                <span className="text-muted-foreground">Project</span>
              )
            }
            renderOption={(option) => {
              if (!option.id) return <span className="truncate">{option.label}</span>;
              const project = orderedProjects.find((item) => item.id === option.id);
              return (
                <>
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: project?.color ?? "#6366f1" }}
                  />
                  <span className="truncate">{option.label}</span>
                </>
              );
            }}
          />
          {goalOptions.length > 0 && (
            <>
              <span>for</span>
              <InlineEntitySelector
                value={goalId}
                options={goalOptions}
                placeholder="Goal"
                disablePortal
                noneLabel="No goal"
                searchPlaceholder="Search goals..."
                emptyMessage="No goals found."
                onChange={setGoalId}
                onConfirm={() => {
                  descriptionEditorRef.current?.focus();
                }}
                renderTriggerValue={(option) =>
                  option ? (
                    <>
                      <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      </span>
                      <span className="truncate">{option.label}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Goal</span>
                  )
                }
                renderOption={(option) => {
                  if (!option.id) return <span className="truncate">{option.label}</span>;
                  return (
                    <>
                      <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      </span>
                      <span className="truncate">{option.label}</span>
                    </>
                  );
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
