import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdapterEnvironmentTestResult } from "@ironworksai/shared";
import { useLocation, useNavigate, useParams } from "@/lib/router";
import { useDialog } from "../../context/DialogContext";
import { useCompany } from "../../context/CompanyContext";
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
  selectDefaultCompanyGoalId
} from "../../lib/onboarding-launch";
import {
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
  DEFAULT_CODEX_LOCAL_MODEL
} from "@ironworksai/adapter-codex-local";
import { DEFAULT_CURSOR_LOCAL_MODEL } from "@ironworksai/adapter-cursor-local";
import { DEFAULT_GEMINI_LOCAL_MODEL } from "@ironworksai/adapter-gemini-local";
import { resolveRouteOnboardingOptions } from "../../lib/onboarding-route";
import { LLM_PROVIDERS, DEFAULT_TASK_DESCRIPTION } from "./constants";
import { clearWizardState, saveWizardState, loadWizardState } from "./wizard-state";
import type { Step, AdapterType, RosterItem } from "./types";

export function useWizardState() {
  const { onboardingOpen, onboardingOptions, closeOnboarding } = useDialog();
  const { companies, setSelectedCompanyId, loading: companiesLoading } = useCompany();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { companyPrefix } = useParams<{ companyPrefix?: string }>();
  const [routeDismissed, setRouteDismissed] = useState(false);

  const routeOnboardingOptions =
    companyPrefix && companiesLoading
      ? null
      : resolveRouteOnboardingOptions({ pathname: location.pathname, companyPrefix, companies });
  const effectiveOnboardingOpen =
    onboardingOpen || (routeOnboardingOptions !== null && !routeDismissed);
  const effectiveOnboardingOptions = onboardingOpen
    ? onboardingOptions
    : routeOnboardingOptions ?? {};

  const initialStep = (effectiveOnboardingOptions.initialStep ?? 1) as Step;
  const existingCompanyId = effectiveOnboardingOptions.companyId;

  const [step, setStep] = useState<Step>(initialStep);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [companyGoal, setCompanyGoal] = useState("");
  const [llmProvider, setLlmProvider] = useState<string>("anthropic");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmSaved, setLlmSaved] = useState(false);

  const [step2Mode, setStep2Mode] = useState<"pack" | "manual">("pack");
  const [selectedPackKey, setSelectedPackKey] = useState<string | null>(null);
  const [rosterItems, setRosterItems] = useState<RosterItem[]>([]);
  const [packCreating, setPackCreating] = useState(false);
  const [packProgress, setPackProgress] = useState<{ done: number; total: number } | null>(null);
  const [agentName, setAgentName] = useState("CEO");
  const [adapterType, setAdapterType] = useState<AdapterType>("claude_local");
  const [model, setModel] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [adapterEnvResult, setAdapterEnvResult] = useState<AdapterEnvironmentTestResult | null>(null);
  const [adapterEnvError, setAdapterEnvError] = useState<string | null>(null);
  const [adapterEnvLoading, setAdapterEnvLoading] = useState(false);
  const [forceUnsetAnthropicApiKey, setForceUnsetAnthropicApiKey] = useState(false);
  const [unsetAnthropicLoading, setUnsetAnthropicLoading] = useState(false);
  const [showMoreAdapters, setShowMoreAdapters] = useState(false);

  const [taskTitle, setTaskTitle] = useState("Hire your first engineer and create a hiring plan");
  const [taskDescription, setTaskDescription] = useState(DEFAULT_TASK_DESCRIPTION);
  const [extraTasks, setExtraTasks] = useState<{ title: string; description: string }[]>([]);

  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(existingCompanyId ?? null);
  const [createdCompanyPrefix, setCreatedCompanyPrefix] = useState<string | null>(null);
  const [createdCompanyGoalId, setCreatedCompanyGoalId] = useState<string | null>(null);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [createdIssueRef, setCreatedIssueRef] = useState<string | null>(null);

  // --- Effects ---

  useEffect(() => { setRouteDismissed(false); }, [location.pathname]);

  useEffect(() => {
    if (!effectiveOnboardingOpen) return;
    const cId = effectiveOnboardingOptions.companyId ?? null;
    setStep(effectiveOnboardingOptions.initialStep as Step ?? 1);
    setCreatedCompanyId(cId);
    setCreatedCompanyPrefix(null);
    setCreatedCompanyGoalId(null);
    setCreatedProjectId(null);
    setCreatedAgentId(null);
    setCreatedIssueRef(null);
  }, [effectiveOnboardingOpen, effectiveOnboardingOptions.companyId, effectiveOnboardingOptions.initialStep]);

  useEffect(() => {
    if (!effectiveOnboardingOpen || !createdCompanyId || createdCompanyPrefix) return;
    const company = companies.find((c) => c.id === createdCompanyId);
    if (company) setCreatedCompanyPrefix(company.issuePrefix);
  }, [effectiveOnboardingOpen, createdCompanyId, createdCompanyPrefix, companies]);

  useEffect(() => {
    if (!effectiveOnboardingOpen) return;
    saveWizardState({
      step, companyName, companyGoal, llmProvider, agentName, adapterType,
      taskTitle, taskDescription, extraTasks, step2Mode, selectedPackKey,
      createdCompanyId, createdCompanyPrefix, createdAgentId,
    });
  }, [
    effectiveOnboardingOpen, step, companyName, companyGoal, llmProvider,
    agentName, adapterType, taskTitle, taskDescription, extraTasks,
    step2Mode, selectedPackKey, createdCompanyId, createdCompanyPrefix, createdAgentId,
  ]);

  useEffect(() => {
    if (!effectiveOnboardingOpen) return;
    if (effectiveOnboardingOptions.initialStep || effectiveOnboardingOptions.companyId) return;
    const saved = loadWizardState();
    if (!saved) return;
    setStep(saved.step);
    setCompanyName(saved.companyName);
    setCompanyGoal(saved.companyGoal);
    setLlmProvider(saved.llmProvider);
    setAgentName(saved.agentName);
    setAdapterType(saved.adapterType);
    setTaskTitle(saved.taskTitle);
    setTaskDescription(saved.taskDescription);
    setExtraTasks(saved.extraTasks ?? []);
    setStep2Mode(saved.step2Mode);
    setSelectedPackKey(saved.selectedPackKey);
    if (saved.createdCompanyId) setCreatedCompanyId(saved.createdCompanyId);
    if (saved.createdCompanyPrefix) setCreatedCompanyPrefix(saved.createdCompanyPrefix);
    if (saved.createdAgentId) setCreatedAgentId(saved.createdAgentId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveOnboardingOpen]);

  useEffect(() => {
    if (step !== 3) return;
    setAdapterEnvResult(null);
    setAdapterEnvError(null);
  }, [step, adapterType, model, command, args, url]);

  // --- Queries ---

  const { data: teamPacks } = useQuery({
    queryKey: ["team-templates", "packs"],
    queryFn: () => teamTemplatesApi.listPacks(),
    enabled: effectiveOnboardingOpen && step === 3,
  });

  const {
    data: adapterModels,
    error: adapterModelsError,
    isLoading: adapterModelsLoading,
    isFetching: adapterModelsFetching
  } = useQuery({
    queryKey: createdCompanyId
      ? queryKeys.agents.adapterModels(createdCompanyId, adapterType)
      : ["agents", "none", "adapter-models", adapterType],
    queryFn: () => agentsApi.adapterModels(createdCompanyId!, adapterType),
    enabled: Boolean(createdCompanyId) && effectiveOnboardingOpen && step === 3
  });

  // --- Derived ---

  const isLocalAdapter =
    adapterType === "claude_local" || adapterType === "codex_local" ||
    adapterType === "gemini_local" || adapterType === "opencode_local" ||
    adapterType === "pi_local" || adapterType === "cursor";

  const effectiveAdapterCommand =
    command.trim() ||
    (adapterType === "codex_local" ? "codex"
      : adapterType === "gemini_local" ? "gemini"
      : adapterType === "pi_local" ? "pi"
      : adapterType === "cursor" ? "agent"
      : adapterType === "opencode_local" ? "opencode"
      : "claude");

  const hasAnthropicApiKeyOverrideCheck =
    adapterEnvResult?.checks.some(
      (check) => check.code === "claude_anthropic_api_key_overrides_subscription"
    ) ?? false;
  const shouldSuggestUnsetAnthropicApiKey =
    adapterType === "claude_local" && adapterEnvResult?.status === "fail" && hasAnthropicApiKeyOverrideCheck;

  // --- Helpers ---

  function buildAdapterConfig(): Record<string, unknown> {
    const adapter = getUIAdapter(adapterType);
    const config = adapter.buildAdapterConfig({
      ...defaultCreateValues, adapterType,
      model: adapterType === "codex_local" ? model || DEFAULT_CODEX_LOCAL_MODEL
        : adapterType === "gemini_local" ? model || DEFAULT_GEMINI_LOCAL_MODEL
        : adapterType === "cursor" ? model || DEFAULT_CURSOR_LOCAL_MODEL : model,
      command, args, url,
      dangerouslySkipPermissions: adapterType === "claude_local" || adapterType === "opencode_local",
      dangerouslyBypassSandbox: adapterType === "codex_local"
        ? DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX
        : defaultCreateValues.dangerouslyBypassSandbox
    });
    if (adapterType === "claude_local" && forceUnsetAnthropicApiKey) {
      const env = typeof config.env === "object" && config.env !== null && !Array.isArray(config.env)
        ? { ...(config.env as Record<string, unknown>) } : {};
      env.ANTHROPIC_API_KEY = { type: "plain", value: "" };
      config.env = env;
    }
    return config;
  }

  async function runAdapterEnvironmentTest(
    adapterConfigOverride?: Record<string, unknown>
  ): Promise<AdapterEnvironmentTestResult | null> {
    if (!createdCompanyId) {
      setAdapterEnvError("Create or select a company before testing adapter environment.");
      return null;
    }
    setAdapterEnvLoading(true); setAdapterEnvError(null);
    try {
      const result = await agentsApi.testEnvironment(createdCompanyId, adapterType, {
        adapterConfig: adapterConfigOverride ?? buildAdapterConfig()
      });
      setAdapterEnvResult(result);
      return result;
    } catch (err) {
      setAdapterEnvError(err instanceof Error ? err.message : "Adapter environment test failed");
      return null;
    } finally { setAdapterEnvLoading(false); }
  }

  function reset() {
    clearWizardState();
    setStep(1); setLoading(false); setError(null);
    setCompanyName(""); setCompanyGoal("");
    setLlmProvider("anthropic"); setLlmApiKey(""); setLlmSaved(false);
    setAgentName("CEO"); setAdapterType("claude_local");
    setModel(""); setCommand(""); setArgs(""); setUrl("");
    setAdapterEnvResult(null); setAdapterEnvError(null); setAdapterEnvLoading(false);
    setForceUnsetAnthropicApiKey(false); setUnsetAnthropicLoading(false);
    setTaskTitle("Hire your first engineer and create a hiring plan");
    setTaskDescription(DEFAULT_TASK_DESCRIPTION); setExtraTasks([]);
    setCreatedCompanyId(null); setCreatedCompanyPrefix(null);
    setCreatedCompanyGoalId(null); setCreatedAgentId(null);
    setCreatedProjectId(null); setCreatedIssueRef(null);
  }

  function handleClose() { reset(); closeOnboarding(); }

  // --- Step handlers ---

  async function handleStep1Next() {
    setLoading(true); setError(null);
    try {
      const company = await companiesApi.create({ name: companyName.trim() });
      setCreatedCompanyId(company.id);
      setCreatedCompanyPrefix(company.issuePrefix);
      setSelectedCompanyId(company.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      if (companyGoal.trim()) {
        const parsedGoal = parseOnboardingGoalInput(companyGoal);
        const goal = await goalsApi.create(company.id, {
          title: parsedGoal.title,
          ...(parsedGoal.description ? { description: parsedGoal.description } : {}),
          level: "company", status: "active"
        });
        setCreatedCompanyGoalId(goal.id);
        queryClient.invalidateQueries({ queryKey: queryKeys.goals.list(company.id) });
      } else { setCreatedCompanyGoalId(null); }
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create company");
    } finally { setLoading(false); }
  }

  async function handleStep2LlmNext() {
    if (!llmApiKey.trim() || !createdCompanyId) return;
    setLoading(true); setError(null);
    try {
      const provider = LLM_PROVIDERS.find((p) => p.key === llmProvider) ?? LLM_PROVIDERS[0];
      await secretsApi.create(createdCompanyId, {
        name: provider.secretName, value: llmApiKey.trim(),
        description: `${provider.label} API key for LLM access`,
      });
      setLlmSaved(true); setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save API key");
    } finally { setLoading(false); }
  }

  async function handleStep2Next() {
    if (!createdCompanyId) return;
    setLoading(true); setError(null);
    try {
      if (adapterType === "opencode_local") {
        const selectedModelId = model.trim();
        if (!selectedModelId) { setError("OpenCode requires an explicit model in provider/model format."); return; }
        if (adapterModelsError) { setError(adapterModelsError instanceof Error ? adapterModelsError.message : "Failed to load OpenCode models."); return; }
        if (adapterModelsLoading || adapterModelsFetching) { setError("OpenCode models are still loading. Please wait and try again."); return; }
        const discoveredModels = adapterModels ?? [];
        if (!discoveredModels.some((entry) => entry.id === selectedModelId)) {
          setError(discoveredModels.length === 0
            ? "No OpenCode models discovered. Run `opencode models` and authenticate providers."
            : `Configured OpenCode model is unavailable: ${selectedModelId}`);
          return;
        }
      }
      if (isLocalAdapter) {
        const result = adapterEnvResult ?? (await runAdapterEnvironmentTest());
        if (!result) return;
      }
      const agent = await agentsApi.create(createdCompanyId, {
        name: agentName.trim(), role: "ceo", adapterType, adapterConfig: buildAdapterConfig(),
        runtimeConfig: { heartbeat: { enabled: true, intervalSec: 3600, wakeOnDemand: true, cooldownSec: 10, maxConcurrentRuns: 1 } }
      });
      setCreatedAgentId(agent.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(createdCompanyId) });
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally { setLoading(false); }
  }

  async function handlePackDeploy() {
    if (!createdCompanyId || rosterItems.length === 0) return;
    setPackCreating(true); setError(null);
    setPackProgress({ done: 0, total: rosterItems.length });
    const config = buildAdapterConfig();
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
      setPackProgress({ done: 0, total: sorted.length });
      const result = await agentsApi.deployTeamPack(createdCompanyId, { agents: agentPayloads, adapterType, adapterConfig: config });
      setPackProgress({ done: sorted.length, total: sorted.length });
      if (result.agents.length > 0) setCreatedAgentId(result.agents[0].id);
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(createdCompanyId) });
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create team");
    } finally { setPackCreating(false); setPackProgress(null); }
  }

  async function handleUnsetAnthropicApiKey() {
    if (!createdCompanyId || unsetAnthropicLoading) return;
    setUnsetAnthropicLoading(true); setError(null); setAdapterEnvError(null);
    setForceUnsetAnthropicApiKey(true);
    const configWithUnset = (() => {
      const config = buildAdapterConfig();
      const env = typeof config.env === "object" && config.env !== null && !Array.isArray(config.env)
        ? { ...(config.env as Record<string, unknown>) } : {};
      env.ANTHROPIC_API_KEY = { type: "plain", value: "" };
      config.env = env; return config;
    })();
    try {
      if (createdAgentId) {
        await agentsApi.update(createdAgentId, { adapterConfig: configWithUnset }, createdCompanyId);
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(createdCompanyId) });
      }
      const result = await runAdapterEnvironmentTest(configWithUnset);
      if (result?.status === "fail") {
        setError("Retried with ANTHROPIC_API_KEY unset in adapter config, but the environment test is still failing.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unset ANTHROPIC_API_KEY and retry.");
    } finally { setUnsetAnthropicLoading(false); }
  }

  async function handleStep3Next() {
    if (!createdCompanyId || !createdAgentId) return;
    setError(null); setStep(5);
  }

  async function handleLaunch() {
    if (!createdCompanyId || !createdAgentId) return;
    setLoading(true); setError(null);
    try {
      let goalId = createdCompanyGoalId;
      if (!goalId) {
        const goals = await goalsApi.list(createdCompanyId);
        goalId = selectDefaultCompanyGoalId(goals);
        setCreatedCompanyGoalId(goalId);
      }
      let projectId = createdProjectId;
      if (!projectId) {
        const project = await projectsApi.create(createdCompanyId, buildOnboardingProjectPayload(goalId));
        projectId = project.id; setCreatedProjectId(projectId);
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(createdCompanyId) });
      }
      let issueRef = createdIssueRef;
      if (!issueRef) {
        const issue = await issuesApi.create(createdCompanyId, buildOnboardingIssuePayload({
          title: taskTitle, description: taskDescription,
          assigneeAgentId: createdAgentId, projectId, goalId
        }));
        issueRef = issue.identifier ?? issue.id; setCreatedIssueRef(issueRef);
        for (const extra of extraTasks) {
          if (!extra.title.trim()) continue;
          try {
            await issuesApi.create(createdCompanyId, buildOnboardingIssuePayload({
              title: extra.title, description: extra.description,
              assigneeAgentId: createdAgentId, projectId, goalId
            }));
          } catch { /* Non-blocking */ }
        }
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(createdCompanyId) });
      }
      setSelectedCompanyId(createdCompanyId);
      reset(); closeOnboarding();
      navigate(createdCompanyPrefix ? `/${createdCompanyPrefix}/issues/${issueRef}` : `/issues/${issueRef}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally { setLoading(false); }
  }

  return {
    // Open state
    effectiveOnboardingOpen, onboardingOptions, initialStep,
    routeDismissed, setRouteDismissed,
    // Wizard navigation
    step, setStep, loading, error, setError, handleClose,
    // Step 1
    companyName, setCompanyName, companyGoal, setCompanyGoal, handleStep1Next,
    // Step 2
    llmProvider, setLlmProvider, llmApiKey, setLlmApiKey, llmSaved, handleStep2LlmNext,
    // Step 3
    step2Mode, setStep2Mode,
    teamPacks, selectedPackKey, setSelectedPackKey,
    rosterItems, setRosterItems, packCreating, packProgress,
    agentName, setAgentName, adapterType, setAdapterType,
    model, setModel, url, setUrl,
    showMoreAdapters, setShowMoreAdapters,
    modelOpen, setModelOpen, modelSearch, setModelSearch,
    adapterModels, isLocalAdapter, effectiveAdapterCommand,
    adapterEnvResult, adapterEnvError, adapterEnvLoading,
    runAdapterEnvironmentTest,
    shouldSuggestUnsetAnthropicApiKey, unsetAnthropicLoading,
    handleUnsetAnthropicApiKey,
    handleStep2Next, handlePackDeploy,
    // Step 4
    taskTitle, setTaskTitle, taskDescription, setTaskDescription,
    extraTasks, setExtraTasks,
    // Step 5
    handleStep3Next, handleLaunch,
  };
}
