import { useState } from "react";
import type { PlaybookSubmitData, StepDraft } from "./playbook-types";
import { emptyStep } from "./playbook-types";
import { ModeChooser } from "./ModeChooser";
import { AutoModeDialog } from "./AutoModeDialog";
import { ManualModeDialog } from "./ManualModeDialog";

interface NewPlaybookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (playbook: PlaybookSubmitData) => void;
  isPending?: boolean;
}

export function NewPlaybookDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: NewPlaybookDialogProps) {
  const [mode, setMode] = useState<"choose" | "manual" | "auto">("choose");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("custom");
  const [steps, setSteps] = useState<StepDraft[]>([emptyStep()]);

  function reset() {
    setMode("choose");
    setName("");
    setDescription("");
    setBody("");
    setCategory("custom");
    setSteps([emptyStep()]);
  }

  function handleClose(isOpen: boolean) {
    if (!isOpen) reset();
    onOpenChange(isOpen);
  }

  function handleSubmit() {
    const parsed = steps
      .filter((s) => s.title.trim())
      .map((s, idx) => ({
        stepOrder: idx + 1,
        title: s.title.trim(),
        instructions: s.instructions.trim(),
        assigneeRole: s.assigneeRole.trim().toLowerCase(),
        dependsOn: s.dependsOn
          .split(",")
          .map((d) => parseInt(d.trim(), 10))
          .filter((n) => !isNaN(n)),
        estimatedMinutes: s.estimatedMinutes ? parseInt(s.estimatedMinutes, 10) || undefined : undefined,
        requiresApproval: s.requiresApproval,
      }));

    const totalMinutes = parsed.reduce((sum, s) => sum + (s.estimatedMinutes ?? 0), 0);

    onSubmit({
      name: name.trim(),
      description: description.trim(),
      body: body.trim(),
      category,
      estimatedMinutes: totalMinutes || undefined,
      steps: parsed,
    });
  }

  if (mode === "choose") {
    return (
      <ModeChooser
        open={open}
        onOpenChange={handleClose}
        onSelectManual={() => setMode("manual")}
        onSelectAuto={() => setMode("auto")}
      />
    );
  }

  if (mode === "auto") {
    return (
      <AutoModeDialog
        open={open}
        onOpenChange={handleClose}
        onBack={() => setMode("choose")}
        onGenerated={(data) => {
          setName(data.name);
          setDescription(data.description);
          setBody(data.body);
          setCategory(data.category);
          if (data.steps.length > 0) setSteps(data.steps);
          setMode("manual");
        }}
      />
    );
  }

  return (
    <ManualModeDialog
      open={open}
      onOpenChange={handleClose}
      name={name}
      setName={setName}
      description={description}
      setDescription={setDescription}
      category={category}
      setCategory={setCategory}
      steps={steps}
      setSteps={setSteps}
      onSubmit={handleSubmit}
      isPending={isPending}
    />
  );
}
