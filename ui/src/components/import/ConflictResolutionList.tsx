import { ArrowRight, Check } from "lucide-react";
import { cn } from "../../lib/utils";
import type { ConflictItem } from "./ImportHelpers";

export function ConflictResolutionList({
  conflicts,
  nameOverrides,
  skippedSlugs,
  confirmedSlugs,
  onRename,
  onToggleSkip,
  onToggleConfirm,
}: {
  conflicts: ConflictItem[];
  nameOverrides: Record<string, string>;
  skippedSlugs: Set<string>;
  confirmedSlugs: Set<string>;
  onRename: (slug: string, newName: string) => void;
  onToggleSkip: (slug: string, filePath: string | null) => void;
  onToggleConfirm: (slug: string) => void;
}) {
  if (conflicts.length === 0) return null;

  return (
    <div className="mx-5 mt-3">
      <div className="rounded-md border border-border">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <h3 className="text-sm font-medium">Renames</h3>
          <span className="text-xs text-muted-foreground">
            {conflicts.length} item{conflicts.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="divide-y divide-border">
          {conflicts.map((item) => {
            const isSkipped = skippedSlugs.has(item.slug);
            const isConfirmed = confirmedSlugs.has(item.slug);
            const currentName = nameOverrides[item.slug] ?? item.plannedName;
            return (
              <div
                key={item.slug}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 text-sm",
                  isSkipped && "opacity-40",
                  isConfirmed && !isSkipped && "bg-emerald-500/5",
                )}
              >
                <button
                  type="button"
                  className={cn(
                    "shrink-0 rounded-md border px-2.5 py-1 text-xs transition-colors",
                    isSkipped
                      ? "border-foreground bg-accent text-foreground"
                      : "border-border text-muted-foreground hover:bg-accent/50",
                  )}
                  onClick={() => onToggleSkip(item.slug, item.filePath)}
                >
                  {isSkipped ? "skipped" : "skip"}
                </button>

                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide",
                    isSkipped
                      ? "text-muted-foreground border-border"
                      : isConfirmed
                        ? "text-emerald-500 border-emerald-500/30"
                        : "text-amber-500 border-amber-500/30",
                  )}
                >
                  {item.kind}
                </span>

                <span
                  className={cn(
                    "shrink-0 font-mono text-xs",
                    isSkipped ? "text-muted-foreground line-through" : "text-muted-foreground",
                  )}
                >
                  {item.originalName}
                </span>

                {!isSkipped && (
                  <>
                    <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                    {isConfirmed ? (
                      <span className="min-w-0 flex-1 font-mono text-xs text-emerald-500">{currentName}</span>
                    ) : (
                      <input
                        className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 py-1 font-mono text-xs outline-none focus:border-foreground"
                        value={currentName}
                        onChange={(e) => onRename(item.slug, e.target.value)}
                      />
                    )}
                  </>
                )}

                {!isSkipped && (
                  <button
                    type="button"
                    className={cn(
                      "ml-auto shrink-0 rounded-md border px-2.5 py-1 text-xs transition-colors inline-flex items-center gap-1.5",
                      isConfirmed
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                        : "border-border text-muted-foreground hover:bg-accent/50",
                    )}
                    onClick={() => onToggleConfirm(item.slug)}
                  >
                    {isConfirmed ? (
                      <>
                        <Check className="h-3 w-3" />
                        confirmed
                      </>
                    ) : (
                      "confirm rename"
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
