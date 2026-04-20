import { Wand2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../../api/client";
import { useCompany } from "../../context/CompanyContext";
import type { StepDraft } from "./playbook-types";

interface AutoModeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
  onGenerated: (data: {
    name: string;
    description: string;
    body: string;
    category: string;
    steps: StepDraft[];
  }) => void;
}

export function AutoModeDialog({ open, onOpenChange, onBack, onGenerated }: AutoModeDialogProps) {
  const { selectedCompanyId } = useCompany();
  const [autoPrompt, setAutoPrompt] = useState("");
  const [autoGenerating, setAutoGenerating] = useState(false);

  async function handleGenerate() {
    if (!selectedCompanyId) return;
    setAutoGenerating(true);
    try {
      const result = await api.post<{
        name: string;
        description: string;
        body: string;
        category: string;
        steps: Array<{
          stepOrder: number;
          title: string;
          instructions: string;
          assigneeRole: string;
          dependsOn: number[];
          requiresApproval: boolean;
        }>;
      }>(`/companies/${encodeURIComponent(selectedCompanyId)}/ai/generate-playbook`, { prompt: autoPrompt });
      onGenerated({
        name: result.name,
        description: result.description,
        body: result.body,
        category: result.category,
        steps: result.steps.map((s) => ({
          title: s.title,
          instructions: s.instructions,
          assigneeRole: s.assigneeRole,
          dependsOn: s.dependsOn.join(", "),
          estimatedMinutes: "",
          requiresApproval: s.requiresApproval,
        })),
      });
    } catch {
      onGenerated({
        name: "Generated Playbook",
        description: "Edit to customize",
        body: autoPrompt,
        category: "custom",
        steps: [],
      });
    } finally {
      setAutoGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-blue-500" />
            AI-Assisted Playbook
          </DialogTitle>
          <DialogDescription>
            Describe what you want the playbook to accomplish. Be specific about the goal, which roles should be
            involved, and any constraints.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <Textarea
            value={autoPrompt}
            onChange={(e) => setAutoPrompt(e.target.value)}
            placeholder={`Example: "I need a playbook for launching a new SaaS feature. It should include product scoping by the CEO, technical design by the CTO, implementation by engineering, security review, QA, deployment, and a marketing announcement. The whole thing should take about a week."`}
            className="min-h-[160px] text-sm"
          />
          <p className="text-[11px] text-muted-foreground mt-2">
            The AI will generate a complete playbook with steps, role assignments, dependencies, and time estimates. You
            can edit everything after generation.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button onClick={handleGenerate} disabled={!autoPrompt.trim() || autoGenerating}>
            {autoGenerating ? (
              <>
                <Wand2 className="h-3.5 w-3.5 mr-1.5 animate-pulse" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                Generate Playbook
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
