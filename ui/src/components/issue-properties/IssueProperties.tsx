import type { Issue } from "@ironworksai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Hexagon, Tag, User } from "lucide-react";
import { useMemo, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { pickTextColorForPillBg } from "@/lib/color-contrast";
import { Link } from "@/lib/router";
import { agentsApi } from "../../api/agents";
import { authApi } from "../../api/auth";
import { issuesApi } from "../../api/issues";
import { projectsApi } from "../../api/projects";
import { useCompany } from "../../context/CompanyContext";
import { useProjectOrder } from "../../hooks/useProjectOrder";
import { formatAssigneeUserLabel } from "../../lib/assignees";
import { queryKeys } from "../../lib/queryKeys";
import { getRecentAssigneeIds, sortAgentsByRecency } from "../../lib/recent-assignees";
import { timeAgo } from "../../lib/timeAgo";
import { cn, formatDate, projectUrl } from "../../lib/utils";
import { Identity } from "../Identity";
import { PriorityIcon } from "../PriorityIcon";
import { StatusIcon } from "../StatusIcon";
import { AssigneePickerContent } from "./AssigneePickerContent";
import { LabelsPickerContent } from "./LabelsPickerContent";
import { PropertyPicker, PropertyRow } from "./PropertyLayout";
import { defaultExecutionWorkspaceModeForProject, defaultProjectWorkspaceIdForProject } from "./workspace-helpers";

interface IssuePropertiesProps {
  issue: Issue;
  onUpdate: (data: Record<string, unknown>) => void;
  inline?: boolean;
}

export function IssueProperties({ issue, onUpdate, inline }: IssuePropertiesProps) {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const companyId = issue.companyId ?? selectedCompanyId;
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [labelSearch, setLabelSearch] = useState("");
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#6366f1");

  const { data: session } = useQuery({ queryKey: queryKeys.auth.session, queryFn: () => authApi.getSession() });
  const currentUserId = session?.user?.id ?? session?.session?.userId;

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId!),
    queryFn: () => agentsApi.list(companyId!),
    enabled: !!companyId,
  });
  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(companyId!),
    queryFn: () => projectsApi.list(companyId!),
    enabled: !!companyId,
  });
  const activeProjects = useMemo(
    () => (projects ?? []).filter((p) => !p.archivedAt || p.id === issue.projectId),
    [projects, issue.projectId],
  );
  const { orderedProjects } = useProjectOrder({ projects: activeProjects, companyId, userId: currentUserId });
  const { data: labels } = useQuery({
    queryKey: queryKeys.issues.labels(companyId!),
    queryFn: () => issuesApi.listLabels(companyId!),
    enabled: !!companyId,
  });

  const createLabel = useMutation({
    mutationFn: (data: { name: string; color: string }) => issuesApi.createLabel(companyId!, data),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.issues.labels(companyId!) });
      onUpdate({ labelIds: [...(issue.labelIds ?? []), created.id] });
      setNewLabelName("");
    },
  });

  const deleteLabel = useMutation({
    mutationFn: (labelId: string) => issuesApi.deleteLabel(labelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.labels(companyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issue.id) });
    },
  });

  const toggleLabel = (labelId: string) => {
    const ids = issue.labelIds ?? [];
    onUpdate({ labelIds: ids.includes(labelId) ? ids.filter((id) => id !== labelId) : [...ids, labelId] });
  };

  const agentName = (id: string | null) => {
    if (!id || !agents) return null;
    return agents.find((a) => a.id === id)?.name ?? id.slice(0, 8);
  };
  const projectName = (id: string | null) => {
    if (!id) return id?.slice(0, 8) ?? "None";
    return orderedProjects.find((p) => p.id === id)?.name ?? id.slice(0, 8);
  };
  const projectLink = (id: string | null) => {
    if (!id) return null;
    const p = projects?.find((p) => p.id === id) ?? null;
    return p ? projectUrl(p) : `/projects/${id}`;
  };

  const recentAssigneeIds = useMemo(() => getRecentAssigneeIds(), [assigneeOpen]);
  const sortedAgents = useMemo(
    () =>
      sortAgentsByRecency(
        (agents ?? []).filter((a) => a.status !== "terminated"),
        recentAssigneeIds,
      ),
    [agents, recentAssigneeIds],
  );

  const assignee = issue.assigneeAgentId ? agents?.find((a) => a.id === issue.assigneeAgentId) : null;
  const userLabel = (userId: string | null | undefined) => formatAssigneeUserLabel(userId, currentUserId);
  const assigneeUserLabel = userLabel(issue.assigneeUserId);
  const creatorUserLabel = userLabel(issue.createdByUserId);

  const labelsTrigger =
    (issue.labels ?? []).length > 0 ? (
      <div className="flex items-center gap-1 flex-wrap">
        {(issue.labels ?? []).slice(0, 3).map((label) => (
          <span
            key={label.id}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border"
            style={{
              borderColor: label.color,
              backgroundColor: `${label.color}22`,
              color: pickTextColorForPillBg(label.color, 0.13),
            }}
          >
            {label.name}
          </span>
        ))}
        {(issue.labels ?? []).length > 3 && (
          <span className="text-xs text-muted-foreground">+{(issue.labels ?? []).length - 3}</span>
        )}
      </div>
    ) : (
      <>
        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">No labels</span>
      </>
    );

  const assigneeTrigger = assignee ? (
    <Identity name={assignee.name} size="sm" />
  ) : assigneeUserLabel ? (
    <>
      <User className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-sm">{assigneeUserLabel}</span>
    </>
  ) : (
    <>
      <User className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">Unassigned</span>
    </>
  );

  const projectTrigger = issue.projectId ? (
    <>
      <span
        className="shrink-0 h-3 w-3 rounded-sm"
        style={{ backgroundColor: orderedProjects.find((p) => p.id === issue.projectId)?.color ?? "#6366f1" }}
      />
      <span className="text-sm truncate">{projectName(issue.projectId)}</span>
    </>
  ) : (
    <>
      <Hexagon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">No project</span>
    </>
  );

  const projectContent = (
    <>
      <input
        className="w-full px-2 py-1.5 text-xs bg-transparent outline-none border-b border-border mb-1 placeholder:text-muted-foreground/70"
        placeholder="Search projects..."
        value={projectSearch}
        onChange={(e) => setProjectSearch(e.target.value)}
      />
      <div className="max-h-48 overflow-y-auto overscroll-contain">
        <button type="button"
          className={cn(
            "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 whitespace-nowrap",
            !issue.projectId && "bg-accent",
          )}
          onClick={() => {
            onUpdate({
              projectId: null,
              projectWorkspaceId: null,
              executionWorkspaceId: null,
              executionWorkspacePreference: null,
              executionWorkspaceSettings: null,
            });
            setProjectOpen(false);
          }}
        >
          No project
        </button>
        {orderedProjects
          .filter((p) => {
            if (!projectSearch.trim()) return true;
            return p.name.toLowerCase().includes(projectSearch.toLowerCase());
          })
          .map((p) => (
            <button type="button"
              key={p.id}
              className={cn(
                "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 whitespace-nowrap",
                p.id === issue.projectId && "bg-accent",
              )}
              onClick={() => {
                const dm = defaultExecutionWorkspaceModeForProject(p);
                onUpdate({
                  projectId: p.id,
                  projectWorkspaceId: defaultProjectWorkspaceIdForProject(p),
                  executionWorkspaceId: null,
                  executionWorkspacePreference: dm,
                  executionWorkspaceSettings: p.executionWorkspacePolicy?.enabled ? { mode: dm } : null,
                });
                setProjectOpen(false);
              }}
            >
              <span className="shrink-0 h-3 w-3 rounded-sm" style={{ backgroundColor: p.color ?? "#6366f1" }} />
              {p.name}
            </button>
          ))}
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <PropertyRow label="Status">
          <StatusIcon status={issue.status} onChange={(status) => onUpdate({ status })} showLabel />
        </PropertyRow>
        <PropertyRow label="Priority">
          <PriorityIcon priority={issue.priority} onChange={(priority) => onUpdate({ priority })} showLabel />
        </PropertyRow>

        <PropertyPicker
          inline={inline}
          label="Labels"
          open={labelsOpen}
          onOpenChange={(open) => {
            setLabelsOpen(open);
            if (!open) setLabelSearch("");
          }}
          triggerContent={labelsTrigger}
          triggerClassName="min-w-0 max-w-full"
          popoverClassName="w-64"
        >
          <LabelsPickerContent
            labelSearch={labelSearch}
            setLabelSearch={setLabelSearch}
            inline={inline}
            labels={labels ?? []}
            issueLabelIds={issue.labelIds ?? []}
            toggleLabel={toggleLabel}
            deleteLabel={(id) => deleteLabel.mutate(id)}
            newLabelName={newLabelName}
            setNewLabelName={setNewLabelName}
            newLabelColor={newLabelColor}
            setNewLabelColor={setNewLabelColor}
            onCreateLabel={(data) => createLabel.mutate(data)}
            isCreating={createLabel.isPending}
          />
        </PropertyPicker>

        <PropertyPicker
          inline={inline}
          label="Assignee"
          open={assigneeOpen}
          onOpenChange={(open) => {
            setAssigneeOpen(open);
            if (!open) setAssigneeSearch("");
          }}
          triggerContent={assigneeTrigger}
          popoverClassName="w-52"
          extra={
            issue.assigneeAgentId ? (
              <Link
                to={`/agents/${issue.assigneeAgentId}`}
                className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            ) : undefined
          }
        >
          <AssigneePickerContent
            assigneeSearch={assigneeSearch}
            setAssigneeSearch={setAssigneeSearch}
            inline={inline}
            issueAssigneeAgentId={issue.assigneeAgentId}
            issueAssigneeUserId={issue.assigneeUserId}
            issueCreatedByUserId={issue.createdByUserId}
            currentUserId={currentUserId}
            creatorUserLabel={creatorUserLabel}
            sortedAgents={sortedAgents}
            onUpdate={onUpdate}
            onClose={() => setAssigneeOpen(false)}
          />
        </PropertyPicker>

        <PropertyPicker
          inline={inline}
          label="Project"
          open={projectOpen}
          onOpenChange={(open) => {
            setProjectOpen(open);
            if (!open) setProjectSearch("");
          }}
          triggerContent={projectTrigger}
          triggerClassName="min-w-0 max-w-full"
          popoverClassName="w-fit min-w-[11rem]"
          extra={
            issue.projectId ? (
              <Link
                to={projectLink(issue.projectId)!}
                className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            ) : undefined
          }
        >
          {projectContent}
        </PropertyPicker>

        {issue.parentId && (
          <PropertyRow label="Parent">
            <Link
              to={`/issues/${issue.ancestors?.[0]?.identifier ?? issue.parentId}`}
              className="text-sm hover:underline"
            >
              {issue.ancestors?.[0]?.title ?? issue.parentId.slice(0, 8)}
            </Link>
          </PropertyRow>
        )}
        {issue.requestDepth > 0 && (
          <PropertyRow label="Depth">
            <span className="text-sm font-mono">{issue.requestDepth}</span>
          </PropertyRow>
        )}
      </div>

      <Separator />

      <div className="space-y-1">
        {(issue.createdByAgentId || issue.createdByUserId) && (
          <PropertyRow label="Created by">
            {issue.createdByAgentId ? (
              <Link to={`/agents/${issue.createdByAgentId}`} className="hover:underline">
                <Identity name={agentName(issue.createdByAgentId) ?? issue.createdByAgentId.slice(0, 8)} size="sm" />
              </Link>
            ) : (
              <>
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">{creatorUserLabel ?? "User"}</span>
              </>
            )}
          </PropertyRow>
        )}
        {issue.startedAt && (
          <PropertyRow label="Started">
            <span className="text-sm">{formatDate(issue.startedAt)}</span>
          </PropertyRow>
        )}
        {issue.completedAt && (
          <PropertyRow label="Completed">
            <span className="text-sm">{formatDate(issue.completedAt)}</span>
          </PropertyRow>
        )}
        <PropertyRow label="Created">
          <span className="text-sm">{formatDate(issue.createdAt)}</span>
        </PropertyRow>
        <PropertyRow label="Updated">
          <span className="text-sm">{timeAgo(issue.updatedAt)}</span>
        </PropertyRow>
      </div>
    </div>
  );
}
