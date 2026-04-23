import type { AdapterEnvironmentTestResult } from "@ironworksai/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "@/lib/router";
import { agentsApi } from "../../api/agents";
import { teamTemplatesApi } from "../../api/teamTemplates";
import { useCompany } from "../../context/CompanyContext";
import { useDialog } from "../../context/DialogContext";
import { resolveRouteOnboardingOptions } from "../../lib/onboarding-route";
import { queryKeys } from "../../lib/queryKeys";
import { DEFAULT_TASK_DESCRIPTION } from "./constants";
import type { AdapterType, LlmAuthMode, RosterItem, Step } from "./types";
import {
  buildAdapterConfig,
  runAdapterEnvironmentTest as doRunEnvTest,
  handleStep1Next as h1,
  handleStep2LlmNext as h2Llm,
  handleStep2Next as h2Next,
  handleLaunch as hLaunch,
  handlePackDeploy as hPack,
  handleUnsetAnthropicApiKey as hUnset,
  type WizardHandlerDeps,
} from "./wizard-handlers";
import { clearWizardState, loadWizardState, saveWizardState } from "./wizard-state";

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
  const effectiveOnboardingOpen = onboardingOpen || (routeOnboardingOptions !== null && !routeDismissed);
  const effectiveOnboardingOptions = onboardingOpen ? onboardingOptions : (routeOnboardingOptions ?? {});
  const initialStep = (effectiveOnboardingOptions.initialStep ?? 1) as Step;
  const existingCompanyId = effectiveOnboardingOptions.companyId;

  // --- State ---
  const [step, setStep] = useState<Step>(initialStep);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyGoal, setCompanyGoal] = useState("");
  const [llmProvider, setLlmProvider] = useState<string>("anthropic");
  const [llmAuthMode, setLlmAuthMode] = useState<LlmAuthMode>("subscription");
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
  useEffect(() => {
    setRouteDismissed(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!effectiveOnboardingOpen) return;
    setStep((effectiveOnboardingOptions.initialStep as Step) ?? 1);
    setCreatedCompanyId(effectiveOnboardingOptions.companyId ?? null);
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
      step,
      companyName,
      companyGoal,
      llmProvider,
      llmAuthMode,
      agentName,
      adapterType,
      taskTitle,
      taskDescription,
      extraTasks,
      step2Mode,
      selectedPackKey,
      createdCompanyId,
      createdCompanyPrefix,
      createdAgentId,
    });
  }, [
    effectiveOnboardingOpen,
    step,
    companyName,
    companyGoal,
    llmProvider,
    llmAuthMode,
    agentName,
    adapterType,
    taskTitle,
    taskDescription,
    extraTasks,
    step2Mode,
    selectedPackKey,
    createdCompanyId,
    createdCompanyPrefix,
    createdAgentId,
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
    if (saved.llmAuthMode) setLlmAuthMode(saved.llmAuthMode);
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
    if (step === 3) {
      setAdapterEnvResult(null);
      setAdapterEnvError(null);
    }
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
    isFetching: adapterModelsFetching,
  } = useQuery({
    queryKey: createdCompanyId
      ? queryKeys.agents.adapterModels(createdCompanyId, adapterType)
      : ["agents", "none", "adapter-models", adapterType],
    queryFn: () => agentsApi.adapterModels(createdCompanyId!, adapterType),
    enabled: Boolean(createdCompanyId) && effectiveOnboardingOpen && step === 3,
  });

  // --- Derived ---
  const isLocalAdapter =
    adapterType === "claude_local" ||
    adapterType === "codex_local" ||
    adapterType === "gemini_local" ||
    adapterType === "opencode_local" ||
    adapterType === "pi_local" ||
    adapterType === "cursor";
  const effectiveAdapterCommand =
    command.trim() ||
    (adapterType === "codex_local"
      ? "codex"
      : adapterType === "gemini_local"
        ? "gemini"
        : adapterType === "pi_local"
          ? "pi"
          : adapterType === "cursor"
            ? "agent"
            : adapterType === "opencode_local"
              ? "opencode"
              : "claude");
  const shouldSuggestUnsetAnthropicApiKey =
    adapterType === "claude_local" &&
    adapterEnvResult?.status === "fail" &&
    (adapterEnvResult?.checks.some((c) => c.code === "claude_anthropic_api_key_overrides_subscription") ?? false);

  // --- Handler deps ---
  const deps: WizardHandlerDeps = useMemo(
    () => ({
      queryClient,
      setLoading,
      setError,
      setStep,
      setCreatedCompanyId,
      setCreatedCompanyPrefix,
      setCreatedCompanyGoalId,
      setCreatedAgentId,
      setCreatedProjectId,
      setCreatedIssueRef,
      setSelectedCompanyId,
      setLlmSaved,
      setPackCreating,
      setPackProgress,
      setAdapterEnvResult,
      setAdapterEnvError,
      setAdapterEnvLoading,
      setForceUnsetAnthropicApiKey,
      setUnsetAnthropicLoading,
    }),
    [queryClient, setSelectedCompanyId],
  );

  function getConfig() {
    return buildAdapterConfig(adapterType, model, command, args, url, forceUnsetAnthropicApiKey);
  }

  function reset() {
    clearWizardState();
    setStep(1);
    setLoading(false);
    setError(null);
    setCompanyName("");
    setCompanyGoal("");
    setLlmProvider("anthropic");
    setLlmApiKey("");
    setLlmSaved(false);
    setAgentName("CEO");
    setAdapterType("claude_local");
    setModel("");
    setCommand("");
    setArgs("");
    setUrl("");
    setAdapterEnvResult(null);
    setAdapterEnvError(null);
    setAdapterEnvLoading(false);
    setForceUnsetAnthropicApiKey(false);
    setUnsetAnthropicLoading(false);
    setTaskTitle("Hire your first engineer and create a hiring plan");
    setTaskDescription(DEFAULT_TASK_DESCRIPTION);
    setExtraTasks([]);
    setCreatedCompanyId(null);
    setCreatedCompanyPrefix(null);
    setCreatedCompanyGoalId(null);
    setCreatedAgentId(null);
    setCreatedProjectId(null);
    setCreatedIssueRef(null);
  }

  return {
    effectiveOnboardingOpen,
    onboardingOptions,
    initialStep,
    routeDismissed,
    setRouteDismissed,
    step,
    setStep,
    loading,
    error,
    setError,
    handleClose: () => {
      reset();
      closeOnboarding();
    },
    companyName,
    setCompanyName,
    companyGoal,
    setCompanyGoal,
    llmProvider,
    setLlmProvider,
    llmAuthMode,
    setLlmAuthMode,
    llmApiKey,
    setLlmApiKey,
    llmSaved,
    step2Mode,
    setStep2Mode,
    teamPacks,
    selectedPackKey,
    setSelectedPackKey,
    rosterItems,
    setRosterItems,
    packCreating,
    packProgress,
    agentName,
    setAgentName,
    adapterType,
    setAdapterType,
    model,
    setModel,
    url,
    setUrl,
    showMoreAdapters,
    setShowMoreAdapters,
    modelOpen,
    setModelOpen,
    modelSearch,
    setModelSearch,
    adapterModels,
    isLocalAdapter,
    effectiveAdapterCommand,
    adapterEnvResult,
    adapterEnvError,
    adapterEnvLoading,
    shouldSuggestUnsetAnthropicApiKey,
    unsetAnthropicLoading,
    // Handlers
    handleStep1Next: () => h1(deps, companyName, companyGoal),
    handleStep2LlmNext: () => h2Llm(deps, createdCompanyId, llmProvider, llmAuthMode, llmApiKey),
    handleStep2Next: () =>
      h2Next(
        deps,
        createdCompanyId,
        adapterType,
        agentName,
        getConfig(),
        model,
        isLocalAdapter,
        adapterEnvResult,
        adapterModels,
        adapterModelsError as Error | null,
        adapterModelsLoading,
        adapterModelsFetching,
        () => doRunEnvTest(deps, createdCompanyId, adapterType, getConfig()),
      ),
    handlePackDeploy: () => hPack(deps, createdCompanyId, rosterItems, adapterType, getConfig()),
    handleUnsetAnthropicApiKey: () => hUnset(deps, createdCompanyId, createdAgentId, adapterType, getConfig()),
    handleStep3Next: () => {
      if (createdCompanyId && createdAgentId) {
        setError(null);
        setStep(5);
      }
    },
    handleLaunch: () =>
      hLaunch(
        deps,
        createdCompanyId,
        createdAgentId,
        createdCompanyGoalId,
        createdProjectId,
        createdIssueRef,
        createdCompanyPrefix,
        taskTitle,
        taskDescription,
        extraTasks,
        reset,
        closeOnboarding,
        navigate,
      ),
    runAdapterEnvironmentTest: () => doRunEnvTest(deps, createdCompanyId, adapterType, getConfig()),
    taskTitle,
    setTaskTitle,
    taskDescription,
    setTaskDescription,
    extraTasks,
    setExtraTasks,
  };
}
