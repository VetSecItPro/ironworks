import { formatDate } from "../../lib/utils";

export interface MockInvoice {
  id: string;
  date: string;
  amount: number; // cents
  status: "paid" | "pending" | "failed";
}

export const MOCK_INVOICES: MockInvoice[] = [
  { id: "INV-2026-004", date: "2026-04-01", amount: 19900, status: "pending" },
  { id: "INV-2026-003", date: "2026-03-01", amount: 19900, status: "paid" },
  { id: "INV-2026-002", date: "2026-02-01", amount: 19900, status: "paid" },
  { id: "INV-2026-001", date: "2026-01-01", amount: 7900, status: "paid" },
  { id: "INV-2025-012", date: "2025-12-01", amount: 7900, status: "paid" },
  { id: "INV-2025-011", date: "2025-11-01", amount: 7900, status: "paid" },
];

export function InvoiceStatusBadge({ status }: { status: MockInvoice["status"] }) {
  const styles: Record<string, string> = {
    paid: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded capitalize ${styles[status]}`}>
      {status}
    </span>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function formatBillingDate(iso: string | null): string {
  if (!iso) return "--";
  return formatDate(iso);
}

export function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    past_due: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    cancelled: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
    incomplete: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  };
  const cls = colorMap[status] ?? colorMap.incomplete;
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded capitalize ${cls}`}>
      {status.replace("_", " ")}
    </span>
  );
}

export function UsageMeter({
  label,
  current,
  limit,
  isUnlimited,
  percent,
}: {
  label: string;
  current: string | number;
  limit: string;
  isUnlimited: boolean;
  percent: number;
}) {
  const clampedPercent = Math.min(percent, 100);
  const isHigh = percent >= 80;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {current} / {isUnlimited ? "Unlimited" : limit}
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isHigh ? "bg-amber-500" : "bg-primary"}`}
          style={{ width: isUnlimited ? "0%" : `${clampedPercent}%` }}
        />
      </div>
    </div>
  );
}

export function UsageProjection({
  label,
  current,
  limit,
  growthPerMonth,
  unit,
}: {
  label: string;
  current: number;
  limit: number;
  growthPerMonth: number;
  unit?: string;
}) {
  if (growthPerMonth <= 0 || current >= limit) return null;
  const remaining = limit - current;
  const monthsUntilLimit = Math.ceil(remaining / growthPerMonth);
  const upgradeDate = new Date();
  upgradeDate.setMonth(upgradeDate.getMonth() + monthsUntilLimit);
  const formattedDate = upgradeDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const urgency =
    monthsUntilLimit <= 1
      ? "text-red-600 dark:text-red-400"
      : monthsUntilLimit <= 3
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground";

  return (
    <div className="flex items-start gap-2 text-sm">
      <TrendingUpIcon className={`h-4 w-4 shrink-0 mt-0.5 ${urgency}`} />
      <div>
        <span className="font-medium">{label}:</span>{" "}
        <span className={urgency}>
          At current usage (~{growthPerMonth.toFixed(unit ? 1 : 0)}
          {unit ? ` ${unit}` : ""}/mo), you will reach your limit by <strong>{formattedDate}</strong>.
        </span>
        {monthsUntilLimit <= 2 && <span className="text-xs text-muted-foreground ml-1">Consider upgrading soon.</span>}
      </div>
    </div>
  );
}

import { TrendingUp as TrendingUpIcon } from "lucide-react";
