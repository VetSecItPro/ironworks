import { issueStatusText, issueStatusTextDefault, priorityColor, priorityColorDefault } from "../../lib/status-colors";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface IssueDraft {
  title: string;
  description: string;
  status: string;
  priority: string;
  assigneeValue: string;
  assigneeId?: string;
  projectId: string;
  goalId?: string;
  projectWorkspaceId?: string;
  assigneeModelOverride: string;
  assigneeThinkingEffort: string;
  assigneeChrome: boolean;
  executionWorkspaceMode?: string;
  selectedExecutionWorkspaceId?: string;
  useIsolatedExecutionWorkspace?: boolean;
}

export type StagedIssueFile = {
  id: string;
  file: File;
  kind: "document" | "attachment";
  documentKey?: string;
  title?: string | null;
};

export interface SimilarIssue {
  identifier: string;
  title: string;
  similarity: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const DRAFT_KEY = "ironworks:issue-draft";
export const DEBOUNCE_MS = 800;
export const STAGED_FILE_ACCEPT =
  "image/*,application/pdf,text/plain,text/markdown,application/json,text/csv,text/html,.md,.markdown";

export const ISSUE_OVERRIDE_ADAPTER_TYPES = new Set(["claude_local", "codex_local", "opencode_local"]);

export const ISSUE_THINKING_EFFORT_OPTIONS = {
  claude_local: [
    { value: "", label: "Default" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ],
  codex_local: [
    { value: "", label: "Default" },
    { value: "minimal", label: "Minimal" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ],
  opencode_local: [
    { value: "", label: "Default" },
    { value: "minimal", label: "Minimal" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "max", label: "Max" },
  ],
} as const;

export const statuses = [
  { value: "backlog", label: "Backlog", color: issueStatusText.backlog ?? issueStatusTextDefault },
  { value: "todo", label: "Todo", color: issueStatusText.todo ?? issueStatusTextDefault },
  { value: "in_progress", label: "In Progress", color: issueStatusText.in_progress ?? issueStatusTextDefault },
  { value: "in_review", label: "In Review", color: issueStatusText.in_review ?? issueStatusTextDefault },
  { value: "done", label: "Done", color: issueStatusText.done ?? issueStatusTextDefault },
];

export const priorities = [
  {
    value: "critical",
    label: "Critical",
    icon: "AlertTriangle" as const,
    color: priorityColor.critical ?? priorityColorDefault,
  },
  { value: "high", label: "High", icon: "ArrowUp" as const, color: priorityColor.high ?? priorityColorDefault },
  { value: "medium", label: "Medium", icon: "Minus" as const, color: priorityColor.medium ?? priorityColorDefault },
  { value: "low", label: "Low", icon: "ArrowDown" as const, color: priorityColor.low ?? priorityColorDefault },
];

export const EXECUTION_WORKSPACE_MODES = [
  { value: "shared_workspace", label: "Project default" },
  { value: "isolated_workspace", label: "New isolated workspace" },
  { value: "reuse_existing", label: "Reuse existing workspace" },
] as const;

export const ISSUE_TEMPLATES = [
  {
    key: "bug",
    label: "Bug Report",
    titlePrefix: "[Bug] ",
    description: `## Steps to Reproduce\n1. \n2. \n3. \n\n## Expected Behavior\n\n\n## Actual Behavior\n\n\n## Environment\n- Browser/OS: \n- Version: `,
    priority: "high",
  },
  {
    key: "feature",
    label: "Feature Request",
    titlePrefix: "[Feature] ",
    description: `## Problem\nDescribe the problem this feature would solve.\n\n## Proposed Solution\n\n\n## Alternatives Considered\n\n\n## Additional Context\n`,
    priority: "medium",
  },
  {
    key: "research",
    label: "Research Task",
    titlePrefix: "[Research] ",
    description: `## Objective\nWhat are we trying to learn or decide?\n\n## Key Questions\n- \n- \n\n## Resources\n- \n\n## Expected Output\nWhat deliverable should result from this research?\n`,
    priority: "medium",
  },
  {
    key: "chore",
    label: "Chore",
    titlePrefix: "[Chore] ",
    description: `## Task Description\n\n\n## Acceptance Criteria\n- [ ] \n- [ ] \n\n## Notes\n`,
    priority: "low",
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Smart Priority Suggestion (keyword-based)                          */
/* ------------------------------------------------------------------ */

const PRIORITY_KEYWORDS: Record<string, string[]> = {
  critical: [
    "urgent",
    "broken",
    "crash",
    "outage",
    "down",
    "emergency",
    "p0",
    "critical",
    "production down",
    "data loss",
    "security breach",
  ],
  high: ["bug", "error", "fail", "broken", "regression", "blocker", "important", "p1", "high"],
  medium: ["feature", "improve", "update", "change", "enhance", "refactor", "p2"],
  low: ["nice to have", "minor", "cosmetic", "typo", "cleanup", "chore", "p3", "low priority"],
};

export function suggestPriority(title: string): string | null {
  if (!title || title.length < 3) return null;
  const lower = title.toLowerCase();
  for (const priority of ["critical", "high", "medium", "low"] as const) {
    for (const keyword of PRIORITY_KEYWORDS[priority]) {
      if (lower.includes(keyword)) return priority;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Duplicate Issue Detection (fuzzy match)                            */
/* ------------------------------------------------------------------ */

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function computeSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const wordsA = new Set(a.split(" ").filter((w) => w.length > 2));
  const wordsB = new Set(b.split(" ").filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let matches = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) matches++;
  }
  return matches / Math.max(wordsA.size, wordsB.size);
}

export function findSimilarIssues(
  title: string,
  existingIssues: Array<{ identifier?: string | null; id: string; title: string }> | undefined,
): SimilarIssue[] {
  if (!title || title.length < 5 || !existingIssues || existingIssues.length === 0) return [];
  const normalizedTitle = normalizeForComparison(title);
  if (normalizedTitle.length < 3) return [];
  return existingIssues
    .map((issue) => ({
      identifier: issue.identifier ?? issue.id.slice(0, 8),
      title: issue.title,
      similarity: computeSimilarity(normalizedTitle, normalizeForComparison(issue.title)),
    }))
    .filter((match) => match.similarity >= 0.6)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);
}

/* ------------------------------------------------------------------ */
/*  Draft persistence                                                  */
/* ------------------------------------------------------------------ */

export function loadDraft(): IssueDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as IssueDraft;
  } catch {
    return null;
  }
}

export function saveDraft(draft: IssueDraft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

/* ------------------------------------------------------------------ */
/*  File utilities                                                     */
/* ------------------------------------------------------------------ */

export function isTextDocumentFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".md") ||
    name.endsWith(".markdown") ||
    name.endsWith(".txt") ||
    file.type === "text/markdown" ||
    file.type === "text/plain"
  );
}

export function fileBaseName(filename: string) {
  return filename.replace(/\.[^.]+$/, "");
}

export function slugifyDocumentKey(input: string) {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "document";
}

export function titleizeFilename(input: string) {
  return input
    .split(/[-_ ]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function createUniqueDocumentKey(baseKey: string, stagedFiles: StagedIssueFile[]) {
  const existingKeys = new Set(
    stagedFiles
      .filter((file) => file.kind === "document")
      .map((file) => file.documentKey)
      .filter((key): key is string => Boolean(key)),
  );
  if (!existingKeys.has(baseKey)) return baseKey;
  let suffix = 2;
  while (existingKeys.has(`${baseKey}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseKey}-${suffix}`;
}

export function formatFileSize(file: File) {
  if (file.size < 1024) return `${file.size} B`;
  if (file.size < 1024 * 1024) return `${(file.size / 1024).toFixed(1)} KB`;
  return `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ */
/*  Project / workspace defaults                                       */
/* ------------------------------------------------------------------ */

export function defaultProjectWorkspaceIdForProject(
  project:
    | {
        workspaces?: Array<{ id: string; isPrimary: boolean }>;
        executionWorkspacePolicy?: { defaultProjectWorkspaceId?: string | null } | null;
      }
    | null
    | undefined,
) {
  if (!project) return "";
  return (
    project.executionWorkspacePolicy?.defaultProjectWorkspaceId ??
    project.workspaces?.find((workspace) => workspace.isPrimary)?.id ??
    project.workspaces?.[0]?.id ??
    ""
  );
}

export function defaultExecutionWorkspaceModeForProject(
  project: { executionWorkspacePolicy?: { enabled?: boolean; defaultMode?: string | null } | null } | null | undefined,
) {
  const defaultMode = project?.executionWorkspacePolicy?.enabled ? project.executionWorkspacePolicy.defaultMode : null;
  if (defaultMode === "isolated_workspace" || defaultMode === "operator_branch" || defaultMode === "adapter_default") {
    return defaultMode === "adapter_default" ? "agent_default" : defaultMode;
  }
  return "shared_workspace";
}

export function issueExecutionWorkspaceModeForExistingWorkspace(mode: string | null | undefined) {
  if (mode === "isolated_workspace" || mode === "operator_branch" || mode === "shared_workspace") {
    return mode;
  }
  if (mode === "adapter_managed" || mode === "cloud_sandbox") {
    return "agent_default";
  }
  return "shared_workspace";
}

/* ------------------------------------------------------------------ */
/*  Adapter overrides                                                  */
/* ------------------------------------------------------------------ */

export function buildAssigneeAdapterOverrides(input: {
  adapterType: string | null | undefined;
  modelOverride: string;
  thinkingEffortOverride: string;
  chrome: boolean;
}): Record<string, unknown> | null {
  const adapterType = input.adapterType ?? null;
  if (!adapterType || !ISSUE_OVERRIDE_ADAPTER_TYPES.has(adapterType)) {
    return null;
  }

  const adapterConfig: Record<string, unknown> = {};
  if (input.modelOverride) adapterConfig.model = input.modelOverride;
  if (input.thinkingEffortOverride) {
    if (adapterType === "codex_local") {
      adapterConfig.modelReasoningEffort = input.thinkingEffortOverride;
    } else if (adapterType === "opencode_local") {
      adapterConfig.variant = input.thinkingEffortOverride;
    } else if (adapterType === "claude_local") {
      adapterConfig.effort = input.thinkingEffortOverride;
    }
  }
  if (adapterType === "claude_local" && input.chrome) {
    adapterConfig.chrome = true;
  }

  const overrides: Record<string, unknown> = {};
  if (Object.keys(adapterConfig).length > 0) {
    overrides.adapterConfig = adapterConfig;
  }
  return Object.keys(overrides).length > 0 ? overrides : null;
}
