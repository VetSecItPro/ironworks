import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Building2, Users, Briefcase, ChevronRight, Check } from "lucide-react";
import { cn } from "../lib/utils";

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const WIZARD_KEY = "ironworks:first-login-wizard";

export interface FirstLoginData {
  companyName: string;
  industry: string;
  teamSize: string;
}

export function hasCompletedFirstLogin(): boolean {
  try {
    return localStorage.getItem(WIZARD_KEY) !== null;
  } catch {
    return false;
  }
}

export function getFirstLoginData(): FirstLoginData | null {
  try {
    const raw = localStorage.getItem(WIZARD_KEY);
    if (raw) return JSON.parse(raw) as FirstLoginData;
  } catch {
    // ignore
  }
  return null;
}

function saveFirstLoginData(data: FirstLoginData) {
  try {
    localStorage.setItem(WIZARD_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INDUSTRIES = [
  "Software Development",
  "DevOps / SRE",
  "Data Science / ML",
  "Cybersecurity",
  "IT Consulting",
  "Marketing / Agency",
  "Finance / Fintech",
  "Healthcare",
  "E-commerce",
  "Education",
  "Other",
];

const TEAM_SIZES = [
  { value: "solo", label: "Just me", description: "Solo developer or founder" },
  { value: "small", label: "2-10", description: "Small team" },
  { value: "medium", label: "11-50", description: "Growing team" },
  { value: "large", label: "51-200", description: "Department-level" },
  { value: "enterprise", label: "200+", description: "Enterprise" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface FirstLoginWizardProps {
  open: boolean;
  onComplete: (data: FirstLoginData) => void;
}

export function FirstLoginWizard({ open, onComplete }: FirstLoginWizardProps) {
  const [step, setStep] = useState(0);
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [teamSize, setTeamSize] = useState("");

  if (!open) return null;

  function handleFinish() {
    const data: FirstLoginData = { companyName, industry, teamSize };
    saveFirstLoginData(data);
    onComplete(data);
  }

  const steps = [
    // Step 0: Company name
    <div key="company" className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">What is your company or team name?</h3>
          <p className="text-xs text-muted-foreground">We will use this to personalize your workspace</p>
        </div>
      </div>
      <Input
        value={companyName}
        onChange={(e) => setCompanyName(e.target.value)}
        placeholder="e.g. Acme Corp, My Dev Team"
        autoFocus
        className="h-10"
      />
    </div>,

    // Step 1: Industry
    <div key="industry" className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Briefcase className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">What industry are you in?</h3>
          <p className="text-xs text-muted-foreground">This helps us suggest relevant templates and workflows</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {INDUSTRIES.map((ind) => (
          <button
            key={ind}
            type="button"
            onClick={() => setIndustry(ind)}
            className={cn(
              "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
              industry === ind
                ? "border-primary bg-primary/5 font-medium"
                : "border-border hover:border-primary/40 hover:bg-accent/50",
            )}
          >
            {ind}
          </button>
        ))}
      </div>
    </div>,

    // Step 2: Team size
    <div key="team" className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">How large is your team?</h3>
          <p className="text-xs text-muted-foreground">We will adjust default views and features accordingly</p>
        </div>
      </div>
      <div className="space-y-2">
        {TEAM_SIZES.map((size) => (
          <button
            key={size.value}
            type="button"
            onClick={() => setTeamSize(size.value)}
            className={cn(
              "flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors",
              teamSize === size.value
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40 hover:bg-accent/50",
            )}
          >
            <div>
              <div className="text-sm font-medium">{size.label}</div>
              <div className="text-xs text-muted-foreground">{size.description}</div>
            </div>
            {teamSize === size.value && (
              <Check className="h-4 w-4 text-primary shrink-0" />
            )}
          </button>
        ))}
      </div>
    </div>,
  ];

  const canProceed =
    (step === 0 && companyName.trim().length > 0) ||
    (step === 1 && industry.length > 0) ||
    (step === 2 && teamSize.length > 0);

  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl animate-in fade-in-0 zoom-in-95">
        {/* Progress bar */}
        <div className="flex items-center gap-1 mb-6">
          {steps.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-300",
                i <= step ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </div>

        {/* Current step */}
        {steps[step]}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className={cn(
              "text-xs text-muted-foreground hover:text-foreground transition-colors",
              step === 0 && "invisible",
            )}
          >
            Back
          </button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleFinish}
              className="text-xs text-muted-foreground"
            >
              Skip
            </Button>
            <Button
              size="sm"
              disabled={!canProceed}
              onClick={isLast ? handleFinish : () => setStep((s) => s + 1)}
            >
              {isLast ? (
                <>
                  Get Started
                  <Check className="h-3 w-3 ml-1" />
                </>
              ) : (
                <>
                  Continue
                  <ChevronRight className="h-3 w-3 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
