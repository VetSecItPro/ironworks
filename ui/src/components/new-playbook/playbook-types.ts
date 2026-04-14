export const CATEGORIES = [
  { value: "onboarding", label: "Onboarding" },
  { value: "security", label: "Security" },
  { value: "engineering", label: "Engineering" },
  { value: "operations", label: "Operations" },
  { value: "marketing", label: "Marketing" },
  { value: "custom", label: "Custom" },
];

export interface StepDraft {
  title: string;
  instructions: string;
  assigneeRole: string;
  dependsOn: string;
  estimatedMinutes: string;
  requiresApproval: boolean;
}

export function emptyStep(): StepDraft {
  return {
    title: "",
    instructions: "",
    assigneeRole: "",
    dependsOn: "",
    estimatedMinutes: "",
    requiresApproval: false,
  };
}

export interface PlaybookSubmitData {
  name: string;
  description: string;
  body: string;
  category: string;
  estimatedMinutes: number | undefined;
  steps: Array<{
    stepOrder: number;
    title: string;
    instructions: string;
    assigneeRole: string;
    dependsOn: number[];
    estimatedMinutes: number | undefined;
    requiresApproval: boolean;
  }>;
}
