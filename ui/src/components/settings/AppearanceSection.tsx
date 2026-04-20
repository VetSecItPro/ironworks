import type { Company } from "@ironworksai/shared";
import type { ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "../agent-config-primitives";
import { CompanyPatternIcon } from "../CompanyPatternIcon";

interface AppearanceSectionProps {
  selectedCompany: Company;
  companyName: string;
  brandColor: string;
  setBrandColor: (v: string) => void;
  logoUrl: string;
  logoUploadError: string | null;
  isUploadPending: boolean;
  isUploadError: boolean;
  uploadError: Error | null;
  isClearPending: boolean;
  isClearError: boolean;
  clearError: Error | null;
  onLogoFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onClearLogo: () => void;
}

export function AppearanceSection({
  selectedCompany,
  companyName,
  brandColor,
  setBrandColor,
  logoUrl,
  logoUploadError,
  isUploadPending,
  isUploadError,
  uploadError,
  isClearPending,
  isClearError,
  clearError,
  onLogoFileChange,
  onClearLogo,
}: AppearanceSectionProps) {
  return (
    <div id="appearance" className="space-y-4 scroll-mt-6">
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Appearance</h2>
      <div className="space-y-3 rounded-md border border-border px-4 py-4">
        <div className="flex items-start gap-4">
          <div className="shrink-0">
            <CompanyPatternIcon
              companyName={companyName || selectedCompany.name}
              logoUrl={logoUrl || null}
              brandColor={brandColor || null}
              className="rounded-[14px]"
            />
          </div>
          <div className="flex-1 space-y-3">
            <Field label="Logo" hint="Upload a PNG, JPEG, WEBP, GIF, or SVG logo image.">
              <div className="space-y-2">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  onChange={onLogoFileChange}
                  className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none file:mr-4 file:rounded-md file:border-0 file:bg-muted file:px-2.5 file:py-1 file:text-xs"
                />
                {logoUrl && (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={onClearLogo} disabled={isClearPending}>
                      {isClearPending ? "Removing..." : "Remove logo"}
                    </Button>
                  </div>
                )}
                {(isUploadError || logoUploadError) && (
                  <span className="text-xs text-destructive">
                    {logoUploadError ?? (uploadError instanceof Error ? uploadError.message : "Logo upload failed")}
                  </span>
                )}
                {isClearError && <span className="text-xs text-destructive">{clearError?.message}</span>}
                {isUploadPending && <span className="text-xs text-muted-foreground">Uploading logo...</span>}
              </div>
            </Field>
            <Field label="Brand color" hint="Sets the hue for the company icon. Leave empty for auto-generated color.">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={brandColor || "#6366f1"}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
                />
                <input
                  type="text"
                  value={brandColor}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^#[0-9a-fA-F]{0,6}$/.test(v)) {
                      setBrandColor(v);
                    }
                  }}
                  placeholder="Auto"
                  className="w-28 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm font-mono outline-none"
                />
                {brandColor && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setBrandColor("")}
                    className="text-xs text-muted-foreground"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </Field>
          </div>
        </div>
      </div>
    </div>
  );
}
