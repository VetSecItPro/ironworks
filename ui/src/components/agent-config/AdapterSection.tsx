import type { UseMutationResult } from "@tanstack/react-query";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "../../lib/utils";
import { DraftInput, Field, help } from "../agent-config-primitives";
import { AdapterPicker } from "../AdapterPicker";
import { HelpBeacon } from "../HelpBeacon";
import { MarkdownEditor } from "../MarkdownEditor";
import { ChoosePathButton } from "../PathInstructionsModal";
import { AdapterEnvironmentResult } from "./AdapterEnvironmentResult";
import { AdapterTypeDropdown } from "./AdapterTypeDropdown";
import type { AdapterEnvironmentTestResult, CreateConfigValues, SectionCommonProps } from "./types";
import type { HttpAdapterProviderType } from "../../types/providers";

/** Map from HTTP adapter type strings to the provider type used by AdapterPicker. */
const HTTP_ADAPTER_TYPE_TO_PROVIDER: Record<string, HttpAdapterProviderType> = {
  poe_api: "poe",
  anthropic_api: "anthropic",
  openai_api: "openai",
  openrouter_api: "openrouter",
};

function isHttpAdapterType(adapterType: string): boolean {
  return adapterType in HTTP_ADAPTER_TYPE_TO_PROVIDER;
}

interface AdapterSectionProps extends SectionCommonProps {
  adapterType: string;
  isLocal: boolean;
  showAdapterTypeField: boolean;
  showAdapterTestEnvironmentButton: boolean;
  showLegacyWorkingDirectoryField: boolean;
  hidePromptTemplate?: boolean;
  selectedCompanyId: string | null;
  config: Record<string, unknown>;
  val: CreateConfigValues | null;
  set: ((patch: Partial<CreateConfigValues>) => void) | null;
  onAdapterTypeChange: (type: string) => void;
  testEnvironment: UseMutationResult<AdapterEnvironmentTestResult, Error, void, unknown>;
  uploadMarkdownImage: (file: File, namespace: string) => Promise<string>;
  uiAdapterConfigFields: React.ReactNode;
}

export function AdapterSection({
  isCreate,
  cards,
  eff,
  mark,
  adapterType,
  isLocal,
  showAdapterTypeField,
  showAdapterTestEnvironmentButton,
  showLegacyWorkingDirectoryField,
  selectedCompanyId,
  config,
  val,
  set,
  onAdapterTypeChange,
  testEnvironment,
  uploadMarkdownImage,
  uiAdapterConfigFields,
}: AdapterSectionProps) {
  const _inputClass =
    "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

  return (
    <div className={cn(!cards && (isCreate ? "border-t border-border" : "border-b border-border"))}>
      <div
        className={cn(
          cards ? "flex items-center justify-between mb-3" : "px-4 py-2 flex items-center justify-between gap-2",
        )}
      >
        {cards ? (
          <h3 className="text-sm font-medium">Adapter</h3>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">Adapter</span>
        )}
        {showAdapterTestEnvironmentButton && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => testEnvironment.mutate()}
            disabled={testEnvironment.isPending || !selectedCompanyId}
          >
            {testEnvironment.isPending ? "Testing..." : "Test environment"}
          </Button>
        )}
      </div>
      <div className={cn(cards ? "border border-border rounded-lg p-4 space-y-3" : "px-4 pb-3 space-y-3")}>
        {showAdapterTypeField && (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs text-muted-foreground">Adapter type</span>
              <HelpBeacon text="The adapter type determines which AI coding tool powers this agent. Claude Code, Codex, Gemini CLI, and others each have different capabilities, pricing, and model access. Choose based on the LLM provider you want to use." />
            </div>
            <AdapterTypeDropdown value={adapterType} onChange={onAdapterTypeChange} />
          </div>
        )}

        {/* HTTP adapter picker cards — shown when current adapter type is an HTTP provider */}
        {showAdapterTypeField && isHttpAdapterType(adapterType) && (
          <AdapterPicker
            selected={HTTP_ADAPTER_TYPE_TO_PROVIDER[adapterType]}
            onSelect={(provider) => {
              // Map provider back to adapter type string and delegate to the existing handler
              const adapterTypeForProvider = Object.entries(HTTP_ADAPTER_TYPE_TO_PROVIDER).find(
                ([, p]) => p === provider,
              )?.[0];
              if (adapterTypeForProvider) onAdapterTypeChange(adapterTypeForProvider);
            }}
          />
        )}

        {testEnvironment.error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {testEnvironment.error instanceof Error ? testEnvironment.error.message : "Environment test failed"}
          </div>
        )}

        {testEnvironment.data && <AdapterEnvironmentResult result={testEnvironment.data} />}

        {/* Working directory */}
        {showLegacyWorkingDirectoryField && (
          <Field label="Working directory (deprecated)" hint={help.cwd}>
            <div className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <DraftInput
                value={isCreate ? val!.cwd : eff("adapterConfig", "cwd", String(config.cwd ?? ""))}
                onCommit={(v) => (isCreate ? set!({ cwd: v }) : mark("adapterConfig", "cwd", v || undefined))}
                immediate
                className="w-full bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40"
                placeholder="/path/to/project"
              />
              <ChoosePathButton />
            </div>
          </Field>
        )}

        {/* Prompt template (create mode only - edit mode shows this in Identity) */}
        {isLocal && isCreate && (
          <>
            <Field label="Prompt Template" hint={help.promptTemplate}>
              <MarkdownEditor
                value={val!.promptTemplate}
                onChange={(v) => set!({ promptTemplate: v })}
                placeholder="You are agent {{ agent.name }}. Your role is {{ agent.role }}..."
                contentClassName="min-h-[88px] text-sm font-mono"
                imageUploadHandler={async (file) => {
                  return uploadMarkdownImage(file, "agents/drafts/prompt-template");
                }}
              />
            </Field>
            <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              Prompt template is replayed on every heartbeat. Prefer small task framing and variables like{" "}
              <code>{"{{ context.* }}"}</code> or <code>{"{{ run.* }}"}</code>; avoid repeating stable instructions
              here.
            </div>
          </>
        )}

        {/* Adapter-specific fields */}
        {uiAdapterConfigFields}
      </div>
    </div>
  );
}
