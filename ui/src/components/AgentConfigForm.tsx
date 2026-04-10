import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent, CompanySecret } from "@ironworksai/shared";
import type { AdapterModel } from "../api/agents";
import { agentsApi } from "../api/agents";
import { secretsApi } from "../api/secrets";
import { assetsApi } from "../api/assets";
import {
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
  DEFAULT_CODEX_LOCAL_MODEL,
} from "@ironworksai/adapter-codex-local";
import { DEFAULT_CURSOR_LOCAL_MODEL } from "@ironworksai/adapter-cursor-local";
import { DEFAULT_GEMINI_LOCAL_MODEL } from "@ironworksai/adapter-gemini-local";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";
import { queryKeys } from "../lib/queryKeys";
import { useCompany } from "../context/CompanyContext";
import { defaultCreateValues } from "./agent-config-defaults";
import { getUIAdapter } from "../adapters";
import { shouldShowLegacyWorkingDirectoryField } from "../lib/legacy-agent-config";
import {
  IdentitySection,
  AdapterSection,
  PermissionsSection,
  RunPolicySection,
  type Overlay,
  emptyOverlay,
  isOverlayDirty,
} from "./agent-config";

// Re-exported so existing imports from this file keep working.
export type { CreateConfigValues } from "@ironworksai/adapter-utils";
import type { CreateConfigValues } from "@ironworksai/adapter-utils";

type AgentConfigFormProps = {
  adapterModels?: AdapterModel[];
  onDirtyChange?: (dirty: boolean) => void;
  onSaveActionChange?: (save: (() => void) | null) => void;
  onCancelActionChange?: (cancel: (() => void) | null) => void;
  hideInlineSave?: boolean;
  showAdapterTypeField?: boolean;
  showAdapterTestEnvironmentButton?: boolean;
  showCreateRunPolicySection?: boolean;
  hideInstructionsFile?: boolean;
  /** Hide the prompt template field from the Identity section (used when it's shown in a separate Prompts tab). */
  hidePromptTemplate?: boolean;
  /** "cards" renders each section as heading + bordered card (for settings pages). Default: "inline" (border-b dividers). */
  sectionLayout?: "inline" | "cards";
} & (
  | {
      mode: "create";
      values: CreateConfigValues;
      onChange: (patch: Partial<CreateConfigValues>) => void;
    }
  | {
      mode: "edit";
      agent: Agent;
      onSave: (patch: Record<string, unknown>) => void;
      isSaving?: boolean;
    }
);

/* ---- Form ---- */

export function AgentConfigForm(props: AgentConfigFormProps) {
  const { mode, adapterModels: externalModels } = props;
  const isCreate = mode === "create";
  const cards = props.sectionLayout === "cards";
  const showAdapterTypeField = props.showAdapterTypeField ?? true;
  const showAdapterTestEnvironmentButton = props.showAdapterTestEnvironmentButton ?? true;
  const showCreateRunPolicySection = props.showCreateRunPolicySection ?? true;
  const hideInstructionsFile = props.hideInstructionsFile ?? false;
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();

  const { data: availableSecrets = [] } = useQuery({
    queryKey: selectedCompanyId ? queryKeys.secrets.list(selectedCompanyId) : ["secrets", "none"],
    queryFn: () => secretsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const createSecret = useMutation({
    mutationFn: (input: { name: string; value: string }) => {
      if (!selectedCompanyId) throw new Error("Select a company to create secrets");
      return secretsApi.create(selectedCompanyId, input);
    },
    onSuccess: () => {
      if (!selectedCompanyId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.secrets.list(selectedCompanyId) });
    },
  });

  const uploadMarkdownImage = useMutation({
    mutationFn: async ({ file, namespace }: { file: File; namespace: string }) => {
      if (!selectedCompanyId) throw new Error("Select a company to upload images");
      return assetsApi.uploadImage(selectedCompanyId, file, namespace);
    },
  });

  // ---- Edit mode: overlay for dirty tracking ----
  const [overlay, setOverlay] = useState<Overlay>(emptyOverlay);
  const agentRef = useRef<Agent | null>(null);

  useEffect(() => {
    if (!isCreate) {
      if (agentRef.current !== null && props.agent !== agentRef.current) {
        setOverlay({ ...emptyOverlay });
      }
      agentRef.current = props.agent;
    }
  }, [isCreate, !isCreate ? props.agent : undefined]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDirty = !isCreate && isOverlayDirty(overlay);

  /** Read effective value: overlay if dirty, else original */
  function eff<T>(group: keyof Omit<Overlay, "adapterType">, field: string, original: T): T {
    const o = overlay[group];
    if (field in o) return o[field] as T;
    return original;
  }

  /** Mark field dirty in overlay */
  function mark(group: keyof Omit<Overlay, "adapterType">, field: string, value: unknown) {
    setOverlay((prev) => ({
      ...prev,
      [group]: { ...prev[group], [field]: value },
    }));
  }

  const handleCancel = useCallback(() => {
    setOverlay({ ...emptyOverlay });
  }, []);

  const handleSave = useCallback(() => {
    if (isCreate || !isDirty) return;
    const agent = props.agent;
    const patch: Record<string, unknown> = {};

    if (Object.keys(overlay.identity).length > 0) {
      Object.assign(patch, overlay.identity);
    }
    if (overlay.adapterType !== undefined) {
      patch.adapterType = overlay.adapterType;
      patch.adapterConfig = overlay.adapterConfig;
    } else if (Object.keys(overlay.adapterConfig).length > 0) {
      const existing = (agent.adapterConfig ?? {}) as Record<string, unknown>;
      patch.adapterConfig = { ...existing, ...overlay.adapterConfig };
    }
    if (Object.keys(overlay.heartbeat).length > 0) {
      const existingRc = (agent.runtimeConfig ?? {}) as Record<string, unknown>;
      const existingHb = (existingRc.heartbeat ?? {}) as Record<string, unknown>;
      patch.runtimeConfig = { ...existingRc, heartbeat: { ...existingHb, ...overlay.heartbeat } };
    }
    if (overlay.adapterConfig.modelStrategy !== undefined) {
      const existingRc = (patch.runtimeConfig ?? agent.runtimeConfig ?? {}) as Record<string, unknown>;
      patch.runtimeConfig = { ...existingRc, modelStrategy: overlay.adapterConfig.modelStrategy };
    }
    if (Object.keys(overlay.runtime).length > 0) {
      Object.assign(patch, overlay.runtime);
    }

    props.onSave(patch);
  }, [isCreate, isDirty, overlay, props]);

  useEffect(() => {
    if (!isCreate) {
      props.onDirtyChange?.(isDirty);
      props.onSaveActionChange?.(handleSave);
      props.onCancelActionChange?.(handleCancel);
    }
  }, [isCreate, isDirty, props.onDirtyChange, props.onSaveActionChange, props.onCancelActionChange, handleSave, handleCancel]);

  useEffect(() => {
    if (isCreate) return;
    return () => {
      props.onSaveActionChange?.(null);
      props.onCancelActionChange?.(null);
      props.onDirtyChange?.(false);
    };
  }, [isCreate, props.onDirtyChange, props.onSaveActionChange, props.onCancelActionChange]);

  // ---- Resolve values ----
  const config = !isCreate ? ((props.agent.adapterConfig ?? {}) as Record<string, unknown>) : {};
  const runtimeConfig = !isCreate ? ((props.agent.runtimeConfig ?? {}) as Record<string, unknown>) : {};
  const heartbeat = !isCreate ? ((runtimeConfig.heartbeat ?? {}) as Record<string, unknown>) : {};

  const adapterType = isCreate
    ? props.values.adapterType
    : overlay.adapterType ?? props.agent.adapterType;
  const isLocal =
    adapterType === "claude_local" ||
    adapterType === "codex_local" ||
    adapterType === "gemini_local" ||
    adapterType === "opencode_local" ||
    adapterType === "pi_local" ||
    adapterType === "cursor";
  const showLegacyWorkingDirectoryField =
    isLocal && shouldShowLegacyWorkingDirectoryField({ isCreate, adapterConfig: config });
  const uiAdapter = useMemo(() => getUIAdapter(adapterType), [adapterType]);

  const {
    data: fetchedModels,
    error: fetchedModelsError,
  } = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.agents.adapterModels(selectedCompanyId, adapterType)
      : ["agents", "none", "adapter-models", adapterType],
    queryFn: () => agentsApi.adapterModels(selectedCompanyId!, adapterType),
    enabled: Boolean(selectedCompanyId),
  });
  const models = fetchedModels ?? externalModels ?? [];

  const { data: companyAgents = [] } = useQuery({
    queryKey: selectedCompanyId ? queryKeys.agents.list(selectedCompanyId) : ["agents", "none", "list"],
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: Boolean(!isCreate && selectedCompanyId),
  });

  const adapterFieldProps = {
    mode,
    isCreate,
    adapterType,
    values: isCreate ? props.values : null,
    set: isCreate ? (patch: Partial<CreateConfigValues>) => props.onChange(patch) : null,
    config,
    eff: eff as <T>(group: "adapterConfig", field: string, original: T) => T,
    mark: mark as (group: "adapterConfig", field: string, value: unknown) => void,
    models,
    hideInstructionsFile,
  };

  // Popover states
  const [modelOpen, setModelOpen] = useState(false);
  const [thinkingEffortOpen, setThinkingEffortOpen] = useState(false);

  const val = isCreate ? props.values : null;
  const set = isCreate
    ? (patch: Partial<CreateConfigValues>) => props.onChange(patch)
    : null;

  function buildAdapterConfigForTest(): Record<string, unknown> {
    if (isCreate) {
      return uiAdapter.buildAdapterConfig(val!);
    }
    const base = config as Record<string, unknown>;
    return { ...base, ...overlay.adapterConfig };
  }

  const testEnvironment = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) {
        throw new Error("Select a company to test adapter environment");
      }
      return agentsApi.testEnvironment(selectedCompanyId, adapterType, {
        adapterConfig: buildAdapterConfigForTest(),
      });
    },
  });

  const currentModelId = isCreate
    ? val!.model
    : eff("adapterConfig", "model", String(config.model ?? ""));

  const handleAdapterTypeChange = useCallback((t: string) => {
    const defaultModel = t === "codex_local" ? DEFAULT_CODEX_LOCAL_MODEL
      : t === "gemini_local" ? DEFAULT_GEMINI_LOCAL_MODEL
      : t === "cursor" ? DEFAULT_CURSOR_LOCAL_MODEL : "";
    const codexExtras = t === "codex_local"
      ? { dangerouslyBypassSandbox: DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX } : {};
    if (isCreate) {
      const { adapterType: _at, ...defaults } = defaultCreateValues;
      set!({ ...defaults, adapterType: t, model: defaultModel, ...codexExtras });
    } else {
      const codexOverlay = t === "codex_local"
        ? { dangerouslyBypassApprovalsAndSandbox: DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX } : {};
      setOverlay((prev) => ({
        ...prev, adapterType: t,
        adapterConfig: { model: defaultModel, effort: "", modelReasoningEffort: "", variant: "", mode: "", ...codexOverlay },
      }));
    }
  }, [isCreate, set]);

  /** Helper to upload markdown images and return the content path */
  const handleUploadMarkdownImage = useCallback(async (file: File, namespace: string): Promise<string> => {
    const asset = await uploadMarkdownImage.mutateAsync({ file, namespace });
    return asset.contentPath;
  }, [uploadMarkdownImage]);

  const handleCreateSecret = useCallback(async (name: string, value: string): Promise<CompanySecret> => {
    return createSecret.mutateAsync({ name, value });
  }, [createSecret]);

  return (
    <div className={cn("relative", cards && "space-y-6")}>
      {/* ---- Floating Save button (edit mode, when dirty) ---- */}
      {isDirty && !props.hideInlineSave && (
        <div className="sticky top-0 z-10 flex items-center justify-end px-4 py-2 bg-background/90 backdrop-blur-sm border-b border-primary/20">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Unsaved changes</span>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!isCreate && props.isSaving}
            >
              {!isCreate && props.isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}

      {/* ---- Identity (edit only) ---- */}
      {!isCreate && (
        <IdentitySection
          isCreate={false}
          cards={cards}
          eff={eff}
          mark={mark}
          agent={props.agent}
          companyAgents={companyAgents}
          isLocal={isLocal}
          hidePromptTemplate={props.hidePromptTemplate}
          config={config}
          uploadMarkdownImage={handleUploadMarkdownImage}
        />
      )}

      {/* ---- Adapter ---- */}
      <AdapterSection
        isCreate={isCreate}
        cards={cards}
        eff={eff}
        mark={mark}
        adapterType={adapterType}
        isLocal={isLocal}
        showAdapterTypeField={showAdapterTypeField}
        showAdapterTestEnvironmentButton={showAdapterTestEnvironmentButton}
        showLegacyWorkingDirectoryField={showLegacyWorkingDirectoryField}
        hidePromptTemplate={props.hidePromptTemplate}
        selectedCompanyId={selectedCompanyId}
        config={config}
        val={val}
        set={set}
        onAdapterTypeChange={handleAdapterTypeChange}
        testEnvironment={testEnvironment}
        uploadMarkdownImage={handleUploadMarkdownImage}
        uiAdapterConfigFields={<uiAdapter.ConfigFields {...adapterFieldProps} />}
      />

      {/* ---- Permissions & Configuration ---- */}
      {isLocal && (
        <PermissionsSection
          isCreate={isCreate}
          cards={cards}
          eff={eff}
          mark={mark}
          adapterType={adapterType}
          config={config}
          runtimeConfig={runtimeConfig}
          val={val}
          set={set}
          models={models}
          currentModelId={currentModelId}
          fetchedModelsError={fetchedModelsError}
          availableSecrets={availableSecrets}
          onCreateSecret={handleCreateSecret}
          modelOpen={modelOpen}
          setModelOpen={setModelOpen}
          thinkingEffortOpen={thinkingEffortOpen}
          setThinkingEffortOpen={setThinkingEffortOpen}
          uploadMarkdownImage={handleUploadMarkdownImage}
          adapterFieldProps={adapterFieldProps}
          agent={!isCreate ? props.agent : undefined}
        />
      )}

      {/* ---- Run Policy ---- */}
      <RunPolicySection
        isCreate={isCreate}
        cards={cards}
        eff={eff}
        mark={mark}
        showCreateRunPolicySection={showCreateRunPolicySection}
        heartbeat={heartbeat}
        val={val}
        set={set}
      />
    </div>
  );
}
