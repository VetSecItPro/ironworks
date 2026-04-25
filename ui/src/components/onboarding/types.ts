export type Step = 1 | 2 | 3 | 4 | 5;

export type AdapterType =
  | "claude_local"
  | "codex_local"
  | "gemini_local"
  | "opencode_local"
  | "pi_local"
  | "cursor"
  | "http"
  | "openclaw_gateway"
  | "openrouter_api";

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

export type LlmAuthMode = "api_key" | "subscription";

export interface WizardPersistedState {
  step: Step;
  companyName: string;
  companyGoal: string;
  llmProvider: string;
  llmAuthMode: LlmAuthMode;
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
  /**
   * When defined, the provider supports an OAuth/subscription path in addition
   * to the API-key path. The UI surfaces a dual-mode selector; picking
   * subscription skips the secret save step and relies on the local CLI's
   * own OAuth session (e.g. `claude login`, `codex login`, `gemini` login).
   */
  subscription?: {
    /** Consumer-friendly product name shown in the radio label (e.g. "Claude Pro"). */
    label: string;
    /** Exact CLI subcommand the user runs once to authenticate (e.g. "claude login"). */
    loginCommand: string;
    /** Short description under the radio — one line only. */
    tagline: string;
  };
}
