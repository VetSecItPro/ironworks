export type Step = 1 | 2 | 3 | 4 | 5;

export type AdapterType =
  | "claude_local"
  | "codex_local"
  | "gemini_local"
  | "opencode_local"
  | "pi_local"
  | "cursor"
  | "http"
  | "openclaw_gateway";

export interface RosterItem {
  id: string;
  templateKey: string;
  name: string;
  role: string;
  reportsTo: string | null;
  suggestedAdapter: string;
  skills: string[];
  title: string;
}

export interface WizardPersistedState {
  step: Step;
  companyName: string;
  companyGoal: string;
  llmProvider: string;
  agentName: string;
  adapterType: AdapterType;
  taskTitle: string;
  taskDescription: string;
  extraTasks: { title: string; description: string }[];
  step2Mode: "pack" | "manual";
  selectedPackKey: string | null;
  createdCompanyId: string | null;
  createdCompanyPrefix: string | null;
  createdAgentId: string | null;
}

export interface LlmProviderEntry {
  key: string;
  label: string;
  secretName: string;
  placeholder: string;
  hint: string;
}
