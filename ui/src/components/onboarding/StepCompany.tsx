import { Building2 } from "lucide-react";
import { cn } from "../../lib/utils";

interface StepCompanyProps {
  companyName: string;
  companyGoal: string;
  onCompanyNameChange: (value: string) => void;
  onCompanyGoalChange: (value: string) => void;
}

export function StepCompany({ companyName, companyGoal, onCompanyNameChange, onCompanyGoalChange }: StepCompanyProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-1">
        <div className="bg-muted/50 p-2.5 rounded-lg">
          <Building2 className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Name your company</h2>
          <p className="text-sm text-muted-foreground">This is the organization your agents will work for.</p>
        </div>
      </div>
      <div className="mt-3 group">
        <label
          className={cn(
            "text-xs mb-1 block transition-colors",
            companyName.trim() ? "text-foreground" : "text-muted-foreground group-focus-within:text-foreground",
          )}
        >
          Company name
        </label>
        <input
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 placeholder:text-muted-foreground/70"
          placeholder="e.g., Acme Corp"
          value={companyName}
          onChange={(e) => onCompanyNameChange(e.target.value)}
        />
        {companyName.trim().length > 0 && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Your issues will be{" "}
            <span className="font-mono font-medium text-foreground/80">
              {companyName
                .trim()
                .substring(0, 4)
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")}
              -1
            </span>
            ,{" "}
            <span className="font-mono font-medium text-foreground/80">
              {companyName
                .trim()
                .substring(0, 4)
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")}
              -2
            </span>
            ...
          </p>
        )}
      </div>
      <div className="group">
        <label
          className={cn(
            "text-xs mb-1 block transition-colors",
            companyGoal.trim() ? "text-foreground" : "text-muted-foreground group-focus-within:text-foreground",
          )}
        >
          Mission / goal (optional)
        </label>
        <textarea
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 placeholder:text-muted-foreground/70 resize-none min-h-[60px]"
          placeholder="What is this company trying to achieve?"
          value={companyGoal}
          onChange={(e) => onCompanyGoalChange(e.target.value)}
        />
      </div>
    </div>
  );
}
