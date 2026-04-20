import { AGENT_ROLE_LABELS } from "@ironworksai/shared";

/* ---- Help text for (?) tooltips ---- */
export const help: Record<string, string> = {
  name: "Display name for this agent.",
  title: "Job title shown in the org chart.",
  role: "Organizational role. Determines position and capabilities.",
  reportsTo: "The agent this one reports to in the org hierarchy.",
  capabilities: "Describes what this agent can do. Shown in the org chart and used for task routing.",
  adapterType:
    "How this agent runs: local CLI (Claude/Codex/OpenCode), OpenClaw Gateway, spawned process, or generic HTTP webhook.",
  cwd: "Deprecated legacy working directory fallback for local adapters. Existing agents may still carry this value, but new configurations should use project workspaces instead.",
  promptTemplate:
    "Sent on every heartbeat. Keep this small and dynamic. Use it for current-task framing, not large static instructions. Supports {{ agent.id }}, {{ agent.name }}, {{ agent.role }} and other template variables.",
  model: "Override the default model used by the adapter.",
  thinkingEffort: "Control model reasoning depth. Supported values vary by adapter/model.",
  chrome: "Enable Claude's Chrome integration by passing --chrome.",
  dangerouslySkipPermissions: "Run unattended by auto-approving adapter permission prompts when supported.",
  dangerouslyBypassSandbox: "Run Codex without sandbox restrictions. Required for filesystem/network access.",
  search: "Enable Codex web search capability during runs.",
  workspaceStrategy:
    "How Ironworks should realize an execution workspace for this agent. Keep project_primary for normal cwd execution, or use git_worktree for issue-scoped isolated checkouts.",
  workspaceBaseRef:
    "Base git ref used when creating a worktree branch. Leave blank to use the resolved workspace ref or HEAD.",
  workspaceBranchTemplate:
    "Template for naming derived branches. Supports {{issue.identifier}}, {{issue.title}}, {{agent.name}}, {{project.id}}, {{workspace.repoRef}}, and {{slug}}.",
  worktreeParentDir:
    "Directory where derived worktrees should be created. Absolute, ~-prefixed, and repo-relative paths are supported.",
  runtimeServicesJson:
    "Optional workspace runtime service definitions. Use this for shared app servers, workers, or other long-lived companion processes attached to the workspace.",
  maxTurnsPerRun: "Maximum number of agentic turns (tool calls) per heartbeat run.",
  command: "The command to execute (e.g. node, python).",
  localCommand:
    "Override the path to the CLI command you want the adapter to call (e.g. /usr/local/bin/claude, codex, opencode).",
  args: "Command-line arguments, comma-separated.",
  extraArgs: "Extra CLI arguments for local adapters, comma-separated.",
  envVars: "Environment variables injected into the adapter process. Use plain values or secret references.",
  bootstrapPrompt:
    "Only sent when Ironworks starts a fresh session. Use this for stable setup guidance that should not be repeated on every heartbeat.",
  payloadTemplateJson:
    "Optional JSON merged into remote adapter request payloads before Ironworks adds its standard wake and workspace fields.",
  webhookUrl: "The URL that receives POST requests when the agent is invoked.",
  heartbeatInterval: "Run this agent automatically on a timer. Useful for periodic tasks like checking for new work.",
  intervalSec: "Seconds between automatic heartbeat invocations.",
  timeoutSec: "Maximum seconds a run can take before being terminated. 0 means no timeout.",
  graceSec: "Seconds to wait after sending interrupt before force-killing the process.",
  wakeOnDemand: "Allow this agent to be woken by assignments, API calls, UI actions, or automated systems.",
  cooldownSec: "Minimum seconds between consecutive heartbeat runs.",
  maxConcurrentRuns: "Maximum number of heartbeat runs that can execute simultaneously for this agent.",
  budgetMonthlyCents: "Monthly spending limit in cents. 0 means no limit.",
};

export const adapterLabels: Record<string, string> = {
  claude_local: "Claude (local)",
  codex_local: "Codex (local)",
  gemini_local: "Gemini CLI (local)",
  opencode_local: "OpenCode (local)",
  openclaw_gateway: "OpenClaw Gateway",
  cursor: "Cursor (local)",
  process: "Process",
  http: "HTTP",
  // HTTP adapter family (Phase G)
  poe_api: "Poe API",
  anthropic_api: "Anthropic API",
  openai_api: "OpenAI API",
  openrouter_api: "OpenRouter API",
};

export const roleLabels = AGENT_ROLE_LABELS as Record<string, string>;
