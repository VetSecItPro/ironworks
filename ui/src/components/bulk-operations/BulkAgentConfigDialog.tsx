import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings2 } from "lucide-react";

interface BulkAgentConfigProps {
  open: boolean;
  onClose: () => void;
  selectedAgentIds: string[];
  onApply: (agentIds: string[], config: Record<string, unknown>) => void;
}

export function BulkAgentConfigDialog({ open, onClose, selectedAgentIds, onApply }: BulkAgentConfigProps) {
  const [model, setModel] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [autoApproval, setAutoApproval] = useState<"" | "true" | "false">("");

  if (!open) return null;

  function handleApply() {
    const config: Record<string, unknown> = {};
    if (model) config.model = model;
    if (maxTokens) config.maxTokens = Number(maxTokens);
    if (autoApproval) config.autoApproval = autoApproval === "true";
    onApply(selectedAgentIds, config);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <Settings2 className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Bulk Agent Configuration</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Apply settings to {selectedAgentIds.length} selected agent{selectedAgentIds.length !== 1 ? "s" : ""}.
          Only filled fields will be updated.
        </p>

        <div className="space-y-3">
          <div>
            <label htmlFor="bulk-agent-model" className="text-xs font-medium text-muted-foreground">Model</label>
            <Input
              id="bulk-agent-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Leave blank to keep current"
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor="bulk-agent-max-tokens" className="text-xs font-medium text-muted-foreground">Max Tokens</label>
            <Input
              id="bulk-agent-max-tokens"
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              placeholder="Leave blank to keep current"
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor="bulk-agent-auto-approval" className="text-xs font-medium text-muted-foreground">Auto-approval</label>
            <select
              id="bulk-agent-auto-approval"
              value={autoApproval}
              onChange={(e) => setAutoApproval(e.target.value as "" | "true" | "false")}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">No change</option>
              <option value="true">Enable</option>
              <option value="false">Disable</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleApply}>
            Apply to {selectedAgentIds.length} agent{selectedAgentIds.length !== 1 ? "s" : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
