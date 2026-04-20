import type { CompanyPortabilityCollisionStrategy } from "@ironworksai/shared";
import { Github, Upload } from "lucide-react";
import { type ChangeEvent, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "../../components/agent-config-primitives";
import { cn } from "../../lib/utils";

interface ImportSourceFormProps {
  sourceMode: "github" | "local";
  onSourceModeChange: (mode: "github" | "local") => void;
  importUrl: string;
  onImportUrlChange: (url: string) => void;
  localPackage: {
    name: string;
    files: Record<string, unknown>;
  } | null;
  onChooseLocalPackage: (e: ChangeEvent<HTMLInputElement>) => void;
  targetMode: "existing" | "new";
  onTargetModeChange: (mode: "existing" | "new") => void;
  selectedCompanyName: string | undefined;
  newCompanyName: string;
  onNewCompanyNameChange: (name: string) => void;
  collisionStrategy: CompanyPortabilityCollisionStrategy;
  onCollisionStrategyChange: (strategy: CompanyPortabilityCollisionStrategy) => void;
  onPreview: () => void;
  previewPending: boolean;
  hasSource: boolean;
  onClearPreview: () => void;
}

export function ImportSourceForm({
  sourceMode,
  onSourceModeChange,
  importUrl,
  onImportUrlChange,
  localPackage,
  onChooseLocalPackage,
  targetMode,
  onTargetModeChange,
  selectedCompanyName,
  newCompanyName,
  onNewCompanyNameChange,
  collisionStrategy,
  onCollisionStrategyChange,
  onPreview,
  previewPending,
  hasSource,
  onClearPreview,
}: ImportSourceFormProps) {
  const packageInputRef = useRef<HTMLInputElement | null>(null);

  const localZipHelpText =
    "Upload a .zip exported directly from Ironworks. Re-zipped archives created by Finder, Explorer, or other zip tools may not import correctly.";

  return (
    <div className="border-b border-border px-5 py-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold">Import source</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Choose a GitHub repo or upload a local Ironworks zip package.
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {(
          [
            { key: "github", icon: Github, label: "GitHub repo" },
            { key: "local", icon: Upload, label: "Local zip" },
          ] as const
        ).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            type="button"
            className={cn(
              "rounded-md border px-3 py-2 text-left text-sm transition-colors",
              sourceMode === key ? "border-foreground bg-accent" : "border-border hover:bg-accent/50",
            )}
            onClick={() => {
              onSourceModeChange(key);
              onClearPreview();
            }}
          >
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4" />
              {label}
            </div>
          </button>
        ))}
      </div>

      {sourceMode === "local" ? (
        <div className="rounded-md border border-dashed border-border px-3 py-3">
          <input
            ref={packageInputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={onChooseLocalPackage}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => packageInputRef.current?.click()}>
              Choose zip
            </Button>
            {localPackage && (
              <span className="text-xs text-muted-foreground">
                {localPackage.name} with {Object.keys(localPackage.files).length} file
                {Object.keys(localPackage.files).length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {!localPackage && <p className="mt-2 text-xs text-muted-foreground">{localZipHelpText}</p>}
        </div>
      ) : (
        <Field
          label="GitHub URL"
          hint="Repo tree path or blob URL to COMPANY.md (e.g. github.com/owner/repo/tree/main/company)."
        >
          <input
            className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
            type="text"
            value={importUrl}
            placeholder="https://github.com/owner/repo/tree/main/company"
            onChange={(e) => {
              onImportUrlChange(e.target.value);
              onClearPreview();
            }}
          />
        </Field>
      )}

      <Field label="Target" hint="Import into this company or create a new one.">
        <select
          className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
          value={targetMode}
          onChange={(e) => {
            onTargetModeChange(e.target.value as "existing" | "new");
            onClearPreview();
          }}
        >
          <option value="new">Create new company</option>
          <option value="existing">Existing company: {selectedCompanyName}</option>
        </select>
      </Field>

      {targetMode === "new" && (
        <Field label="New company name" hint="Optional override. Leave blank to use the package name.">
          <input
            className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
            type="text"
            value={newCompanyName}
            onChange={(e) => onNewCompanyNameChange(e.target.value)}
            placeholder="Imported Company"
          />
        </Field>
      )}

      <Field label="Collision strategy" hint="Board imports can rename, skip, or replace matching company content.">
        <select
          className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
          value={collisionStrategy}
          onChange={(e) => {
            onCollisionStrategyChange(e.target.value as CompanyPortabilityCollisionStrategy);
            onClearPreview();
          }}
        >
          <option value="rename">Rename on conflict</option>
          <option value="skip">Skip on conflict</option>
          <option value="replace">Replace existing</option>
        </select>
      </Field>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onPreview} disabled={previewPending || !hasSource}>
          {previewPending ? "Previewing..." : "Preview import"}
        </Button>
      </div>
    </div>
  );
}
