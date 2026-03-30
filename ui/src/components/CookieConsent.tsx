import { useCallback, useEffect, useState } from "react";
import { Cookie, Settings, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "../lib/utils";

/* ------------------------------------------------------------------ */
/*  Cookie Consent Types & Storage                                     */
/* ------------------------------------------------------------------ */

export interface CookiePreferences {
  necessary: true; // Always on, cannot be toggled
  analytics: boolean;
  preferences: boolean;
  consentedAt: string;
  version: number;
}

const CONSENT_KEY = "ironworks.cookie-consent";
const CONSENT_VERSION = 1;

function getStoredConsent(): CookiePreferences | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CookiePreferences;
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function storeConsent(prefs: CookiePreferences) {
  localStorage.setItem(CONSENT_KEY, JSON.stringify(prefs));
}

export function getCookieConsent(): CookiePreferences | null {
  return getStoredConsent();
}

export function hasAnalyticsConsent(): boolean {
  return getStoredConsent()?.analytics ?? false;
}

/* ------------------------------------------------------------------ */
/*  Cookie Category Toggle                                             */
/* ------------------------------------------------------------------ */

function CategoryToggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <button
        onClick={() => onChange?.(!checked)}
        disabled={disabled}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 mt-0.5 rounded-full transition-colors",
          disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
          checked ? "bg-foreground" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-background transition-transform mt-0.5",
            checked ? "translate-x-4 ml-0.5" : "translate-x-0.5",
          )}
        />
      </button>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          {disabled && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
              Required
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Manage Cookies Dialog                                              */
/* ------------------------------------------------------------------ */

export function ManageCookiesDialog({
  open,
  onOpenChange,
  onSave,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (prefs: CookiePreferences) => void;
  initial?: CookiePreferences | null;
}) {
  const [analytics, setAnalytics] = useState(initial?.analytics ?? false);
  const [preferences, setPreferences] = useState(initial?.preferences ?? false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cookie className="h-4 w-4" />
            Cookie Preferences
          </DialogTitle>
          <DialogDescription>
            Choose which cookies you allow. You can change these settings at any time from the footer.
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y divide-border">
          <CategoryToggle
            label="Strictly Necessary"
            description="Required for the application to function. These cannot be disabled."
            checked={true}
            disabled={true}
          />
          <CategoryToggle
            label="Analytics"
            description="Help us understand how you use Ironworks so we can improve the product. No personal data is shared with third parties."
            checked={analytics}
            onChange={setAnalytics}
          />
          <CategoryToggle
            label="Preferences"
            description="Remember your settings like theme, sidebar state, and display preferences across sessions."
            checked={preferences}
            onChange={setPreferences}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const prefs: CookiePreferences = {
                necessary: true,
                analytics,
                preferences,
                consentedAt: new Date().toISOString(),
                version: CONSENT_VERSION,
              };
              onSave(prefs);
              onOpenChange(false);
            }}
          >
            Save Preferences
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Cookie Consent Banner                                              */
/* ------------------------------------------------------------------ */

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  useEffect(() => {
    const existing = getStoredConsent();
    if (!existing) {
      // Small delay so the app loads first
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAcceptAll = useCallback(() => {
    const prefs: CookiePreferences = {
      necessary: true,
      analytics: true,
      preferences: true,
      consentedAt: new Date().toISOString(),
      version: CONSENT_VERSION,
    };
    storeConsent(prefs);
    setVisible(false);
  }, []);

  const handleRejectOptional = useCallback(() => {
    const prefs: CookiePreferences = {
      necessary: true,
      analytics: false,
      preferences: false,
      consentedAt: new Date().toISOString(),
      version: CONSENT_VERSION,
    };
    storeConsent(prefs);
    setVisible(false);
  }, []);

  const handleSaveCustom = useCallback((prefs: CookiePreferences) => {
    storeConsent(prefs);
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background border-t border-border shadow-lg">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-start gap-3 flex-1">
            <Shield className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">We respect your privacy</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ironworks uses cookies to ensure the application works properly. Optional cookies help us improve your experience.
                Read our <a href="/privacy" className="underline hover:text-foreground">Privacy Policy</a>.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setManageOpen(true)}
            >
              <Settings className="h-3.5 w-3.5 mr-1.5" />
              Manage
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRejectOptional}
            >
              Reject Optional
            </Button>
            <Button
              size="sm"
              onClick={handleAcceptAll}
            >
              Accept All
            </Button>
          </div>
        </div>
      </div>

      <ManageCookiesDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        onSave={handleSaveCustom}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Footer Cookie Link (for managing after consent)                    */
/* ------------------------------------------------------------------ */

export function CookieSettingsLink() {
  const [manageOpen, setManageOpen] = useState(false);
  const existing = getStoredConsent();

  return (
    <>
      <button
        onClick={() => setManageOpen(true)}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Cookie Settings
      </button>
      <ManageCookiesDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        initial={existing}
        onSave={(prefs) => {
          storeConsent(prefs);
          setManageOpen(false);
        }}
      />
    </>
  );
}
