import type { QueryClient } from "@tanstack/react-query";
import type { AdapterEnvironmentTestResult } from "@ironworksai/shared";
import { companiesApi } from "../../api/companies";
import { goalsApi } from "../../api/goals";
import { agentsApi } from "../../api/agents";
import { teamTemplatesApi } from "../../api/teamTemplates";
import { issuesApi } from "../../api/issues";
import { secretsApi } from "../../api/secrets";
import { projectsApi } from "../../api/projects";
import { queryKeys } from "../../lib/queryKeys";
import { getUIAdapter } from "../../adapters";
import { defaultCreateValues } from "../agent-config-defaults";
import { parseOnboardingGoalInput } from "../../lib/onboarding-goal";
import {
  buildOnboardingIssuePayload,
  buildOnboardingProjectPayload,
  selectDefaultCompanyGoalId,
} from "../../lib/onboarding-launch";
import {
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
  DEFAULT_CODEX_LOCAL_MODEL,
} from "@ironworksai/adapter-codex-local";
import { DEFAULT_CURSOR_LOCAL_MODEL } from "@ironworksai/adapter-cursor-local";
import { DEFAULT_GEMINI_LOCAL_MODEL } from "@ironworksai/adapter-gemini-local";
import { LLM_PROVIDERS } from "./constants";
import type { AdapterType, RosterItem, Step } from "./types";

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
      adapterType === "codex_local" ? model || DEFAULT_CODEX_LOCAL_MODEL
      : adapterType === "gemini_local" ? model || DEFAULT_GEMINI_LOCAL_MODEL
      : adapterType === "cursor" ? model || DEFAULT_CURSOR_LOCAL_MODEL
      : model,
    command, args, url,
    dangerouslySkipPermissions: adapterType === "claude_local" || adapterType === "opencode_local",
    dangerouslyBypassSandbox: adapterType === "codex_local"
      ? DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX
      : defaultCreateValues.dangerouslyBypassSandbox,
  });
  if (adapterType === "claude_local" && forceUnsetAnthropicApiKey) {
    const env = typeof config.env === "object" && config.env !== null && !Array.isArray(config.env)
      ? { ...(config.env as Record<string, unknown>) } : {};
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

export async function handleStep1Next(
  deps: WizardHandlerDeps,
  companyName: string,
  companyGoal: string,
) {
  deps.setLoading(true);
  deps.setError(null);
  try {
    const company = await companiesApi.create({ name: companyName.trim() });
    deps.setCreatedCompanyId(company.id);
    deps.setCreatedCompanyPrefix(company.issuePrefix);
    deps.setSelectedCompanyId(company.id);
    deps.queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    if (companyGoal.trim()) {
      const parsedGoal = parseOnboardingGoalInput(companyGoal);
      const goal = await goalsApi.create(company.id, {
        title: parsedGoal.title,
        ...(parsedGoal.description ? { description: parsedGoal.description } : {}),
        level: "company",
        status: "active",
      });
      deps.setCreatedCompanyGoalId(goal.id);
      deps.queryClient.invalidateQueries({ queryKey: queryKeys.goals.list(company.id) });
    } else {
      deps.setCreatedCompanyGoalId(null);
    }
    deps.setStep(2);
  } catch (err) {
    deps.setError(err instanceof Error ? err.message : "Failed to create company");
  } finally {
    deps.setLoading(false);
  }
}

export async function handleStep2LlmNext(
  deps: WizardHandlerDeps,
  createdCompanyId: string | null,
  llmProvider: string,
  llmApiKey: string,
) {
  if (!llmApiKey.trim() || !createdCompanyId) return;
  deps.setLoading(true);
  deps.setError(null);
  try {
    const provider = LLM_PROVIDERS.find((p) => p.key === llmProvider) ?? LLM_PROVIDERS[0];
    await secretsApi.create(createdCompanyId, {
      name: provider.secretName,
      value: llmApiKey.trim(),
      description: `${provider.label} API key for LLM access`,
    });
    deps.setLlmSaved(true);
    deps.setStep(3);
  } catch (err) {
    deps.setError(err instanceof Error ? err.message : "Failed to save API key");
  } finally {
    deps.setLoading(false);
  }
}

export async function handleStep2Next(
  deps: WizardHandlerDeps,
  createdCompanyId: string | null,
  adapterType: AdapterType,
  agentName: string,
  adapterConfig: Record<string, unknown>,
  model: string,
  isLocalAdapter: boolean,
  adapterEnvResult: AdapterEnvironmentTestResult | null,
  adapterModels: Array<{ id: string; label: string }> | undefined,
  adapterModelsError: Error | null,
  adapterModelsLoading: boolean,
  adapterModelsFetching: boolean,
  doRunEnvTest: () => Promise<AdapterEnvironmentTestResult | null>,
) {
  if (!createdCompanyId) return;
  deps.setLoading(true);
  deps.setError(null);
  try {
    if (adapterType === "opencode_local") {
      const selectedModelId = model.trim();
      if (!selectedModelId) { deps.setError("OpenCode requires an explicit model in provider/model format."); return; }
      if (adapterModelsError) { deps.setError(adapterModelsError.message || "Failed to load OpenCode models."); return; }
      if (adapterModelsLoading || adapterModelsFetching) { deps.setError("OpenCode models are still loading. Please wait and try again."); return; }
      const discovered = adapterModels ?? [];
      if (!discovered.some((e) => e.id === selectedModelId)) {
        deps.setError(discovered.length === 0
          ? "No OpenCode models discovered. Run `opencode models` and authenticate providers."
          : `Configured OpenCode model is unavailable: ${selectedModelId}`);
        return;
      }
    }
    if (isLocalAdapter) {
      const result = adapterEnvResult ?? (await doRunEnvTest());
      if (!result) return;
    }
    const agent = await agentsApi.create(createdCompanyId, {
      name: agentName.trim(),
      role: "ceo",
      adapterType,
      adapterConfig,
      runtimeConfig: { heartbeat: { enabled: true, intervalSec: 3600, wakeOnDemand: true, cooldownSec: 10, maxConcurrentRuns: 1 } },
    });
    deps.setCreatedAgentId(agent.id);
    deps.queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(createdCompanyId) });
    deps.setStep(4);
  } catch (err) {
    deps.setError(err instanceof Error ? err.message : "Failed to create agent");
  } finally {
    deps.setLoading(false);
  }
}

export async function handlePackDeploy(
  deps: WizardHandlerDeps,
  createdCompanyId: string | null,
  rosterItems: RosterItem[],
  adapterType: AdapterType,
  adapterConfig: Record<string, unknown>,
) {
  if (!createdCompanyId || rosterItems.length === 0) return;
  deps.setPackCreating(true);
  deps.setError(null);
  deps.setPackProgress({ done: 0, total: rosterItems.length });
  const templateDetails = new Map<string, { soul: string; agents: string }>();
  try {
    const uniqueKeys = [...new Set(rosterItems.map((r) => r.templateKey))];
    const details = await Promise.all(uniqueKeys.map((key) => teamTemplatesApi.getRole(key)));
    for (const detail of details) templateDetails.set(detail.key, { soul: detail.soul, agents: detail.agents });
  } catch { /* Continue without templates */ }
  try {
    const sorted = [...rosterItems].sort((a, b) => { if (!a.reportsTo) return -1; if (!b.reportsTo) return 1; return 0; });
    const agentPayloads = sorted.map((item) => {
      const template = templateDetails.get(item.templateKey);
      return {
        templateKey: item.templateKey, name: item.name.trim() || item.title,
        role: item.role, title: item.title ?? null, reportsTo: item.reportsTo ?? null,
        suggestedAdapter: item.suggestedAdapter ?? null, skills: item.skills,
        agentsMd: template?.agents ?? null,
      };
    });
    deps.setPackProgress({ done: 0, total: sorted.length });
    const result = await agentsApi.deployTeamPack(createdCompanyId, { agents: agentPayloads, adapterType, adapterConfig });
    deps.setPackProgress({ done: sorted.length, total: sorted.length });
    if (result.agents.length > 0) deps.setCreatedAgentId(result.agents[0].id);
    deps.queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(createdCompanyId) });
    deps.setStep(4);
  } catch (err) {
    deps.setError(err instanceof Error ? err.message : "Failed to create team");
  } finally {
    deps.setPackCreating(false);
    deps.setPackProgress(null);
  }
}

export async function handleUnsetAnthropicApiKey(
  deps: WizardHandlerDeps,
  createdCompanyId: string | null,
  createdAgentId: string | null,
  adapterType: AdapterType,
  adapterConfig: Record<string, unknown>,
) {
  if (!createdCompanyId) return;
  deps.setUnsetAnthropicLoading(true);
  deps.setError(null);
  deps.setAdapterEnvError(null);
  deps.setForceUnsetAnthropicApiKey(true);
  const configWithUnset = { ...adapterConfig };
  const env = typeof configWithUnset.env === "object" && configWithUnset.env !== null && !Array.isArray(configWithUnset.env)
    ? { ...(configWithUnset.env as Record<string, unknown>) } : {};
  env.ANTHROPIC_API_KEY = { type: "plain", value: "" };
  configWithUnset.env = env;
  try {
    if (createdAgentId) {
      await agentsApi.update(createdAgentId, { adapterConfig: configWithUnset }, createdCompanyId);
      deps.queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(createdCompanyId) });
    }
    const result = await runAdapterEnvironmentTest(deps, createdCompanyId, adapterType, configWithUnset);
    if (result?.status === "fail") {
      deps.setError("Retried with ANTHROPIC_API_KEY unset in adapter config, but the environment test is still failing.");
    }
  } catch (err) {
    deps.setError(err instanceof Error ? err.message : "Failed to unset ANTHROPIC_API_KEY and retry.");
  } finally {
    deps.setUnsetAnthropicLoading(false);
  }
}

export async function handleLaunch(
  deps: WizardHandlerDeps,
  createdCompanyId: string | null,
  createdAgentId: string | null,
  createdCompanyGoalId: string | null,
  createdProjectId: string | null,
  createdIssueRef: string | null,
  createdCompanyPrefix: string | null,
  taskTitle: string,
  taskDescription: string,
  extraTasks: { title: string; description: string }[],
  reset: () => void,
  closeOnboarding: () => void,
  navigate: (path: string) => void,
) {
  if (!createdCompanyId || !createdAgentId) return;
  deps.setLoading(true);
  deps.setError(null);
  try {
    let goalId = createdCompanyGoalId;
    if (!goalId) {
      const goals = await goalsApi.list(createdCompanyId);
      goalId = selectDefaultCompanyGoalId(goals);
      deps.setCreatedCompanyGoalId(goalId);
    }
    let projectId = createdProjectId;
    if (!projectId) {
      const project = await projectsApi.create(createdCompanyId, buildOnboardingProjectPayload(goalId));
      projectId = project.id;
      deps.setCreatedProjectId(projectId);
      deps.queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(createdCompanyId) });
    }
    let issueRef = createdIssueRef;
    if (!issueRef) {
      const issue = await issuesApi.create(createdCompanyId, buildOnboardingIssuePayload({
        title: taskTitle, description: taskDescription,
        assigneeAgentId: createdAgentId, projectId, goalId,
      }));
      issueRef = issue.identifier ?? issue.id;
      deps.setCreatedIssueRef(issueRef);
      for (const extra of extraTasks) {
        if (!extra.title.trim()) continue;
        try {
          await issuesApi.create(createdCompanyId, buildOnboardingIssuePayload({
            title: extra.title, description: extra.description,
            assigneeAgentId: createdAgentId, projectId, goalId,
          }));
        } catch { /* Non-blocking */ }
      }
      deps.queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(createdCompanyId) });
    }
    deps.setSelectedCompanyId(createdCompanyId);
    reset();
    closeOnboarding();
    navigate(createdCompanyPrefix ? `/${createdCompanyPrefix}/issues/${issueRef}` : `/issues/${issueRef}`);
  } catch (err) {
    deps.setError(err instanceof Error ? err.message : "Failed to create task");
  } finally {
    deps.setLoading(false);
  }
}
