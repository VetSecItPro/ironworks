// "system-prompt-injected" added in Phase G: HTTP adapters inject skills as text
// into the system prompt rather than syncing files to disk. This is a supported mode,
// not "unsupported" — reporting "unsupported" was misleading before G.6.
export type AgentSkillSyncMode = "unsupported" | "persistent" | "ephemeral" | "system-prompt-injected";

export type AgentSkillState = "available" | "configured" | "installed" | "missing" | "stale" | "external";

export type AgentSkillOrigin = "company_managed" | "ironworks_required" | "user_installed" | "external_unknown";

export interface AgentSkillEntry {
  key: string;
  runtimeName: string | null;
  desired: boolean;
  managed: boolean;
  required?: boolean;
  requiredReason?: string | null;
  state: AgentSkillState;
  origin?: AgentSkillOrigin;
  originLabel?: string | null;
  locationLabel?: string | null;
  readOnly?: boolean;
  sourcePath?: string | null;
  targetPath?: string | null;
  detail?: string | null;
}

export interface AgentSkillSnapshot {
  adapterType: string;
  supported: boolean;
  mode: AgentSkillSyncMode;
  desiredSkills: string[];
  entries: AgentSkillEntry[];
  warnings: string[];
}

export interface AgentSkillSyncRequest {
  desiredSkills: string[];
}
