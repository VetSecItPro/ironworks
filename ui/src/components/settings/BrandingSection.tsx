import type { ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "../../context/ToastContext";
import { Field } from "../agent-config-primitives";

interface BrandingSectionProps {
  accentColor: string;
  setAccentColor: (v: string) => void;
  customFavicon: string;
  setCustomFavicon: (v: string) => void;
  removeIronWorksBranding: boolean;
  setRemoveIronWorksBranding: (v: boolean) => void;
}

export function BrandingSection({
  accentColor,
  setAccentColor,
  customFavicon,
  setCustomFavicon,
  removeIronWorksBranding,
  setRemoveIronWorksBranding,
}: BrandingSectionProps) {
  const { pushToast } = useToast();

  function handleFaviconChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    if (file.size > 64 * 1024) {
      pushToast({ title: "Favicon must be under 64KB", tone: "error" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCustomFavicon(reader.result as string);
      pushToast({ title: "Custom favicon applied", tone: "success" });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div id="branding" className="space-y-4 scroll-mt-6">
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Branding</h2>
      <div className="space-y-4 rounded-md border border-border px-4 py-4">
        <Field
          label="Accent color"
          hint="Select an accent color for your company theme. Applied to sidebar indicators and highlights."
        >
          <div className="flex items-center gap-2 flex-wrap">
            {["#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#10b981", "#0ea5e9"].map((color) => (
              <button
                key={color}
                type="button"
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  accentColor === color
                    ? "border-foreground scale-110 shadow-md"
                    : "border-transparent hover:border-muted-foreground/40 hover:scale-105"
                }`}
                style={{ backgroundColor: color }}
                onClick={() => setAccentColor(accentColor === color ? "" : color)}
                aria-label={`Select accent color ${color}`}
              />
            ))}
            {accentColor && (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-muted-foreground"
                onClick={() => setAccentColor("")}
              >
                Clear
              </Button>
            )}
          </div>
          {accentColor && (
            <div className="flex items-center gap-2 mt-2">
              <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: accentColor }} />
              <span className="text-xs font-mono text-muted-foreground">{accentColor}</span>
            </div>
          )}
        </Field>

        <Field
          label="Custom favicon"
          hint="Upload an image to use as the browser tab icon. Stored locally as a data URL."
        >
          <div className="space-y-2">
            <input
              type="file"
              accept="image/png,image/x-icon,image/svg+xml,image/gif"
              onChange={handleFaviconChange}
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none file:mr-4 file:rounded-md file:border-0 file:bg-muted file:px-2.5 file:py-1 file:text-xs"
            />
            {customFavicon && (
              <div className="flex items-center gap-2">
                <img src={customFavicon} alt="Custom favicon" className="w-6 h-6" />
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => {
                    setCustomFavicon("");
                    pushToast({
                      title: "Custom favicon removed",
                      tone: "success",
                    });
                  }}
                >
                  Remove favicon
                </Button>
              </div>
            )}
          </div>
        </Field>

        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Remove IronWorks branding</p>
                <span className="inline-flex items-center rounded-full bg-indigo-500/10 text-indigo-400 px-2 py-0.5 text-[10px] font-semibold">
                  Business
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Hide the IronWorks name and logo from the sidebar footer and login page. Available on the Business tier
                only.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              data-slot="toggle"
              aria-checked={removeIronWorksBranding}
              aria-label={removeIronWorksBranding ? "Disable remove branding" : "Enable remove branding"}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                removeIronWorksBranding ? "bg-foreground" : "bg-muted"
              }`}
              onClick={() => {
                setRemoveIronWorksBranding(!removeIronWorksBranding);
                pushToast({
                  title: !removeIronWorksBranding ? "IronWorks branding hidden" : "IronWorks branding restored",
                  tone: "success",
                });
              }}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-background shadow-sm transition-transform ${
                  removeIronWorksBranding ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
