import { Check, Terminal, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { LlmProviderLogo } from "../LlmProviderLogos";
import { LLM_PROVIDERS } from "./constants";
import type { LlmAuthMode } from "./types";

interface StepLlmProviderProps {
  llmProvider: string;
  llmAuthMode: LlmAuthMode;
  llmApiKey: string;
  llmSaved: boolean;
  error: string | null;
  onProviderChange: (key: string) => void;
  onAuthModeChange: (mode: LlmAuthMode) => void;
  onApiKeyChange: (value: string) => void;
  onErrorClear: () => void;
}

export function StepLlmProvider({
  llmProvider,
  llmAuthMode,
  llmApiKey,
  llmSaved,
  error,
  onProviderChange,
  onAuthModeChange,
  onApiKeyChange,
  onErrorClear,
}: StepLlmProviderProps) {
  const activeProvider = LLM_PROVIDERS.find((p) => p.key === llmProvider) ?? LLM_PROVIDERS[0];
  const supportsSubscription = Boolean(activeProvider.subscription);
  // Providers without a subscription path are forced into api_key mode regardless
  // of the stored state (e.g. the user picked Anthropic subscription then switched
  // to OpenRouter, which has no subscription option).
  const effectiveAuthMode: LlmAuthMode = supportsSubscription ? llmAuthMode : "api_key";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Connect your LLM provider</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your AI agents need access to an LLM. Sign in with a subscription you already have, or paste an API key.
        </p>
      </div>

      {/* Provider selector */}
      <div className="grid grid-cols-2 gap-2">
        {LLM_PROVIDERS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              onProviderChange(p.key);
              // Default to subscription for providers that support it; API key otherwise
              onAuthModeChange(p.subscription ? "subscription" : "api_key");
              onApiKeyChange("");
              onErrorClear();
            }}
            className={cn(
              "rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
              llmProvider === p.key
                ? "border-foreground bg-foreground/5 font-medium"
                : "border-border hover:border-foreground/30",
            )}
          >
            <span className="flex items-center gap-2">
              <LlmProviderLogo provider={p.key} className="h-4 w-4 shrink-0" />
              <span>{p.label}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Auth mode sub-selector (only when provider supports both) */}
      {supportsSubscription && activeProvider.subscription && (
        <div className="space-y-2">
          <div className="text-sm font-medium">How do you want to connect?</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                onAuthModeChange("subscription");
                onApiKeyChange("");
                onErrorClear();
              }}
              className={cn(
                "rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                effectiveAuthMode === "subscription"
                  ? "border-foreground bg-foreground/5"
                  : "border-border hover:border-foreground/30",
              )}
            >
              <div className="font-medium">{activeProvider.subscription.label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{activeProvider.subscription.tagline}</div>
            </button>
            <button
              type="button"
              onClick={() => {
                onAuthModeChange("api_key");
                onErrorClear();
              }}
              className={cn(
                "rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                effectiveAuthMode === "api_key"
                  ? "border-foreground bg-foreground/5"
                  : "border-border hover:border-foreground/30",
              )}
            >
              <div className="font-medium">API key</div>
              <div className="mt-0.5 text-xs text-muted-foreground">Pay per token via the platform API.</div>
            </button>
          </div>
        </div>
      )}

      {/* Subscription instructions OR API Key input.
          Wrapper reserves a min-height so switching between modes does not
          shift the footer up and down. 260px covers the tallest state
          (subscription instructions panel); API-key mode has extra space
          below the input, keeping the footer anchored. */}
      <div className="min-h-[260px]">
      {effectiveAuthMode === "subscription" && activeProvider.subscription ? (
        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Terminal className="h-4 w-4" />
            One-time sign-in for {activeProvider.subscription.label}
          </div>
          <p className="text-xs text-muted-foreground">
            Your {activeProvider.subscription.label} account signs in once on the server that hosts Ironworks. After
            that, agents use your subscription automatically — no API key needed.
          </p>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">An Ironworks admin runs this once:</p>
            <pre className="rounded bg-background px-3 py-2 text-xs font-mono select-all overflow-x-auto">
              {`docker exec -it ironworks-atlas-ironworks-1 ${activeProvider.subscription.loginCommand}`}
            </pre>
            <p className="text-xs text-muted-foreground">
              The command prints a link. Open the link, sign in with your {activeProvider.subscription.label} account,
              and you're done. The session stays authenticated until you sign out.
            </p>
          </div>
          <p className="text-xs text-muted-foreground border-t border-border/60 pt-2">
            Not an admin? Send the command above to whoever installed Ironworks, or switch to{" "}
            <button
              type="button"
              onClick={() => onAuthModeChange("api_key")}
              className="underline underline-offset-2 hover:text-foreground"
            >
              API key
            </button>{" "}
            instead.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <label htmlFor="llm-api-key" className="text-sm font-medium">
            {activeProvider.key === "ollama" ? "Server URL" : "API Key"}
          </label>
          <div className="relative">
            <input
              id="llm-api-key"
              type={activeProvider.key === "ollama" ? "url" : "password"}
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 pr-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 placeholder:text-muted-foreground/70"
              placeholder={activeProvider.placeholder}
              value={llmApiKey}
              onChange={(e) => {
                onApiKeyChange(e.target.value);
                onErrorClear();
              }}
              autoComplete="off"
            />
            {/* Inline format validation indicator */}
            {llmApiKey.trim().length > 0 && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                {(() => {
                  const val = llmApiKey.trim();
                  const prefix = activeProvider.placeholder.split("...")[0] || "";
                  const valid = val.length > 10 && (prefix === "API key" || prefix === "http" || val.startsWith(prefix));
                  return valid ? <Check className="h-4 w-4 text-green-500" /> : <X className="h-4 w-4 text-red-400" />;
                })()}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{activeProvider.hint}</p>
        </div>
      )}
      </div>

      {llmSaved && (
        <div className="inline-flex items-center gap-2 rounded-full bg-green-500/10 border border-green-500/30 px-3 py-1.5 text-sm text-green-600 dark:text-green-400">
          <Check className="h-4 w-4" />
          <span className="font-medium">Connected</span>
          <span className="text-xs text-green-600/70 dark:text-green-400/70">
            {effectiveAuthMode === "subscription"
              ? "Subscription selected"
              : activeProvider.key === "ollama"
                ? "Server URL saved"
                : "API key saved"}
          </span>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
