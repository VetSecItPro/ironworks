/**
 * Agent config form for the anthropic_api adapter.
 * Covers model, temperature [0,1], maxTokens, cacheControl.breakpoints,
 * extendedThinking.budgetTokens, and systemPromptSkills.
 * API key is deliberately absent — keys live globally in Settings > Providers.
 */

import { ANTHROPIC_MODELS } from "@ironworksai/adapter-anthropic-api";
import type { SkillOption } from "./formPrimitives";
import { FormField, ModelSelect, NumberInput, SkillsMultiSelect, TemperatureSlider } from "./formPrimitives";

export interface AnthropicApiConfigValues {
  model: string;
  temperature: number | undefined;
  maxTokens: number | undefined;
  /** Maps to cacheControl.breakpoints (1 or 2) */
  cacheControlBreakpoints: number | undefined;
  /** Maps to extendedThinking.budgetTokens — minimum 1024 */
  extendedThinkingBudgetTokens: number | undefined;
  systemPromptSkills: string[];
}

interface AnthropicApiConfigFormProps {
  values: AnthropicApiConfigValues;
  onChange: (patch: Partial<AnthropicApiConfigValues>) => void;
  availableSkills: SkillOption[];
}

const BREAKPOINT_OPTIONS = [
  { id: "", label: "Disabled" },
  { id: "1", label: "1 — cache whole system prompt" },
  { id: "2", label: "2 — cache header + tools" },
];

export function AnthropicApiConfigForm({ values, onChange, availableSkills }: AnthropicApiConfigFormProps) {
  const modelOptions = ANTHROPIC_MODELS.map((m) => ({ id: m.id, label: m.label }));
  const selectedModel = ANTHROPIC_MODELS.find((m) => m.id === values.model);

  return (
    <div data-adapter-form="anthropic" className="space-y-4">
      <FormField label="Model" hint="Required">
        <ModelSelect value={values.model} options={modelOptions} onChange={(v) => onChange({ model: v })} />
      </FormField>

      <FormField label="Temperature" hint="[0, 1] — mutually exclusive with extended thinking">
        <TemperatureSlider value={values.temperature} min={0} max={1} onChange={(v) => onChange({ temperature: v })} />
      </FormField>

      <FormField label="Max tokens" hint="Optional — defaults to model max">
        <NumberInput
          value={values.maxTokens}
          min={1}
          placeholder="model default"
          onChange={(v) => onChange({ maxTokens: v })}
        />
      </FormField>

      {/* Cache control — injects cache_control:{type:"ephemeral"} breakpoints into system prompt */}
      <FormField label="Cache control" hint="Prompt caching — cuts input cost ~90% on cache hits">
        <ModelSelect
          value={values.cacheControlBreakpoints !== undefined ? String(values.cacheControlBreakpoints) : ""}
          options={BREAKPOINT_OPTIONS}
          onChange={(v) => onChange({ cacheControlBreakpoints: v === "" ? undefined : parseInt(v, 10) })}
        />
      </FormField>

      {/* Extended thinking — only meaningful on models that support it */}
      <FormField
        label="Extended thinking"
        hint={
          selectedModel?.supportsExtendedThinking
            ? "Reasoning token budget (min 1024)"
            : "Not supported by selected model"
        }
      >
        <NumberInput
          value={values.extendedThinkingBudgetTokens}
          min={1024}
          placeholder="disabled"
          onChange={(v) => onChange({ extendedThinkingBudgetTokens: v })}
        />
        {values.extendedThinkingBudgetTokens !== undefined && values.extendedThinkingBudgetTokens >= 1024 && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Budget tokens: {values.extendedThinkingBudgetTokens.toLocaleString()}
          </p>
        )}
      </FormField>

      <FormField label="System prompt skills" hint="Injected as text at execute time (Anthropic API is stateless)">
        <SkillsMultiSelect
          value={values.systemPromptSkills}
          skills={availableSkills}
          onChange={(v) => onChange({ systemPromptSkills: v })}
        />
      </FormField>
    </div>
  );
}
