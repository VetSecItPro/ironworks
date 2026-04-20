import { Atom, Bot, Globe, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProviderStatus } from "../../hooks/useProviderStatus";
import { cn } from "../../lib/utils";
import type { HttpAdapterProviderType } from "../../types/providers";

interface ProviderMeta {
  type: HttpAdapterProviderType;
  name: string;
  valueProp: string;
  Icon: React.ComponentType<{ className?: string }>;
}

/** Static metadata per HTTP adapter provider. */
const PROVIDERS: ProviderMeta[] = [
  {
    type: "poe",
    name: "Poe",
    valueProp: "Multi-model access via single Poe subscription",
    Icon: Zap,
  },
  {
    type: "anthropic",
    name: "Anthropic",
    // Prompt cache is the key native-API differentiator — surfaces in the value prop
    valueProp: "Direct Claude API with prompt cache + extended thinking",
    Icon: Atom,
  },
  {
    type: "openai",
    name: "OpenAI",
    valueProp: "GPT-5 and o4 reasoning models with structured outputs",
    Icon: Bot,
  },
  {
    type: "openrouter",
    name: "OpenRouter",
    valueProp: "200+ models from 20+ providers through a single gateway",
    Icon: Globe,
  },
];

interface AdapterPickerProps {
  /** Currently selected provider, highlighted with a ring. */
  selected?: HttpAdapterProviderType;
  onSelect: (provider: HttpAdapterProviderType) => void;
  className?: string;
}

function ProviderCard({
  meta,
  selected,
  onSelect,
}: {
  meta: ProviderMeta;
  selected: boolean;
  onSelect: (provider: HttpAdapterProviderType) => void;
}) {
  const { status, isLoading } = useProviderStatus(meta.type);
  const configured = status?.configured ?? false;

  return (
    <Card
      data-provider={meta.type}
      onClick={() => onSelect(meta.type)}
      className={cn(
        "cursor-pointer transition-shadow py-4",
        selected && "ring-2 ring-ring",
      )}
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
      </CardContent>
    </Card>
  );
}

/**
 * Grid of clickable adapter provider cards shown in the agent config adapter section.
 * Each card reads its "Configured" status from the workspace-level provider secrets
 * via useProviderStatus — a proxy for whether an API key has been stored.
 */
export function AdapterPicker({ selected, onSelect, className }: AdapterPickerProps) {
  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3", className)}>
      {PROVIDERS.map((meta) => (
        <ProviderCard
          key={meta.type}
          meta={meta}
          selected={selected === meta.type}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
