import { EXECUTION_WORKSPACE_MODES } from "./constants";

interface ReusableWorkspace {
  id: string;
  name: string;
  status: string;
  branchName?: string | null;
  cwd?: string | null;
  mode?: string | null;
  lastUsedAt: string | Date;
}

interface ExecutionWorkspaceSectionProps {
  executionWorkspaceMode: string;
  setExecutionWorkspaceMode: (mode: string) => void;
  selectedExecutionWorkspaceId: string;
  setSelectedExecutionWorkspaceId: (id: string) => void;
  deduplicatedReusableWorkspaces: ReusableWorkspace[];
  selectedReusableExecutionWorkspace: ReusableWorkspace | undefined;
}

export function ExecutionWorkspaceSection({
  executionWorkspaceMode,
  setExecutionWorkspaceMode,
  selectedExecutionWorkspaceId,
  setSelectedExecutionWorkspaceId,
  deduplicatedReusableWorkspaces,
  selectedReusableExecutionWorkspace,
}: ExecutionWorkspaceSectionProps) {
  return (
    <div className="px-4 py-3 shrink-0 space-y-2">
      <div className="space-y-1.5">
        <div className="text-xs font-medium">Execution workspace</div>
        <div className="text-[11px] text-muted-foreground">
          Control whether this issue runs in the shared workspace, a new isolated workspace, or an existing one.
        </div>
        <select
          className="w-full rounded border border-border bg-transparent px-2 py-1.5 text-xs outline-none"
          value={executionWorkspaceMode}
          onChange={(e) => {
            setExecutionWorkspaceMode(e.target.value);
            if (e.target.value !== "reuse_existing") {
              setSelectedExecutionWorkspaceId("");
            }
          }}
        >
          {EXECUTION_WORKSPACE_MODES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {executionWorkspaceMode === "reuse_existing" && (
          <select
            className="w-full rounded border border-border bg-transparent px-2 py-1.5 text-xs outline-none"
            value={selectedExecutionWorkspaceId}
            onChange={(e) => setSelectedExecutionWorkspaceId(e.target.value)}
          >
            <option value="">Choose an existing workspace</option>
            {deduplicatedReusableWorkspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name} · {workspace.status} ·{" "}
                {workspace.branchName ?? workspace.cwd ?? workspace.id.slice(0, 8)}
              </option>
            ))}
          </select>
        )}
        {executionWorkspaceMode === "reuse_existing" && selectedReusableExecutionWorkspace && (
          <div className="text-[11px] text-muted-foreground">
            Reusing {selectedReusableExecutionWorkspace.name} from{" "}
            {selectedReusableExecutionWorkspace.branchName ??
              selectedReusableExecutionWorkspace.cwd ??
              "existing execution workspace"}
            .
          </div>
        )}
      </div>
    </div>
  );
}
