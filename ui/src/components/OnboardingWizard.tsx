import { X } from "lucide-react";
import { Dialog, DialogPortal } from "@/components/ui/dialog";
import { cn } from "../lib/utils";
import { AsciiArtAnimation } from "./AsciiArtAnimation";
import type { Step } from "./onboarding";
import {
  ProgressTabs,
  StepAgent,
  StepCompany,
  StepLaunch,
  StepLlmProvider,
  StepTask,
  WizardFooter,
} from "./onboarding";
import { useWizardState } from "./onboarding/useWizardState";

export function OnboardingWizard() {
  const w = useWizardState();

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (w.step === 1 && w.companyName.trim()) w.handleStep1Next();
      else if (w.step === 2 && w.llmApiKey.trim()) w.handleStep2LlmNext();
      else if (w.step === 3 && w.step2Mode === "pack" && w.selectedPackKey) w.handlePackDeploy();
      else if (w.step === 3 && w.step2Mode === "manual" && w.agentName.trim()) w.handleStep2Next();
      else if (w.step === 4 && w.taskTitle.trim()) w.handleStep3Next();
      else if (w.step === 5) w.handleLaunch();
    }
  }

  if (!w.effectiveOnboardingOpen) return null;

  return (
    <Dialog
      open={w.effectiveOnboardingOpen}
      onOpenChange={(open) => {
        if (!open) {
          w.setRouteDismissed(true);
          w.handleClose();
        }
      }}
    >
      <DialogPortal>
        <div className="fixed inset-0 z-50 bg-background" />
        <div className="fixed inset-0 z-50 flex" onKeyDown={handleKeyDown}>
          <button
            onClick={w.handleClose}
            className="absolute top-4 left-4 z-10 rounded-sm p-1.5 text-muted-foreground/80 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </button>

          <div
            className={cn(
              "w-full flex flex-col overflow-y-auto transition-[width] duration-500 ease-in-out",
              w.step === 1 ? "md:w-1/2" : "md:w-full",
            )}
          >
            <div className="w-full max-w-2xl mx-auto my-auto px-10 py-12 shrink-0">
              <ProgressTabs currentStep={w.step} onStepClick={w.setStep} />

              {w.step === 1 && (
                <StepCompany
                  companyName={w.companyName}
                  companyGoal={w.companyGoal}
                  onCompanyNameChange={w.setCompanyName}
                  onCompanyGoalChange={w.setCompanyGoal}
                />
              )}

              {w.step === 2 && (
                <StepLlmProvider
                  llmProvider={w.llmProvider}
                  llmApiKey={w.llmApiKey}
                  llmSaved={w.llmSaved}
                  error={w.error}
                  onProviderChange={w.setLlmProvider}
                  onApiKeyChange={w.setLlmApiKey}
                  onErrorClear={() => w.setError(null)}
                />
              )}

              {w.step === 3 && (
                <StepAgent
                  step2Mode={w.step2Mode}
                  onStep2ModeChange={w.setStep2Mode}
                  teamPacks={w.teamPacks}
                  selectedPackKey={w.selectedPackKey}
                  onSelectedPackKeyChange={w.setSelectedPackKey}
                  rosterItems={w.rosterItems}
                  onRosterItemsChange={w.setRosterItems}
                  packCreating={w.packCreating}
                  packProgress={w.packProgress}
                  agentName={w.agentName}
                  onAgentNameChange={w.setAgentName}
                  adapterType={w.adapterType}
                  onAdapterTypeChange={w.setAdapterType}
                  model={w.model}
                  onModelChange={w.setModel}
                  url={w.url}
                  onUrlChange={w.setUrl}
                  showMoreAdapters={w.showMoreAdapters}
                  onShowMoreAdaptersChange={w.setShowMoreAdapters}
                  modelOpen={w.modelOpen}
                  onModelOpenChange={w.setModelOpen}
                  modelSearch={w.modelSearch}
                  onModelSearchChange={w.setModelSearch}
                  adapterModels={w.adapterModels}
                  isLocalAdapter={w.isLocalAdapter}
                  effectiveAdapterCommand={w.effectiveAdapterCommand}
                  adapterEnvResult={w.adapterEnvResult}
                  adapterEnvError={w.adapterEnvError}
                  adapterEnvLoading={w.adapterEnvLoading}
                  onRunAdapterEnvTest={() => void w.runAdapterEnvironmentTest()}
                  shouldSuggestUnsetAnthropicApiKey={w.shouldSuggestUnsetAnthropicApiKey}
                  unsetAnthropicLoading={w.unsetAnthropicLoading}
                  onUnsetAnthropicApiKey={() => void w.handleUnsetAnthropicApiKey()}
                />
              )}

              {w.step === 4 && (
                <StepTask
                  taskTitle={w.taskTitle}
                  taskDescription={w.taskDescription}
                  extraTasks={w.extraTasks}
                  onTaskTitleChange={w.setTaskTitle}
                  onTaskDescriptionChange={w.setTaskDescription}
                  onExtraTasksChange={w.setExtraTasks}
                />
              )}

              {w.step === 5 && (
                <StepLaunch
                  companyName={w.companyName}
                  llmProvider={w.llmProvider}
                  llmSaved={w.llmSaved}
                  agentName={w.agentName}
                  adapterType={w.adapterType}
                  taskTitle={w.taskTitle}
                  onStepClick={w.setStep}
                />
              )}

              {w.error && (
                <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 space-y-2">
                  <p className="text-xs text-destructive">{w.error}</p>
                  <button
                    type="button"
                    className="text-xs font-medium text-destructive hover:text-destructive/80 underline underline-offset-2 transition-colors"
                    onClick={() => {
                      w.setError(null);
                      if (w.step === 1 && w.companyName.trim()) void w.handleStep1Next();
                      else if (w.step === 2 && w.llmApiKey.trim()) void w.handleStep2LlmNext();
                      else if (w.step === 3 && w.step2Mode === "pack" && w.selectedPackKey) void w.handlePackDeploy();
                      else if (w.step === 3 && w.step2Mode === "manual" && w.agentName.trim()) void w.handleStep2Next();
                      else if (w.step === 5) void w.handleLaunch();
                    }}
                  >
                    Retry
                  </button>
                </div>
              )}

              <WizardFooter
                step={w.step}
                loading={w.loading}
                initialStep={w.initialStep}
                companyNameValid={!!w.companyName.trim()}
                onStep1Next={() => void w.handleStep1Next()}
                llmApiKeyValid={!!w.llmApiKey.trim()}
                onStep2LlmNext={() => void w.handleStep2LlmNext()}
                onSkipLlm={() => w.setStep(3)}
                step2Mode={w.step2Mode}
                agentNameValid={!!w.agentName.trim()}
                adapterEnvLoading={w.adapterEnvLoading}
                onStep2Next={() => void w.handleStep2Next()}
                selectedPackKey={w.selectedPackKey}
                rosterItemsCount={w.rosterItems.length}
                packCreating={w.packCreating}
                onPackDeploy={() => void w.handlePackDeploy()}
                taskTitleValid={!!w.taskTitle.trim()}
                onStep3Next={() => void w.handleStep3Next()}
                onLaunch={() => void w.handleLaunch()}
                onBack={() => w.setStep((w.step - 1) as Step)}
              />
            </div>
          </div>

          <div
            className={cn(
              "hidden md:block overflow-hidden bg-[#1d1d1d] transition-[width,opacity] duration-500 ease-in-out",
              w.step === 1 ? "w-1/2 opacity-100" : "w-0 opacity-0",
            )}
          >
            <AsciiArtAnimation />
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}
