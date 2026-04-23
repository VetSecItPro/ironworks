import type { LlmProviderEntry } from "./types";

export const TASK_TEMPLATES = [
  {
    label: "Audit the codebase",
    title: "Audit the codebase",
    description:
      "Review the entire codebase for code quality, security issues, outdated dependencies, and architectural concerns. Produce a report with prioritized recommendations.",
  },
  {
    label: "Create marketing plan",
    title: "Create a marketing plan",
    description:
      "Develop a comprehensive marketing strategy including target audience analysis, channel selection, content calendar, and KPI targets for the next quarter.",
  },
  {
    label: "Review security posture",
    title: "Review security posture",
    description:
      "Perform a thorough security audit covering authentication, authorization, data handling, API security, and infrastructure. Flag critical issues and recommend fixes.",
  },
  {
    label: "Analyze team structure",
    title: "Analyze team structure",
    description:
      "Evaluate the current team composition, identify skill gaps, recommend hiring priorities, and suggest organizational improvements for better efficiency.",
  },
] as const;

export const LLM_PROVIDERS: readonly LlmProviderEntry[] = [
  {
    key: "anthropic",
    label: "Anthropic (Claude)",
    secretName: "ANTHROPIC_API_KEY",
    placeholder: "sk-ant-...",
    hint: "console.anthropic.com",
    subscription: {
      label: "Claude Pro / Max",
      loginCommand: "claude login",
      tagline: "Use your existing Claude subscription — no per-token API cost.",
    },
  },
  {
    key: "openai",
    label: "OpenAI (ChatGPT)",
    secretName: "OPENAI_API_KEY",
    placeholder: "sk-...",
    hint: "platform.openai.com/api-keys",
    subscription: {
      label: "ChatGPT Plus / Pro",
      loginCommand: "codex login",
      tagline: "Use your existing ChatGPT subscription — no per-token API cost.",
    },
  },
  {
    key: "google",
    label: "Google (Gemini)",
    secretName: "GEMINI_API_KEY",
    placeholder: "AIza...",
    hint: "aistudio.google.com/apikey",
    subscription: {
      label: "Gemini Advanced",
      loginCommand: "gemini",
      tagline: "Sign in with Google to use your Gemini subscription.",
    },
  },
  {
    key: "openrouter",
    label: "OpenRouter",
    secretName: "OPENROUTER_API_KEY",
    placeholder: "sk-or-...",
    hint: "openrouter.ai/keys",
  },
  {
    key: "ollama_cloud",
    label: "Ollama Cloud",
    secretName: "OLLAMA_API_KEY",
    placeholder: "API key",
    hint: "ollama.com/settings",
  },
  {
    key: "ollama",
    label: "Ollama (self-hosted)",
    secretName: "OLLAMA_BASE_URL",
    placeholder: "http://localhost:11434",
    hint: "Your Ollama server URL",
  },
];

export const WIZARD_STORAGE_KEY = "ironworks_onboarding_wizard_state";

export const DEFAULT_TASK_DESCRIPTION = `You are the CEO. You set the direction for the company.

- hire a founding engineer
- write a hiring plan
- break the roadmap into concrete tasks and start delegating work`;

let rosterIdCounter = 0;
export function nextRosterId() {
  return `roster-${++rosterIdCounter}`;
}
