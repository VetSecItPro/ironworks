import type { Company } from "@ironworksai/shared";
import { ToggleField } from "../agent-config-primitives";

interface HiringSectionProps {
  selectedCompany: Company;
  onToggleApproval: (v: boolean) => void;
}

export function HiringSection({ selectedCompany, onToggleApproval }: HiringSectionProps) {
  return (
    <div id="hiring" className="space-y-4 scroll-mt-6">
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Hiring</h2>
      <div className="rounded-md border border-border px-4 py-3">
        <ToggleField
          label="Require board approval for new hires"
          hint="New agent hires stay pending until approved by board."
          checked={!!selectedCompany.requireBoardApprovalForNewAgents}
          onChange={onToggleApproval}
        />
      </div>
    </div>
  );
}
