import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "../../lib/utils";

export function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-xs text-muted-foreground shrink-0 w-20">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Renders a Popover on desktop, or an inline collapsible section on mobile (inline mode). */
export function PropertyPicker({
  inline,
  label,
  open,
  onOpenChange,
  triggerContent,
  triggerClassName,
  popoverClassName,
  popoverAlign = "end",
  extra,
  children,
}: {
  inline?: boolean;
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerContent: React.ReactNode;
  triggerClassName?: string;
  popoverClassName?: string;
  popoverAlign?: "start" | "center" | "end";
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const btnCn = cn(
    "inline-flex items-center gap-1.5 cursor-pointer hover:bg-accent/50 rounded px-1 -mx-1 py-0.5 transition-colors",
    triggerClassName,
  );

  if (inline) {
    return (
      <div>
        <PropertyRow label={label}>
          <button type="button" className={btnCn} onClick={() => onOpenChange(!open)}>
            {triggerContent}
          </button>
          {extra}
        </PropertyRow>
        {open && (
          <div className={cn("rounded-md border border-border bg-popover p-1 mb-2", popoverClassName)}>{children}</div>
        )}
      </div>
    );
  }

  return (
    <PropertyRow label={label}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button type="button" className={btnCn}>
            {triggerContent}
          </button>
        </PopoverTrigger>
        <PopoverContent className={cn("p-1", popoverClassName)} align={popoverAlign} collisionPadding={16}>
          {children}
        </PopoverContent>
      </Popover>
      {extra}
    </PropertyRow>
  );
}
