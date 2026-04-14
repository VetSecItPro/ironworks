import { useCallback, useRef, useState } from "react";
import type { Issue, ExecutionWorkspace } from "@ironworksai/shared";
import { cn } from "../../lib/utils";
import { Check, Copy } from "lucide-react";

export const EXECUTION_WORKSPACE_OPTIONS = [
  { value: "shared_workspace", label: "Project default" },
  { value: "isolated_workspace", label: "New isolated workspace" },
  { value: "reuse_existing", label: "Reuse existing workspace" },
] as const;

export function issueModeForExistingWorkspace(mode: string | null | undefined) {
  if (mode === "isolated_workspace" || mode === "operator_branch" || mode === "shared_workspace") return mode;
  if (mode === "adapter_managed" || mode === "cloud_sandbox") return "agent_default";
  return "shared_workspace";
}

export function shouldPresentExistingWorkspaceSelection(issue: Issue) {
  const persistedMode =
    issue.currentExecutionWorkspace?.mode
    ?? issue.executionWorkspaceSettings?.mode
    ?? issue.executionWorkspacePreference;
  return Boolean(
    issue.executionWorkspaceId &&
    (persistedMode === "isolated_workspace" || persistedMode === "operator_branch"),
  );
}

export function defaultExecutionWorkspaceModeForProject(
  project: { executionWorkspacePolicy?: { enabled?: boolean; defaultMode?: string | null } | null } | null | undefined,
) {
  const defaultMode = project?.executionWorkspacePolicy?.enabled ? project.executionWorkspacePolicy.defaultMode : null;
  if (defaultMode === "isolated_workspace" || defaultMode === "operator_branch") return defaultMode;
  if (defaultMode === "adapter_default") return "agent_default";
  return "shared_workspace";
}

export function workspaceModeLabel(mode: string | null | undefined) {
  switch (mode) {
    case "isolated_workspace": return "Isolated workspace";
    case "operator_branch": return "Operator branch";
    case "cloud_sandbox": return "Cloud sandbox";
    case "adapter_managed": return "Adapter managed";
    default: return "Workspace";
  }
}

export function configuredWorkspaceLabel(
  selection: string | null | undefined,
  reusableWorkspace: ExecutionWorkspace | null,
) {
  switch (selection) {
    case "isolated_workspace":
      return "New isolated workspace";
    case "reuse_existing":
      return reusableWorkspace?.mode === "isolated_workspace"
        ? "Existing isolated workspace"
        : "Reuse existing workspace";
    default:
      return "Project default";
  }
}

export function statusBadge(status: string) {
  const colors: Record<string, string> = {
    active: "bg-green-500/15 text-green-700 dark:text-green-400",
    idle: "bg-muted text-muted-foreground",
    in_review: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    archived: "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", colors[status] ?? colors.idle)}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function BreakablePath({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const segments = text.split(/(?<=[\/-])/);
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) parts.push(<wbr key={i} />);
    parts.push(segments[i]);
  }
  return <>{parts}</>;
}

export function CopyableInline({ value, label, mono }: { value: string; label?: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch { /* noop */ }
  }, [value]);

  return (
    <span className="inline-flex items-center gap-1 group/copy">
      {label && <span className="text-muted-foreground">{label}</span>}
      <span className={cn("min-w-0", mono && "font-mono")} style={{ overflowWrap: "anywhere" }}>
        <BreakablePath text={value} />
      </span>
      <button
        type="button"
        className="shrink-0 p-0.5 rounded hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground opacity-0 group-hover/copy:opacity-100 focus:opacity-100"
        onClick={handleCopy}
        title={copied ? "Copied!" : "Copy"}
      >
        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      </button>
    </span>
  );
}
