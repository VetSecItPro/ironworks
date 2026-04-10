import { cn } from "../../lib/utils";
import {
  Field,
  help,
  DraftInput,
  DraftNumberInput,
} from "../agent-config-primitives";
import { MarkdownEditor } from "../MarkdownEditor";
import type { AdapterConfigFieldsProps } from "../../adapters/types";
import { ClaudeLocalAdvancedFields } from "../../adapters/claude-local/config-fields";
import { ModelDropdown } from "./ModelDropdown";
import { ThinkingEffortDropdown } from "./ThinkingEffortDropdown";
import { EnvVarEditor } from "./EnvVarEditor";
import type { SectionCommonProps, CreateConfigValues, AdapterModel, CompanySecret, EnvBinding, Agent } from "./types";
import {
  inputClass,
  formatArgList,
  parseCommaArgs,
  codexThinkingEffortOptions,
  openCodeThinkingEffortOptions,
  cursorModeOptions,
  claudeThinkingEffortOptions,
  EMPTY_ENV,
} from "./types";

interface PermissionsSectionProps extends SectionCommonProps {
  adapterType: string;
  config: Record<string, unknown>;
  runtimeConfig: Record<string, unknown>;
  val: CreateConfigValues | null;
  set: ((patch: Partial<CreateConfigValues>) => void) | null;
  models: AdapterModel[];
  currentModelId: string;
  fetchedModelsError: Error | null;
  availableSecrets: CompanySecret[];
  onCreateSecret: (name: string, value: string) => Promise<CompanySecret>;
  modelOpen: boolean;
  setModelOpen: (open: boolean) => void;
  thinkingEffortOpen: boolean;
  setThinkingEffortOpen: (open: boolean) => void;
  uploadMarkdownImage: (file: File, namespace: string) => Promise<string>;
  adapterFieldProps: AdapterConfigFieldsProps;
  agent?: Agent;
}

export function PermissionsSection({
  isCreate,
  cards,
  eff,
  mark,
  adapterType,
  config,
  runtimeConfig,
  val,
  set,
  models,
  currentModelId,
  fetchedModelsError,
  availableSecrets,
  onCreateSecret,
  modelOpen,
  setModelOpen,
  thinkingEffortOpen,
  setThinkingEffortOpen,
  uploadMarkdownImage,
  adapterFieldProps,
  agent,
}: PermissionsSectionProps) {
  const thinkingEffortKey =
    adapterType === "codex_local"
      ? "modelReasoningEffort"
      : adapterType === "cursor"
        ? "mode"
        : adapterType === "opencode_local"
          ? "variant"
          : "effort";
  const thinkingEffortOptions =
    adapterType === "codex_local"
      ? codexThinkingEffortOptions
      : adapterType === "cursor"
        ? cursorModeOptions
        : adapterType === "opencode_local"
          ? openCodeThinkingEffortOptions
          : claudeThinkingEffortOptions;
  const currentThinkingEffort = isCreate
    ? val!.thinkingEffort
    : adapterType === "codex_local"
      ? eff(
          "adapterConfig",
          "modelReasoningEffort",
          String(config.modelReasoningEffort ?? config.reasoningEffort ?? ""),
        )
      : adapterType === "cursor"
        ? eff("adapterConfig", "mode", String(config.mode ?? ""))
      : adapterType === "opencode_local"
        ? eff("adapterConfig", "variant", String(config.variant ?? ""))
      : eff("adapterConfig", "effort", String(config.effort ?? ""));
  const showThinkingEffort = adapterType !== "gemini_local";
  const codexSearchEnabled = adapterType === "codex_local"
    ? (isCreate ? Boolean(val!.search) : eff("adapterConfig", "search", Boolean(config.search)))
    : false;

  return (
    <div className={cn(!cards && "border-b border-border")}>
      {cards
        ? <h3 className="text-sm font-medium mb-3">Permissions &amp; Configuration</h3>
        : <div className="px-4 py-2 text-xs font-medium text-muted-foreground">Permissions &amp; Configuration</div>
      }
      <div className={cn(cards ? "border border-border rounded-lg p-4 space-y-3" : "px-4 pb-3 space-y-3")}>
          <Field label="Command" hint={help.localCommand}>
            <DraftInput
              value={
                isCreate
                  ? val!.command
                  : eff("adapterConfig", "command", String(config.command ?? ""))
              }
              onCommit={(v) =>
                isCreate
                  ? set!({ command: v })
                  : mark("adapterConfig", "command", v || undefined)
              }
              immediate
              className={inputClass}
              placeholder={
                adapterType === "codex_local"
                  ? "codex"
                  : adapterType === "gemini_local"
                    ? "gemini"
                    : adapterType === "pi_local"
                      ? "pi"
                    : adapterType === "cursor"
                      ? "agent"
                    : adapterType === "opencode_local"
                      ? "opencode"
                      : "claude"
              }
            />
          </Field>

          <ModelDropdown
            models={models}
            value={currentModelId}
            onChange={(v) =>
              isCreate
                ? set!({ model: v })
                : mark("adapterConfig", "model", v || undefined)
            }
            open={modelOpen}
            onOpenChange={setModelOpen}
            allowDefault={adapterType !== "opencode_local"}
            required={adapterType === "opencode_local"}
            groupByProvider={adapterType === "opencode_local"}
          />
          {fetchedModelsError && (
            <p className="text-xs text-destructive">
              {fetchedModelsError instanceof Error
                ? fetchedModelsError.message
                : "Failed to load adapter models."}
            </p>
          )}

          {showThinkingEffort && (
            <>
              <ThinkingEffortDropdown
                value={currentThinkingEffort}
                options={thinkingEffortOptions}
                onChange={(v) =>
                  isCreate
                    ? set!({ thinkingEffort: v })
                    : mark("adapterConfig", thinkingEffortKey, v || undefined)
                }
                open={thinkingEffortOpen}
                onOpenChange={setThinkingEffortOpen}
              />
              {adapterType === "codex_local" &&
                codexSearchEnabled &&
                currentThinkingEffort === "minimal" && (
                  <p className="text-xs text-amber-400">
                    Codex may reject `minimal` thinking when search is enabled.
                  </p>
                )}
            </>
          )}
          {/* Model Strategy Selector */}
          {!isCreate && (
            <Field label="Model Strategy" hint="How tasks are executed: single model, cascade (retry with fallback), or council (multi-model deliberation). Critical tasks auto-upgrade to council.">
              <select
                className={cn(inputClass, "h-9")}
                value={eff("adapterConfig", "modelStrategy", String(runtimeConfig.modelStrategy ?? "single"))}
                onChange={(e) => mark("adapterConfig", "modelStrategy", e.target.value)}
              >
                <option value="single">Single - one model per task</option>
                <option value="cascade">Cascade - retry with fallback if quality is low</option>
                <option value="council">Council - run multiple models, pick best response</option>
              </select>
            </Field>
          )}

          {!isCreate && typeof config.bootstrapPromptTemplate === "string" && config.bootstrapPromptTemplate && (
            <>
              <Field label="Bootstrap prompt (legacy)" hint={help.bootstrapPrompt}>
                <MarkdownEditor
                  value={eff(
                    "adapterConfig",
                    "bootstrapPromptTemplate",
                    String(config.bootstrapPromptTemplate ?? ""),
                  )}
                  onChange={(v) =>
                    mark("adapterConfig", "bootstrapPromptTemplate", v || undefined)
                  }
                  placeholder="Optional initial setup prompt for the first run"
                  contentClassName="min-h-[44px] text-sm font-mono"
                  imageUploadHandler={async (file) => {
                    return uploadMarkdownImage(file, `agents/${agent!.id}/bootstrap-prompt`);
                  }}
                />
              </Field>
              <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Bootstrap prompt is legacy and will be removed in a future release. Consider moving this content into the agent&apos;s prompt template or instructions file instead.
              </div>
            </>
          )}
          {adapterType === "claude_local" && (
            <ClaudeLocalAdvancedFields {...adapterFieldProps} />
          )}

          <Field label="Extra args (comma-separated)" hint={help.extraArgs}>
            <DraftInput
              value={
                isCreate
                  ? val!.extraArgs
                  : eff("adapterConfig", "extraArgs", formatArgList(config.extraArgs))
              }
              onCommit={(v) =>
                isCreate
                  ? set!({ extraArgs: v })
                  : mark("adapterConfig", "extraArgs", v ? parseCommaArgs(v) : undefined)
              }
              immediate
              className={inputClass}
              placeholder="e.g. --verbose, --foo=bar"
            />
          </Field>

          <Field label="Environment variables" hint={help.envVars}>
            <EnvVarEditor
              value={
                isCreate
                  ? ((val!.envBindings ?? EMPTY_ENV) as Record<string, EnvBinding>)
                  : ((eff("adapterConfig", "env", (config.env ?? EMPTY_ENV) as Record<string, EnvBinding>))
                  )
              }
              secrets={availableSecrets}
              onCreateSecret={onCreateSecret}
              onChange={(env) =>
                isCreate
                  ? set!({ envBindings: env ?? {}, envVars: "" })
                  : mark("adapterConfig", "env", env)
              }
            />
          </Field>

          {/* Edit-only: timeout + grace period */}
          {!isCreate && (
            <>
              <Field label="Timeout (sec)" hint={help.timeoutSec}>
                <DraftNumberInput
                  value={eff(
                    "adapterConfig",
                    "timeoutSec",
                    Number(config.timeoutSec ?? 0),
                  )}
                  onCommit={(v) => mark("adapterConfig", "timeoutSec", v)}
                  immediate
                  className={inputClass}
                />
              </Field>
              <Field label="Interrupt grace period (sec)" hint={help.graceSec}>
                <DraftNumberInput
                  value={eff(
                    "adapterConfig",
                    "graceSec",
                    Number(config.graceSec ?? 15),
                  )}
                  onCommit={(v) => mark("adapterConfig", "graceSec", v)}
                  immediate
                  className={inputClass}
                />
              </Field>
            </>
          )}
      </div>
    </div>
  );
}
