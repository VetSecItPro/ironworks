/**
 * Agent config form for the openrouter_api adapter.
 * Covers model, temperature [0,2], maxTokens, httpReferer, xTitle, and systemPromptSkills.
 * httpReferer + xTitle are optional but recommended per OpenRouter convention.
 * API key is deliberately absent — keys live globally in Settings > Providers.
 */

import { OPENROUTER_MODELS } from "@ironworksai/adapter-openrouter-api";
import type { SkillOption } from "./formPrimitives";
import { FormField, ModelSelect, NumberInput, SkillsMultiSelect, TemperatureSlider, TextInput } from "./formPrimitives";

export interface OpenRouterApiConfigValues {
  model: string;
  temperature: number | undefined;
  maxTokens: number | undefined;
  /** Sent as HTTP-Referer header — identifies the app to OpenRouter usage dashboards */
  httpReferer: string | undefined;
  /** Sent as X-Title header — human-readable app name on openrouter.ai */
  xTitle: string | undefined;
  systemPromptSkills: string[];
}

interface OpenRouterApiConfigFormProps {
  values: OpenRouterApiConfigValues;
  onChange: (patch: Partial<OpenRouterApiConfigValues>) => void;
  availableSkills: SkillOption[];
}

export function OpenRouterApiConfigForm({ values, onChange, availableSkills }: OpenRouterApiConfigFormProps) {
  const modelOptions = OPENROUTER_MODELS.map((m) => ({
    id: m.id,
    label: `${m.label} (${m.provider})`,
  }));

  return (
    <div data-adapter-form="openrouter" className="space-y-4">
      <FormField label="Model" hint="Required">
        <ModelSelect value={values.model} options={modelOptions} onChange={(v) => onChange({ model: v })} />
      </FormField>

      <FormField label="Temperature" hint="[0, 2] — optional">
        <TemperatureSlider value={values.temperature} min={0} max={2} onChange={(v) => onChange({ temperature: v })} />
      </FormField>

      <FormField label="Max tokens" hint="Optional — defaults to 4096">
        <NumberInput value={values.maxTokens} min={1} placeholder="4096" onChange={(v) => onChange({ maxTokens: v })} />
      </FormField>

      {/* OpenRouter recommends setting these headers for usage attribution */}
      <FormField label="HTTP Referer" hint="Optional — identifies your app in OpenRouter dashboards">
        <TextInput
          value={values.httpReferer}
          placeholder="https://command.useapex.io"
          onChange={(v) => onChange({ httpReferer: v })}
        />
      </FormField>

      <FormField label="X-Title" hint="Optional — human-readable app name">
        <TextInput value={values.xTitle} placeholder="IronWorks" onChange={(v) => onChange({ xTitle: v })} />
      </FormField>

      <FormField label="System prompt skills" hint="Injected as text at execute time (OpenRouter API is stateless)">
        <SkillsMultiSelect
          value={values.systemPromptSkills}
          skills={availableSkills}
          onChange={(v) => onChange({ systemPromptSkills: v })}
        />
      </FormField>
    </div>
  );
}
