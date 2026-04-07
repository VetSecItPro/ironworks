import { Check, Key } from "lucide-react";
import { ApiKeyOnboardingBanner } from "../ApiKeyOnboardingBanner";

interface ApiKeysSectionProps {
  configuredKeys: Set<string>;
}

export function ApiKeysSection({ configuredKeys }: ApiKeysSectionProps) {
  return (
    <div id="api-keys" className="space-y-4 scroll-mt-6">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <Key className="h-3.5 w-3.5" />
        LLM API Keys
      </div>
      <ApiKeyOnboardingBanner />
      {configuredKeys.size > 0 && (
        <div className="rounded-md border border-border px-4 py-3">
          <div className="flex gap-2">
            {["ANTHROPIC_API_KEY", "OPENAI_API_KEY"].map((keyName) => (
              <span
                key={keyName}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                  configuredKeys.has(keyName)
                    ? "bg-green-500/10 text-green-600 dark:text-green-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {configuredKeys.has(keyName) && <Check className="h-3 w-3" />}
                {keyName === "ANTHROPIC_API_KEY" ? "Anthropic" : "OpenAI"}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
