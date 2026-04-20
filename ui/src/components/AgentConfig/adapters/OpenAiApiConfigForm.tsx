/**
 * Agent config form for the openai_api adapter.
 * Covers model, temperature [0,2], maxTokens, parallelToolCalls, and systemPromptSkills.
 * Reasoning models (o4 family) show a note about reasoning_tokens billing.
 * API key is deliberately absent — keys live globally in Settings > Providers.
 */

import { OPENAI_MODELS } from "@ironworksai/adapter-openai-api";

/** Reasoning model IDs derived from the model catalog — o4 family bills reasoning_tokens. */
const OPENAI_REASONING_MODEL_IDS = new Set(OPENAI_MODELS.filter((m) => m.isReasoningModel).map((m) => m.id));

import type { SkillOption } from "./formPrimitives";
import { FormField, ModelSelect, NumberInput, SkillsMultiSelect, TemperatureSlider } from "./formPrimitives";

export interface OpenAiApiConfigValues {
  model: string;
  temperature: number | undefined;
  maxTokens: number | undefined;
  parallelToolCalls: boolean | undefined;
  systemPromptSkills: string[];
}

interface OpenAiApiConfigFormProps {
  values: OpenAiApiConfigValues;
  onChange: (patch: Partial<OpenAiApiConfigValues>) => void;
  availableSkills: SkillOption[];
}

export function OpenAiApiConfigForm({ values, onChange, availableSkills }: OpenAiApiConfigFormProps) {
  const modelOptions = OPENAI_MODELS.map((m) => ({ id: m.id, label: m.label }));
  const isReasoning = OPENAI_REASONING_MODEL_IDS.has(values.model);

  return (
    <div data-adapter-form="openai" className="space-y-4">
      <FormField label="Model" hint="Required">
        <ModelSelect value={values.model} options={modelOptions} onChange={(v) => onChange({ model: v })} />
        {/* Surface the reasoning token billing note when a reasoning model is selected */}
        {isReasoning && (
          <p className="text-[10px] text-amber-500 mt-1">
            Reasoning model: thinking tokens billed at output token rate.
          </p>
        )}
      </FormField>

      <FormField label="Temperature" hint="[0, 2] — not applicable to reasoning models">
        <TemperatureSlider value={values.temperature} min={0} max={2} onChange={(v) => onChange({ temperature: v })} />
      </FormField>

      <FormField label="Max tokens" hint="Optional — defaults to model max">
        <NumberInput
          value={values.maxTokens}
          min={1}
          placeholder="model default"
          onChange={(v) => onChange({ maxTokens: v })}
        />
      </FormField>

      <FormField label="Parallel tool calls" hint="Allow OpenAI to call multiple tools in one response">
        <div className="flex items-center gap-3 text-sm">
          {[
            { label: "Auto (default)", value: undefined as boolean | undefined },
            { label: "Enabled", value: true as boolean | undefined },
            { label: "Disabled", value: false as boolean | undefined },
          ].map(({ label, value }) => (
            <button
              key={label}
              type="button"
              onClick={() => onChange({ parallelToolCalls: value })}
              className={`text-xs rounded-md border px-2 py-1 transition-colors ${
                values.parallelToolCalls === value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-accent/50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </FormField>

      <FormField label="System prompt skills" hint="Injected as text at execute time (OpenAI API is stateless)">
        <SkillsMultiSelect
          value={values.systemPromptSkills}
          skills={availableSkills}
          onChange={(v) => onChange({ systemPromptSkills: v })}
        />
      </FormField>
    </div>
  );
}
