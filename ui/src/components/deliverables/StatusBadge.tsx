import { cn } from "../../lib/utils";
import { STATUS_CONFIG } from "./deliverableHelpers";

export function StatusBadge({ status }: { status: string | null }) {
  const cfg = STATUS_CONFIG[status ?? "draft"] ?? STATUS_CONFIG.draft;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", cfg.className)}>
      {cfg.label}
    </span>
  );
}
