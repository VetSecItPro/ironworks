import { cn } from "../../lib/utils";
import { Printer, Download } from "lucide-react";

type BriefingPeriod = "7d" | "30d" | "this_month";
const PERIOD_LABELS: Record<BriefingPeriod, string> = {
  "7d": "This Week",
  "30d": "Last 30 Days",
  "this_month": "This Month",
};

interface BriefingHeaderProps {
  dateStr: string;
  companyName: string;
  period: BriefingPeriod;
  onPeriodChange: (p: BriefingPeriod) => void;
}

export function BriefingHeader({ dateStr, companyName, period, onPeriodChange }: BriefingHeaderProps) {
  return (
    <div className="border-b border-border pb-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Board Briefing</h1>
          <p className="text-sm text-muted-foreground mt-1">{dateStr}</p>
          <p className="text-sm text-muted-foreground">
            Generated for <span className="font-medium text-foreground">{companyName}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors print:hidden"
            onClick={() => window.print()}
            aria-label="Print briefing"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors print:hidden"
            onClick={() => {
              const style = document.createElement("style");
              style.textContent = "@media print { @page { size: A4; margin: 1cm; } }";
              document.head.appendChild(style);
              window.print();
              setTimeout(() => document.head.removeChild(style), 1000);
            }}
            aria-label="Export as PDF"
          >
            <Download className="h-3.5 w-3.5" />
            Export PDF
          </button>
          <div
            className="flex items-center gap-1 border border-border rounded-md overflow-hidden shrink-0 print:hidden"
            role="group"
            aria-label="Briefing period"
          >
            {(["7d", "30d", "this_month"] as const).map((p) => (
              <button
                key={p}
                className={cn(
                  "px-3 py-1.5 text-xs transition-colors",
                  period === p ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => onPeriodChange(p)}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
