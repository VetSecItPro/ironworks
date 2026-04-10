import { Users, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type EmploymentType = "full_time" | "contractor";

interface HireStepTypeProps {
  employmentType: EmploymentType | null;
  onSelect: (type: EmploymentType) => void;
}

export function HireStepType({ employmentType, onSelect }: HireStepTypeProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        className={cn(
          "flex flex-col items-center gap-3 rounded-md border border-border p-5 text-sm transition-colors hover:bg-accent/50",
          employmentType === "full_time" && "border-foreground bg-accent/30",
        )}
        onClick={() => onSelect("full_time")}
      >
        <Users className="h-8 w-8 text-blue-500" />
        <span className="font-medium">Full-Time Employee</span>
        <span className="text-xs text-muted-foreground text-center">
          Permanent team member. Accumulates institutional knowledge. Grows with the company.
        </span>
      </button>
      <button
        className={cn(
          "flex flex-col items-center gap-3 rounded-md border border-border p-5 text-sm transition-colors hover:bg-accent/50",
          employmentType === "contractor" && "border-foreground bg-accent/30",
        )}
        onClick={() => onSelect("contractor")}
      >
        <Clock className="h-8 w-8 text-amber-500" />
        <span className="font-medium">Contractor</span>
        <span className="text-xs text-muted-foreground text-center">
          Project-scoped. Auto-terminates when the engagement ends. Fast onboarding with context packet.
        </span>
      </button>
    </div>
  );
}
