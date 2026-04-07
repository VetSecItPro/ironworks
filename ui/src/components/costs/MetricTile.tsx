import type { ComponentType } from "react";
import { cn } from "../../lib/utils";

export function MetricTile({
  label,
  value,
  subtitle,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  onClick?: () => void;
}) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      className={cn(
        "border border-border p-4 text-left transition-colors",
        onClick && "cursor-pointer hover:bg-accent/50 hover:border-foreground/20",
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
          <div className="mt-1 text-sm leading-5 text-muted-foreground">{subtitle}</div>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-border">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </Wrapper>
  );
}
