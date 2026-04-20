import { DEFAULT_CODEX_LOCAL_MODEL } from "@ironworksai/adapter-codex-local";
import { DEFAULT_CURSOR_LOCAL_MODEL } from "@ironworksai/adapter-cursor-local";
import { DEFAULT_GEMINI_LOCAL_MODEL } from "@ironworksai/adapter-gemini-local";
import type { AdapterEnvironmentTestResult } from "@ironworksai/shared";
import { Bot, Check, ChevronDown, Code, Gem, MousePointer2, Terminal, Wand2 } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { extractModelName, extractProviderIdWithFallback } from "../../lib/model-utils";
import { cn } from "../../lib/utils";
import { HelpBeacon } from "../HelpBeacon";
import { OpenCodeLogoIcon } from "../OpenCodeLogoIcon";
import { AdapterEnvironmentResult } from "./AdapterEnvironmentResult";
import type { AdapterType } from "./types";

interface ManualAgentSectionProps {
  agentName: string;
  onAgentNameChange: (value: string) => void;
  adapterType: AdapterType;
  onAdapterTypeChange: (type: AdapterType) => void;
  model: string;
  onModelChange: (value: string) => void;
  url: string;
  onUrlChange: (value: string) => void;
  showMoreAdapters: boolean;
  onShowMoreAdaptersChange: (show: boolean) => void;
  modelOpen: boolean;
  onModelOpenChange: (open: boolean) => void;
  modelSearch: string;
  onModelSearchChange: (value: string) => void;
  adapterModels: Array<{ id: string; label: string }> | undefined;
  isLocalAdapter: boolean;
  effectiveAdapterCommand: string;
  adapterEnvResult: AdapterEnvironmentTestResult | null;
  adapterEnvError: string | null;
  adapterEnvLoading: boolean;
  onRunAdapterEnvTest: () => void;
  shouldSuggestUnsetAnthropicApiKey: boolean;
  unsetAnthropicLoading: boolean;
  onUnsetAnthropicApiKey: () => void;
}

export function ManualAgentSection({
  agentName,
  onAgentNameChange,
  adapterType,
  onAdapterTypeChange,
  model,
  onModelChange,
  url,
  onUrlChange,
  showMoreAdapters,
  onShowMoreAdaptersChange,
  modelOpen,
  onModelOpenChange,
  modelSearch,
  onModelSearchChange,
  adapterModels,
  isLocalAdapter,
  effectiveAdapterCommand,
  adapterEnvResult,
  adapterEnvError,
  adapterEnvLoading,
  onRunAdapterEnvTest,
  shouldSuggestUnsetAnthropicApiKey,
  unsetAnthropicLoading,
  onUnsetAnthropicApiKey,
}: ManualAgentSectionProps) {
  const selectedModel = (adapterModels ?? []).find((m) => m.id === model);

  const filteredModels = useMemo(() => {
    const query = modelSearch.trim().toLowerCase();
    return (adapterModels ?? []).filter((entry) => {
      if (!query) return true;
      const provider = extractProviderIdWithFallback(entry.id, "");
      return (
        entry.id.toLowerCase().includes(query) ||
        entry.label.toLowerCase().includes(query) ||
        provider.toLowerCase().includes(query)
      );
    });
  }, [adapterModels, modelSearch]);

  const groupedModels = useMemo(() => {
    if (adapterType !== "opencode_local") {
      return [{ provider: "models", entries: [...filteredModels].sort((a, b) => a.id.localeCompare(b.id)) }];
    }
    const groups = new Map<string, Array<{ id: string; label: string }>>();
    for (const entry of filteredModels) {
      const provider = extractProviderIdWithFallback(entry.id);
      const bucket = groups.get(provider) ?? [];
      bucket.push(entry);
      groups.set(provider, bucket);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, entries]) => ({ provider, entries: [...entries].sort((a, b) => a.id.localeCompare(b.id)) }));
  }, [filteredModels, adapterType]);

  return (
    <>
      <div>
        <label htmlFor="onboarding-agent-name" className="text-xs text-muted-foreground mb-1 block">Agent name</label>
        <input
          id="onboarding-agent-name"
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 placeholder:text-muted-foreground/70"
          placeholder="CEO"
          value={agentName}
          onChange={(e) => onAgentNameChange(e.target.value)}
        />
      </div>

      {/* Adapter type radio cards */}
      <div>
        <span className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
          Adapter type
          <HelpBeacon text="The adapter determines which AI coding tool powers this agent. Claude Code and Codex are recommended for most use cases. Expand 'More' to see Gemini CLI, OpenCode, and other options." />
        </span>
        <div className="grid grid-cols-2 gap-2">
          {[
            {
              value: "claude_local" as const,
              label: "Claude Code",
              icon: Wand2,
              desc: "Local Claude agent",
              recommended: true,
            },
            { value: "codex_local" as const, label: "Codex", icon: Code, desc: "Local Codex agent", recommended: true },
          ].map((opt) => (
            <button type="button"
              key={opt.value}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-md border p-3 text-xs transition-colors relative",
                adapterType === opt.value ? "border-foreground bg-accent" : "border-border hover:bg-accent/50",
              )}
              onClick={() => {
                const nextType = opt.value as AdapterType;
                onAdapterTypeChange(nextType);
                if (nextType === "codex_local" && !model) onModelChange(DEFAULT_CODEX_LOCAL_MODEL);
                if (nextType !== "codex_local") onModelChange("");
              }}
            >
              {opt.recommended && (
                <span className="absolute -top-1.5 right-1.5 bg-green-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none">
                  Recommended
                </span>
              )}
              <opt.icon className="h-4 w-4" />
              <span className="font-medium">{opt.label}</span>
              <span className="text-muted-foreground text-[10px]">{opt.desc}</span>
            </button>
          ))}
        </div>

        <button type="button"
          className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => onShowMoreAdaptersChange(!showMoreAdapters)}
        >
          <ChevronDown className={cn("h-3 w-3 transition-transform", showMoreAdapters ? "rotate-0" : "-rotate-90")} />
          More Agent Adapter Types
        </button>

        {showMoreAdapters && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            {[
              { value: "gemini_local" as const, label: "Gemini CLI", icon: Gem, desc: "Local Gemini agent" },
              {
                value: "opencode_local" as const,
                label: "OpenCode",
                icon: OpenCodeLogoIcon,
                desc: "Local multi-provider agent",
              },
              { value: "pi_local" as const, label: "Pi", icon: Terminal, desc: "Local Pi agent" },
              { value: "cursor" as const, label: "Cursor", icon: MousePointer2, desc: "Local Cursor agent" },
              {
                value: "openclaw_gateway" as const,
                label: "OpenClaw Gateway",
                icon: Bot,
                desc: "Invoke OpenClaw via gateway protocol",
                comingSoon: true,
                disabledLabel: "Configure OpenClaw within the App",
              },
            ].map((opt) => (
              <button type="button"
                key={opt.value}
                disabled={!!opt.comingSoon}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-md border p-3 text-xs transition-colors relative",
                  opt.comingSoon
                    ? "border-border opacity-40 cursor-not-allowed"
                    : adapterType === opt.value
                      ? "border-foreground bg-accent"
                      : "border-border hover:bg-accent/50",
                )}
                onClick={() => {
                  if (opt.comingSoon) return;
                  const nextType = opt.value as AdapterType;
                  onAdapterTypeChange(nextType);
                  if (nextType === "gemini_local" && !model) {
                    onModelChange(DEFAULT_GEMINI_LOCAL_MODEL);
                    return;
                  }
                  if (nextType === "cursor" && !model) {
                    onModelChange(DEFAULT_CURSOR_LOCAL_MODEL);
                    return;
                  }
                  if (nextType === "opencode_local") {
                    if (!model.includes("/")) onModelChange("");
                    return;
                  }
                  onModelChange("");
                }}
              >
                <opt.icon className="h-4 w-4" />
                <span className="font-medium">{opt.label}</span>
                <span className="text-muted-foreground text-[10px]">
                  {opt.comingSoon ? ((opt as { disabledLabel?: string }).disabledLabel ?? "Coming soon") : opt.desc}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Model selector for local adapters */}
      {(adapterType === "claude_local" ||
        adapterType === "codex_local" ||
        adapterType === "gemini_local" ||
        adapterType === "opencode_local" ||
        adapterType === "pi_local" ||
        adapterType === "cursor") && (
        <div className="space-y-3">
          <div>
            <span className="text-xs text-muted-foreground mb-1 block">Model</span>
            <Popover
              open={modelOpen}
              onOpenChange={(next) => {
                onModelOpenChange(next);
                if (!next) onModelSearchChange("");
              }}
            >
              <PopoverTrigger asChild>
                <button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-accent/50 transition-colors w-full justify-between">
                  <span className={cn(!model && "text-muted-foreground")}>
                    {selectedModel
                      ? selectedModel.label
                      : model || (adapterType === "opencode_local" ? "Select model (required)" : "Default")}
                  </span>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-1" align="start">
                <input
                  className="w-full px-2 py-1.5 text-xs bg-transparent outline-none border-b border-border mb-1 placeholder:text-muted-foreground/70"
                  placeholder="Search models..."
                  value={modelSearch}
                  onChange={(e) => onModelSearchChange(e.target.value)}
                />
                {adapterType !== "opencode_local" && (
                  <button type="button"
                    className={cn(
                      "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent/50",
                      !model && "bg-accent",
                    )}
                    onClick={() => {
                      onModelChange("");
                      onModelOpenChange(false);
                    }}
                  >
                    Default
                  </button>
                )}
                <div className="max-h-[240px] overflow-y-auto">
                  {groupedModels.map((group) => (
                    <div key={group.provider} className="mb-1 last:mb-0">
                      {adapterType === "opencode_local" && (
                        <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {group.provider} ({group.entries.length})
                        </div>
                      )}
                      {group.entries.map((m) => (
                        <button type="button"
                          key={m.id}
                          className={cn(
                            "flex items-center w-full px-2 py-1.5 text-sm rounded hover:bg-accent/50",
                            m.id === model && "bg-accent",
                          )}
                          onClick={() => {
                            onModelChange(m.id);
                            onModelOpenChange(false);
                          }}
                        >
                          <span className="block w-full text-left truncate" title={m.id}>
                            {adapterType === "opencode_local" ? extractModelName(m.id) : m.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
                {filteredModels.length === 0 && (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">No models discovered.</p>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}

      {/* Adapter environment test */}
      {isLocalAdapter && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium">Adapter environment check</p>
              <p className="text-[11px] text-muted-foreground">
                Runs a live probe that asks the adapter CLI to respond with hello.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs"
              disabled={adapterEnvLoading}
              onClick={() => void onRunAdapterEnvTest()}
            >
              {adapterEnvLoading ? "Testing..." : "Test now"}
            </Button>
          </div>
          {adapterEnvError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
              {adapterEnvError}
            </div>
          )}
          {adapterEnvResult && adapterEnvResult.status === "pass" ? (
            <div className="flex items-center gap-2 rounded-md border border-green-300 dark:border-green-500/40 bg-green-50 dark:bg-green-500/10 px-3 py-2 text-xs text-green-700 dark:text-green-300 animate-in fade-in slide-in-from-bottom-1 duration-300">
              <Check className="h-3.5 w-3.5 shrink-0" />
              <span className="font-medium">Passed</span>
            </div>
          ) : adapterEnvResult ? (
            <AdapterEnvironmentResult result={adapterEnvResult} />
          ) : null}
          {shouldSuggestUnsetAnthropicApiKey && (
            <div className="rounded-md border border-amber-300/60 bg-amber-50/40 px-2.5 py-2 space-y-2">
              <p className="text-[11px] text-amber-900/90 leading-relaxed">
                Claude failed while <span className="font-mono">ANTHROPIC_API_KEY</span> is set. You can clear it in
                this CEO adapter config and retry the probe.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs"
                disabled={adapterEnvLoading || unsetAnthropicLoading}
                onClick={() => void onUnsetAnthropicApiKey()}
              >
                {unsetAnthropicLoading ? "Retrying..." : "Unset ANTHROPIC_API_KEY"}
              </Button>
            </div>
          )}
          {adapterEnvResult && adapterEnvResult.status === "fail" && (
            <div className="rounded-md border border-border/70 bg-muted/20 px-2.5 py-2 text-[11px] space-y-1.5">
              <p className="font-medium">Manual debug</p>
              <p className="text-muted-foreground font-mono break-all">
                {adapterType === "cursor"
                  ? `${effectiveAdapterCommand} -p --mode ask --output-format json "Respond with hello."`
                  : adapterType === "codex_local"
                    ? `${effectiveAdapterCommand} exec --json -`
                    : adapterType === "gemini_local"
                      ? `${effectiveAdapterCommand} --output-format json "Respond with hello."`
                      : adapterType === "opencode_local"
                        ? `${effectiveAdapterCommand} run --format json "Respond with hello."`
                        : `${effectiveAdapterCommand} --print - --output-format stream-json --verbose`}
              </p>
              <p className="text-muted-foreground">
                Prompt: <span className="font-mono">Respond with hello.</span>
              </p>
              {adapterType === "cursor" ||
              adapterType === "codex_local" ||
              adapterType === "gemini_local" ||
              adapterType === "opencode_local" ? (
                <p className="text-muted-foreground">
                  If auth fails, set{" "}
                  <span className="font-mono">
                    {adapterType === "cursor"
                      ? "CURSOR_API_KEY"
                      : adapterType === "gemini_local"
                        ? "GEMINI_API_KEY"
                        : "OPENAI_API_KEY"}
                  </span>{" "}
                  in env or run{" "}
                  <span className="font-mono">
                    {adapterType === "cursor"
                      ? "agent login"
                      : adapterType === "codex_local"
                        ? "codex login"
                        : adapterType === "gemini_local"
                          ? "gemini auth"
                          : "opencode auth login"}
                  </span>
                  .
                </p>
              ) : (
                <p className="text-muted-foreground">
                  If login is required, run <span className="font-mono">claude login</span> and retry.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* HTTP / OpenClaw URL */}
      {(adapterType === "http" || adapterType === "openclaw_gateway") && (
        <div>
          <label htmlFor="onboarding-adapter-url" className="text-xs text-muted-foreground mb-1 block">
            {adapterType === "openclaw_gateway" ? "Gateway URL" : "Webhook URL"}
          </label>
          <input
            id="onboarding-adapter-url"
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-ring/50 placeholder:text-muted-foreground/70"
            placeholder={adapterType === "openclaw_gateway" ? "ws://127.0.0.1:18789" : "https://..."}
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
          />
        </div>
      )}
    </>
  );
}
