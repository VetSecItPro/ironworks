import type { Company } from "@ironworksai/shared";
import { Button } from "@/components/ui/button";
import { Field } from "../agent-config-primitives";

interface GeneralSectionProps {
  selectedCompany: Company;
  companyName: string;
  setCompanyName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  brandColor: string;
  promptPreamble: string;
  setPromptPreamble: (v: string) => void;
  generalDirty: boolean;
  onSave: () => void;
  isSaving: boolean;
  isSuccess: boolean;
  saveError: Error | null;
}

export function GeneralSection({
  companyName,
  setCompanyName,
  description,
  setDescription,
  selectedCompany,
  brandColor,
  promptPreamble,
  setPromptPreamble,
  generalDirty,
  onSave,
  isSaving,
  isSuccess,
  saveError,
}: GeneralSectionProps) {
  return (
    <div id="general" className="space-y-4 scroll-mt-6">
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">General</h2>
      <div className="space-y-3 rounded-md border border-border px-4 py-4">
        <Field label="Company name" hint="The display name for your company.">
          <input
            className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        </Field>
        <Field label="Description" hint="Optional description shown in the company profile.">
          <input
            className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
            type="text"
            value={description}
            placeholder="Optional company description"
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field
          label="Prompt preamble"
          hint="Prepended to every agent's system prompt for this company. Leave empty to inherit the instance-level preamble."
        >
          <textarea
            className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
            rows={4}
            value={promptPreamble}
            placeholder="(empty = inherit instance preamble)"
            onChange={(e) => setPromptPreamble(e.target.value)}
            maxLength={4000}
          />
        </Field>
      </div>

      {/* Validation preview before saving */}
      {generalDirty && (
        <div className="rounded-md border border-amber-400/30 bg-amber-50/30 dark:bg-amber-900/10 px-4 py-3 space-y-2 text-xs">
          <p className="font-medium text-amber-700 dark:text-amber-400">Pending changes preview:</p>
          <div className="space-y-1">
            {companyName !== (selectedCompany?.name ?? "") && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Name:</span>
                <span className="text-red-400 line-through">{selectedCompany?.name}</span>
                <span className="text-emerald-400">{companyName}</span>
              </div>
            )}
            {description !== (selectedCompany?.description ?? "") && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Description:</span>
                <span className="text-emerald-400">{description || "(empty)"}</span>
              </div>
            )}
            {brandColor !== (selectedCompany?.brandColor ?? "") && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Brand Color:</span>
                <span className="text-emerald-400">{brandColor || "(empty)"}</span>
                {brandColor && (
                  <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: brandColor }} />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Save button */}
      {generalDirty && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onSave} disabled={isSaving || !companyName.trim()}>
            {isSaving ? "Saving..." : "Save changes"}
          </Button>
          {isSuccess && <span className="text-xs text-muted-foreground">Saved</span>}
          {saveError && (
            <span className="text-xs text-destructive">
              {saveError instanceof Error ? saveError.message : "Failed to save"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
