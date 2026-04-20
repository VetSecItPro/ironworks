/**
 * Agent config form for the poe_api adapter.
 * Covers model, temperature, maxTokens, and systemPromptSkills.
 * API key is deliberately absent — keys live globally in Settings > Providers.
 */

import { POE_MODELS } from "@ironworksai/adapter-poe-api";
import type { SkillOption } from "./formPrimitives";
import { FormField, ModelSelect, NumberInput, SkillsMultiSelect, TemperatureSlider } from "./formPrimitives";

export interface PoeApiConfigValues {
  model: string;
  temperature: number | undefined;
  maxTokens: number | undefined;
  systemPromptSkills: string[];
}

interface PoeApiConfigFormProps {
  values: PoeApiConfigValues;
  onChange: (patch: Partial<PoeApiConfigValues>) => void;
  availableSkills: SkillOption[];
}

export function PoeApiConfigForm({ values, onChange, availableSkills }: PoeApiConfigFormProps) {
  const modelOptions = POE_MODELS.map((m) => ({ id: m.id, label: m.label }));

  return (
    <div data-adapter-form="poe" className="space-y-4">
      <FormField label="Model" hint="Required">
        <ModelSelect value={values.model} options={modelOptions} onChange={(v) => onChange({ model: v })} />
      </FormField>

      <FormField label="Temperature" hint="[0, 2] — optional">
        <TemperatureSlider value={values.temperature} min={0} max={2} onChange={(v) => onChange({ temperature: v })} />
      </FormField>

      <FormField label="Max tokens" hint="Optional">
        <NumberInput
          value={values.maxTokens}
          min={1}
          placeholder="model default"
          onChange={(v) => onChange({ maxTokens: v })}
        />
      </FormField>

      <FormField label="System prompt skills" hint="Injected as text at execute time (Poe cannot sync files to disk)">
        <SkillsMultiSelect
          value={values.systemPromptSkills}
          skills={availableSkills}
          onChange={(v) => onChange({ systemPromptSkills: v })}
        />
      </FormField>
    </div>
  );
}
