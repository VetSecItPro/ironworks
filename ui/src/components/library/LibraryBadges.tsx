import { cn } from "../../lib/utils";
import { DOC_TYPE_COLORS } from "./libraryHelpers";

export function DocTypeBadge({
  documentType,
}: {
  documentType: string | null;
}) {
  if (!documentType || documentType === "folder") return null;
  const label = documentType.replace(/-/g, " ");
  const color =
    DOC_TYPE_COLORS[documentType] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0",
        color,
      )}
    >
      {label}
    </span>
  );
}

export function AutoBadge() {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 bg-muted text-muted-foreground">
      Auto
    </span>
  );
}
