import { CalendarRange } from "lucide-react";
import { useState } from "react";

function getQuarterInfo(): { quarter: number; daysRemaining: number; endDate: Date } | null {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based

  // Quarter boundaries: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec
  const quarterEnd =
    month < 3
      ? new Date(year, 3, 1) // Apr 1
      : month < 6
        ? new Date(year, 6, 1) // Jul 1
        : month < 9
          ? new Date(year, 9, 1) // Oct 1
          : new Date(year + 1, 0, 1); // Jan 1 next year

  const quarter = Math.floor(month / 3) + 1;
  const msRemaining = quarterEnd.getTime() - now.getTime();
  const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

  if (daysRemaining > 14) return null; // Only show in last 2 weeks

  return { quarter, daysRemaining, endDate: quarterEnd };
}

export function QuarterEndBanner({ inProgressCount }: { inProgressCount: number }) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      const val = localStorage.getItem("ironworks:quarter-banner-dismissed");
      if (!val) return false;
      // Auto-reset dismissal if it was for a previous quarter
      const parsed = JSON.parse(val);
      const now = new Date();
      const currentQ = `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
      return parsed === currentQ;
    } catch {
      return false;
    }
  });

  const info = getQuarterInfo();
  if (!info || dismissed) return null;

  const dismiss = () => {
    const now = new Date();
    const currentQ = `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
    try {
      localStorage.setItem("ironworks:quarter-banner-dismissed", JSON.stringify(currentQ));
    } catch {}
    setDismissed(true);
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5">
      <CalendarRange className="h-4 w-4 text-amber-500 shrink-0" />
      <p className="text-xs text-amber-700 dark:text-amber-300 flex-1">
        Q{info.quarter} ends in {info.daysRemaining} day{info.daysRemaining !== 1 ? "s" : ""}.
        {inProgressCount > 0 && (
          <>
            {" "}
            {inProgressCount} goal{inProgressCount !== 1 ? "s are" : " is"} still in progress. Consider reviewing and
            closing out the quarter.
          </>
        )}
      </p>
      <button onClick={dismiss} className="text-xs text-amber-600 dark:text-amber-400 hover:underline shrink-0">
        Dismiss
      </button>
    </div>
  );
}
