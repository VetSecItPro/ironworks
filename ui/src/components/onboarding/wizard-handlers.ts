import {
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
  DEFAULT_CODEX_LOCAL_MODEL,
} from "@ironworksai/adapter-codex-local";
import { DEFAULT_CURSOR_LOCAL_MODEL } from "@ironworksai/adapter-cursor-local";
import { DEFAULT_GEMINI_LOCAL_MODEL } from "@ironworksai/adapter-gemini-local";
import type { AdapterEnvironmentTestResult } from "@ironworksai/shared";
import type { QueryClient } from "@tanstack/react-query";
import { getUIAdapter } from "../../adapters";
import { agentsApi } from "../../api/agents";
import { companiesApi } from "../../api/companies";
import { goalsApi } from "../../api/goals";
import { issuesApi } from "../../api/issues";
import { projectsApi } from "../../api/projects";
import { secretsApi } from "../../api/secrets";
import { teamTemplatesApi } from "../../api/teamTemplates";
import { parseOnboardingGoalInput } from "../../lib/onboarding-goal";
import {
  buildOnboardingIssuePayload,
  buildOnboardingProjectPayload,
  selectDefaultCompanyGoalId,
} from "../../lib/onboarding-launch";
import { queryKeys } from "../../lib/queryKeys";
import { defaultCreateValues } from "../agent-config-defaults";
import { LLM_PROVIDERS } from "./constants";
import type { AdapterType, LlmAuthMode, RosterItem, Step } from "./types";

export interface WizardHandlerDeps {
  queryClient: QueryClient;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  setStep: (v: Step) => void;
  setCreatedCompanyId: (v: string | null) => void;
  setCreatedCompanyPrefix: (v: string | null) => void;
  setCreatedCompanyGoalId: (v: string | null) => void;
  setCreatedAgentId: (v: string | null) => void;
  setCreatedProjectId: (v: string | null) => void;
  setCreatedIssueRef: (v: string | null) => void;
  setSelectedCompanyId: (v: string) => void;
  setLlmSaved: (v: boolean) => void;
  setPackCreating: (v: boolean) => void;
  setPackProgress: (v: { done: number; total: number } | null) => void;
  setAdapterEnvResult: (v: AdapterEnvironmentTestResult | null) => void;
  setAdapterEnvError: (v: string | null) => void;
  setAdapterEnvLoading: (v: boolean) => void;
  setForceUnsetAnthropicApiKey: (v: boolean) => void;
  setUnsetAnthropicLoading: (v: boolean) => void;
}

export function buildAdapterConfig(
  adapterType: AdapterType,
  model: string,
  command: string,
  args: string,
  url: string,
  forceUnsetAnthropicApiKey: boolean,
): Record<string, unknown> {
  const adapter = getUIAdapter(adapterType);
  const config = adapter.buildAdapterConfig({
    ...defaultCreateValues,
    adapterType,
    model:
      adapterType === "codex_local"
        ? model || DEFAULT_CODEX_LOCAL_MODEL
        : adapterType === "gemini_local"
          ? model || DEFAULT_GEMINI_LOCAL_MODEL
          : adapterType === "cursor"
            ? model || DEFAULT_CURSOR_LOCAL_MODEL
            : model,
    command,
    args,
    url,
    dangerouslySkipPermissions: adapterType === "claude_local" || adapterType === "opencode_local",
    dangerouslyBypassSandbox:
      adapterType === "codex_local"
        ? DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX
        : defaultCreateValues.dangerouslyBypassSandbox,
  });
  if (adapterType === "claude_local" && forceUnsetAnthropicApiKey) {
    const env =
      typeof config.env === "object" && config.env !== null && !Array.isArray(config.env)
        ? { ...(config.env as Record<string, unknown>) }
        : {};
    env.ANTHROPIC_API_KEY = { type: "plain", value: "" };
    config.env = env;
  }
  return config;
}

export async function runAdapterEnvironmentTest(
  deps: WizardHandlerDeps,
  createdCompanyId: string | null,
  adapterType: AdapterType,
  adapterConfig: Record<string, unknown>,
): Promise<AdapterEnvironmentTestResult | null> {
  if (!createdCompanyId) {
    deps.setAdapterEnvError("Create or select a company before testing adapter environment.");
    return null;
  }
  deps.setAdapterEnvLoading(true);
  deps.setAdapterEnvError(null);
  try {
    const result = await agentsApi.testEnvironment(createdCompanyId, adapterType, { adapterConfig });
    deps.setAdapterEnvResult(result);
    return result;
  } catch (err) {
    deps.setAdapterEnvError(err instanceof Error ? err.message : "Adapter environment test failed");
    return null;
  } finally {
    deps.setAdapterEnvLoading(false);
  }
}

/**
 * Step 1 → Step 2: pure client advance. No server call.
 *
 * Wizard architecture (2026-04-25 refactor): all server-side creates are
 * deferred to handleLaunch. Steps 1-4 hold pure client state — closing the
 * tab mid-flow leaves zero rows in the DB. Avoids the partial-commit /
 * duplicate-prefix retry loops the prior flow was prone to.
 */
export function handleStep1Next(deps: WizardHandlerDeps, companyName: string, _companyGoal: string) {
  if (!companyName.trim()) return;
  deps.setError(null);
  deps.setStep(2);
}

/**
 * Step 2 → Step 3: pure client advance. The actual secret save happens in
 * handleLaunch once the company exists. llmSaved tracks whether the user
 * intentionally moved through (vs Skip-for-now) so the Launch summary can
 * render the right badge.
 */
export function handleStep2LlmNext(
  deps: WizardHandlerDeps,
  llmProvider: string,
  llmAuthMode: LlmAuthMode,
  llmApiKey: string,
) {
  const provider = LLM_PROVIDERS.find((p) => p.key === llmProvider) ?? LLM_PROVIDERS[0];
  if (llmAuthMode === "subscription" && provider.subscription) {
    deps.setLlmSaved(true);
    deps.setError(null);
    deps.setStep(3);
    return;
  }
  if (!llmApiKey.trim()) return;
  deps.setLlmSaved(true);
  deps.setError(null);
  deps.setStep(3);
}

/**
 * Step 3 (manual) → Step 4: validate inputs without creating the agent.
 *
 * The opencode_local model-existence checks still run client-side (they only
 * read the discovered models list, which the agent step has already loaded).
 * Local-adapter env tests are deferred — the test endpoint requires a real
 * companyId, and we don't have one until launch. Agent creation itself
 * happens in handleLaunch.
 */
export function handleStep2Next(
  deps: WizardHandlerDeps,
  adapterType: AdapterType,
  agentName: string,
  model: string,
  adapterModels: Array<{ id: string; label: string }> | undefined,
  adapterModelsError: Error | null,
  adapterModelsLoading: boolean,
  adapterModelsFetching: boolean,
) {
  if (!agentName.trim()) return;
  if (adapterType === "opencode_local") {
    const selectedModelId = model.trim();
    if (!selectedModelId) {
      deps.setError("OpenCode requires an explicit model in provider/model format.");
      return;
    }
    if (adapterModelsError) {
      deps.setError(adapterModelsError.message || "Failed to load OpenCode models.");
      return;
    }
    if (adapterModelsLoading || adapterModelsFetching) {
      deps.setError("OpenCode models are still loading. Please wait and try again.");
      return;
    }
    const discovered = adapterModels ?? [];
    if (!discovered.some((e) => e.id === selectedModelId)) {
      deps.setError(
        discovered.length === 0
          ? "No OpenCode models discovered. Run `opencode models` and authenticate providers."
          : `Configured OpenCode model is unavailable: ${selectedModelId}`,
      );
      return;
    }
  }
  deps.setError(null);
  deps.setStep(4);
}

/**
 * Step 3 (pack) → Step 4: client-only advance. The actual team-pack deploy
 * fires from handleLaunch.
 */
export function handlePackDeploy(deps: WizardHandlerDeps, rosterItems: RosterItem[]) {
  if (rosterItems.length === 0) return;
  deps.setError(null);
  deps.setStep(4);
}

/**
 * Sets a flag in wizard state that buildAdapterConfig consumes to inject
 * `ANTHROPIC_API_KEY=""` into the adapter env on launch. Pre-refactor this
 * also updated a live agent and re-ran the env test; both are now deferred
 * to launch. If the env was the issue, the agent create at launch will
 * fail with a clear error and the user can decide what to do.
 */
export function handleUnsetAnthropicApiKey(deps: WizardHandlerDeps) {
  deps.setError(null);
  deps.setAdapterEnvError(null);
  deps.setForceUnsetAnthropicApiKey(true);
}

export interface LaunchParams {
  // Step 1
  companyName: string;
  companyGoal: string;
  // Step 2
  llmProvider: string;
  llmAuthMode: LlmAuthMode;
  llmApiKey: string;
  // Step 3
  step2Mode: "pack" | "manual";
  rosterItems: RosterItem[];
  agentName: string;
  adapterType: AdapterType;
  adapterConfig: Record<string, unknown>;
  // Step 4
  taskTitle: string;
  taskDescription: string;
  extraTasks: { title: string; description: string }[];
  // App glue
  reset: () => void;
  closeOnboarding: () => void;
  navigate: (path: string) => void;
}

/**
 * Single orchestrator that performs every server-side create the wizard
 * implies. Runs in dependency order: company → goal → llm secret → agents
 * → first task. On any failure, no further steps run and the user sees an
 * error in-wizard (their inputs are preserved). The company row may exist
 * if a later step failed; that's a known imperfection — preferable to
 * eager creates that strand orphans across abandoned wizards.
 */
export async function handleLaunch(deps: WizardHandlerDeps, params: LaunchParams) {
  if (!params.companyName.trim()) return;
  deps.setLoading(true);
  deps.setError(null);

  let companyId: string | null = null;
  let companyPrefix: string | null = null;

  try {
    // 1. Company
    const company = await companiesApi.create({ name: params.companyName.trim() });
    companyId = company.id;
    companyPrefix = company.issuePrefix;
    deps.setCreatedCompanyId(company.id);
    deps.setCreatedCompanyPrefix(company.issuePrefix);
    deps.setSelectedCompanyId(company.id);
    deps.queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });

    // 2. Company goal (optional)
    let goalId: string | null = null;
    if (params.companyGoal.trim()) {
      const parsedGoal = parseOnboardingGoalInput(params.companyGoal);
      const goal = await goalsApi.create(company.id, {
        title: parsedGoal.title,
        ...(parsedGoal.description ? { description: parsedGoal.description } : {}),
        level: "company",
        status: "active",
      });
      goalId = goal.id;
      deps.setCreatedCompanyGoalId(goalId);
      deps.queryClient.invalidateQueries({ queryKey: queryKeys.goals.list(company.id) });
    }

    // 3. LLM API key (api_key mode only — subscription mode relies on container CLI auth)
    const provider = LLM_PROVIDERS.find((p) => p.key === params.llmProvider) ?? LLM_PROVIDERS[0];
    const isSubscription = params.llmAuthMode === "subscription" && Boolean(provider.subscription);
    if (!isSubscription && params.llmApiKey.trim()) {
      await secretsApi.create(company.id, {
        name: provider.secretName,
        value: params.llmApiKey.trim(),
        description: `${provider.label} API key for LLM access`,
      });
    }

    // 4. Agents — pack or manual single
    let primaryAgentId: string | null = null;
    if (params.step2Mode === "pack" && params.rosterItems.length > 0) {
      deps.setPackCreating(true);
      deps.setPackProgress({ done: 0, total: params.rosterItems.length });
      try {
        const templateDetails = new Map<string, { soul: string; agents: string }>();
        try {
          const uniqueKeys = [...new Set(params.rosterItems.map((r) => r.templateKey))];
          const details = await Promise.all(uniqueKeys.map((key) => teamTemplatesApi.getRole(key)));
          for (const d of details) templateDetails.set(d.key, { soul: d.soul, agents: d.agents });
        } catch {
          /* Continue without template content */
        }
        const sorted = [...params.rosterItems].sort((a, b) => {
          if (!a.reportsTo) return -1;
          if (!b.reportsTo) return 1;
          return 0;
        });
        const agentPayloads = sorted.map((item) => {
          const template = templateDetails.get(item.templateKey);
          return {
            templateKey: item.templateKey,
            name: item.name.trim() || item.title,
            role: item.role,
            title: item.title ?? null,
            reportsTo: item.reportsTo ?? null,
            suggestedAdapter: item.suggestedAdapter ?? null,
            skills: item.skills,
            agentsMd: template?.agents ?? null,
          };
        });
        const result = await agentsApi.deployTeamPack(company.id, {
          agents: agentPayloads,
          adapterType: params.adapterType,
          adapterConfig: params.adapterConfig,
        });
        deps.setPackProgress({ done: sorted.length, total: sorted.length });
        if (result.agents.length > 0) {
          primaryAgentId = result.agents[0].id;
          deps.setCreatedAgentId(result.agents[0].id);
        }
        deps.queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(company.id) });
      } finally {
        deps.setPackCreating(false);
        deps.setPackProgress(null);
      }
    } else if (params.step2Mode === "manual" && params.agentName.trim()) {
      const agent = await agentsApi.create(company.id, {
        name: params.agentName.trim(),
        role: "ceo",
        adapterType: params.adapterType,
        adapterConfig: params.adapterConfig,
        runtimeConfig: {
          heartbeat: { enabled: true, intervalSec: 3600, wakeOnDemand: true, cooldownSec: 10, maxConcurrentRuns: 1 },
        },
      });
      primaryAgentId = agent.id;
      deps.setCreatedAgentId(agent.id);
      deps.queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(company.id) });
    }

    // 5. Starter task (optional)
    let issueRef: string | null = null;
    const hasTask = params.taskTitle.trim().length > 0 && primaryAgentId !== null;
    if (hasTask && primaryAgentId) {
      let projGoalId = goalId;
      if (!projGoalId) {
        const goals = await goalsApi.list(company.id);
        projGoalId = selectDefaultCompanyGoalId(goals);
        deps.setCreatedCompanyGoalId(projGoalId);
      }
      const project = await projectsApi.create(company.id, buildOnboardingProjectPayload(projGoalId));
      deps.setCreatedProjectId(project.id);
      deps.queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(company.id) });
      const issue = await issuesApi.create(
        company.id,
        buildOnboardingIssuePayload({
          title: params.taskTitle,
          description: params.taskDescription,
          assigneeAgentId: primaryAgentId,
          projectId: project.id,
          goalId: projGoalId,
        }),
      );
      issueRef = issue.identifier ?? issue.id;
      deps.setCreatedIssueRef(issueRef);
      for (const extra of params.extraTasks) {
        if (!extra.title.trim()) continue;
        try {
          await issuesApi.create(
            company.id,
            buildOnboardingIssuePayload({
              title: extra.title,
              description: extra.description,
              assigneeAgentId: primaryAgentId,
              projectId: project.id,
              goalId: projGoalId,
            }),
          );
        } catch {
          /* Non-blocking */
        }
      }
      deps.queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(company.id) });
    }

    // 6. Cleanup + navigate
    params.reset();
    params.closeOnboarding();
    if (issueRef) {
      params.navigate(companyPrefix ? `/${companyPrefix}/issues/${issueRef}` : `/issues/${issueRef}`);
    } else {
      params.navigate(companyPrefix ? `/${companyPrefix}/agents` : "/agents");
    }
  } catch (err) {
    deps.setError(err instanceof Error ? err.message : "Launch failed — please retry");
    // Note: a partial company may exist if a later step failed. The user can
    // retry from the wizard (Launch button is still active) and subsequent
    // creates will skip what already succeeded once we add resume support.
  } finally {
    deps.setLoading(false);
  }
}
