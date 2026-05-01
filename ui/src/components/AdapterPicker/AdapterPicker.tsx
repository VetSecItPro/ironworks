import { useMutation } from "@tanstack/react-query";
import { Atom, Bot, Check, Globe, Loader2, X, Zap } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "../../api/client";
import { useProviderStatus } from "../../hooks/useProviderStatus";
import { cn } from "../../lib/utils";
import type { HttpAdapterProviderType, ProviderTestResponse } from "../../types/providers";

interface ProviderMeta {
  type: HttpAdapterProviderType;
  name: string;
  valueProp: string;
  Icon: React.ComponentType<{ className?: string }>;
}

/** Static metadata per HTTP adapter provider. Types match AGENT_ADAPTER_TYPES on the server. */
const PROVIDERS: ProviderMeta[] = [
  {
    type: "poe_api",
    name: "Poe",
    valueProp: "Multi-model access via single Poe subscription",
    Icon: Zap,
  },
  {
    type: "anthropic_api",
    name: "Anthropic",
    // Prompt cache is the key native-API differentiator — surfaces in the value prop
    valueProp: "Direct Claude API with prompt cache + extended thinking",
    Icon: Atom,
  },
  {
    type: "openai_api",
    name: "OpenAI",
    valueProp: "GPT-5 and o4 reasoning models with structured outputs",
    Icon: Bot,
  },
  {
    type: "openrouter_api",
    name: "OpenRouter",
    valueProp: "200+ models from 20+ providers through a single gateway",
    Icon: Globe,
  },
];

interface AdapterPickerProps {
  /** Company UUID — required to scope the provider-status query. */
  companyId: string | null | undefined;
  /** Currently selected provider, highlighted with a ring. */
  selected?: HttpAdapterProviderType;
  onSelect: (provider: HttpAdapterProviderType) => void;
  className?: string;
}

function ProviderCard({
  companyId,
  meta,
  selected,
  onSelect,
}: {
  companyId: string | null | undefined;
  meta: ProviderMeta;
  selected: boolean;
  onSelect: (provider: HttpAdapterProviderType) => void;
}) {
  const { status, isLoading } = useProviderStatus(companyId, meta.type);
  const configured = status?.configured ?? false;
  const [testResult, setTestResult] = useState<{ passed: boolean; error?: string } | null>(null);

  const testMutation = useMutation({
    mutationFn: () => api.post<ProviderTestResponse>(`/companies/${companyId}/providers/${meta.type}/test`, {}),
    onSuccess: (res) => {
      setTestResult({ passed: res.passed, error: res.error });
      setTimeout(() => setTestResult(null), 4000);
    },
    onError: (err) => {
      setTestResult({ passed: false, error: err instanceof Error ? err.message : "Test failed" });
      setTimeout(() => setTestResult(null), 4000);
    },
  });

  return (
    <Card
      data-provider={meta.type}
      onClick={() => onSelect(meta.type)}
      className={cn("cursor-pointer transition-shadow py-4", selected && "ring-2 ring-ring")}
    >
      <CardHeader className="pb-2 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <meta.Icon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">{meta.name}</CardTitle>
          </div>
          {!isLoading && (
            <Badge
              variant={configured ? "default" : "muted"}
              className={configured ? "bg-green-600/15 text-green-600 dark:text-green-400 border-0" : ""}
            >
              {configured ? "Configured" : "Not configured"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4">
        <p className="text-xs text-muted-foreground leading-relaxed">{meta.valueProp}</p>
        {configured && companyId && (
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              disabled={testMutation.isPending}
              onClick={(e) => {
                e.stopPropagation();
                testMutation.mutate();
              }}
            >
              {testMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <>Test connection</>}
            </Button>
            {testResult &&
              (testResult.passed ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400">
                  <Check className="h-3 w-3" />
                  Pass
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 text-[10px] text-destructive truncate max-w-[180px]"
                  title={testResult.error ?? "Failed"}
                >
                  <X className="h-3 w-3" />
                  {testResult.error ?? "Fail"}
                </span>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Grid of clickable adapter provider cards shown in the agent config adapter section.
 * Each card reads its "Configured" status from the workspace-level provider secrets
 * via useProviderStatus — a proxy for whether an API key has been stored.
 */
export function AdapterPicker({ companyId, selected, onSelect, className }: AdapterPickerProps) {
  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3", className)}>
      {PROVIDERS.map((meta) => (
        <ProviderCard
          key={meta.type}
          companyId={companyId}
          meta={meta}
          selected={selected === meta.type}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
