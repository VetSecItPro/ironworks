import { Check, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { LlmProviderLogo } from "../LlmProviderLogos";
import { LLM_PROVIDERS } from "./constants";

interface StepLlmProviderProps {
  llmProvider: string;
  llmApiKey: string;
  llmSaved: boolean;
  error: string | null;
  onProviderChange: (key: string) => void;
  onApiKeyChange: (value: string) => void;
  onErrorClear: () => void;
}

export function StepLlmProvider({
  llmProvider,
  llmApiKey,
  llmSaved,
  error,
  onProviderChange,
  onApiKeyChange,
  onErrorClear,
}: StepLlmProviderProps) {
  const activeProvider = LLM_PROVIDERS.find((p) => p.key === llmProvider) ?? LLM_PROVIDERS[0];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Connect your LLM provider</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your AI agents need an API key to function. Choose your provider and paste your key.
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

      {/* API Key / URL input */}
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

      {llmSaved && (
        <div className="inline-flex items-center gap-2 rounded-full bg-green-500/10 border border-green-500/30 px-3 py-1.5 text-sm text-green-600 dark:text-green-400">
          <Check className="h-4 w-4" />
          <span className="font-medium">Connected</span>
          <span className="text-xs text-green-600/70 dark:text-green-400/70">
            {activeProvider.key === "ollama" ? "Server URL saved" : "API key saved"}
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
