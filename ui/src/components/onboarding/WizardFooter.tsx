import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Loader2, Rocket } from "lucide-react";
import type { Step } from "./types";

interface WizardFooterProps {
  step: Step;
  loading: boolean;
  initialStep: Step;
  // Step 1
  companyNameValid: boolean;
  onStep1Next: () => void;
  // Step 2
  llmApiKeyValid: boolean;
  onStep2LlmNext: () => void;
  onSkipLlm: () => void;
  // Step 3
  step2Mode: "pack" | "manual";
  agentNameValid: boolean;
  adapterEnvLoading: boolean;
  onStep2Next: () => void;
  selectedPackKey: string | null;
  rosterItemsCount: number;
  packCreating: boolean;
  onPackDeploy: () => void;
  // Step 4
  taskTitleValid: boolean;
  onStep3Next: () => void;
  // Step 5
  onLaunch: () => void;
  // Navigation
  onBack: () => void;
}

export function WizardFooter({
  step,
  loading,
  initialStep,
  companyNameValid,
  onStep1Next,
  llmApiKeyValid,
  onStep2LlmNext,
  onSkipLlm,
  step2Mode,
  agentNameValid,
  adapterEnvLoading,
  onStep2Next,
  selectedPackKey,
  rosterItemsCount,
  packCreating,
  onPackDeploy,
  taskTitleValid,
  onStep3Next,
  onLaunch,
  onBack,
}: WizardFooterProps) {
  return (
    <div className="flex items-center justify-between mt-8">
      <div>
        {step > 1 && step > initialStep && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            disabled={loading}
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Back
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {step === 1 && (
          <Button
            size="sm"
            disabled={!companyNameValid || loading}
            onClick={onStep1Next}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5 mr-1" />
            )}
            {loading ? "Creating..." : "Next"}
          </Button>
        )}
        {step === 2 && (
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end gap-0.5">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={onSkipLlm}
              >
                Skip for now
              </button>
              <span className="text-[10px] text-muted-foreground/70 max-w-[200px] text-right">
                You can add this later, but agents can't run without it
              </span>
            </div>
            <Button
              size="sm"
              disabled={!llmApiKeyValid || loading}
              onClick={onStep2LlmNext}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <ArrowRight className="h-3.5 w-3.5 mr-1" />
              )}
              {loading ? "Saving..." : "Next"}
            </Button>
          </div>
        )}
        {step === 3 && step2Mode === "manual" && (
          <Button
            size="sm"
            disabled={
              !agentNameValid || loading || adapterEnvLoading
            }
            onClick={onStep2Next}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5 mr-1" />
            )}
            {loading ? "Creating..." : "Next"}
          </Button>
        )}
        {step === 3 && step2Mode === "pack" && (
          <Button
            size="sm"
            disabled={!selectedPackKey || rosterItemsCount === 0 || packCreating}
            onClick={onPackDeploy}
          >
            {packCreating ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Rocket className="h-3.5 w-3.5 mr-1" />
            )}
            {packCreating ? `Deploying team...` : "Deploy Team"}
          </Button>
        )}
        {step === 4 && (
          <Button
            size="sm"
            disabled={!taskTitleValid || loading}
            onClick={onStep3Next}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5 mr-1" />
            )}
            {loading ? "Creating..." : "Next"}
          </Button>
        )}
        {step === 5 && (
          <Button size="sm" disabled={loading} onClick={onLaunch}>
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5 mr-1" />
            )}
            {loading ? "Creating..." : "Create & Open Issue"}
          </Button>
        )}
      </div>
    </div>
  );
}
