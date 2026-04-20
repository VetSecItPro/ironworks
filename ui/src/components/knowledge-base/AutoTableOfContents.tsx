import { useMemo } from "react";
import { cn } from "../../lib/utils";

export function AutoTableOfContents({ body }: { body: string }) {
  const headings = useMemo(() => {
    const lines = body.split("\n");
    const result: Array<{ level: number; text: string; id: string }> = [];
    for (const line of lines) {
      const match = line.match(/^(#{1,4})\s+(.+)/);
      if (match) {
        const level = match[1].length;
        const text = match[2].replace(/[*_`]/g, "").trim();
        const id = text
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        result.push({ level, text, id });
      }
    }
    return result;
  }, [body]);

  if (headings.length < 3) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/10 p-3 mb-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Table of Contents</p>
      <nav className="space-y-0.5">
        {headings.map((h) => (
          <a
            key={h.id}
            href={`#${h.id}`}
            className={cn(
              "block text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5",
              h.level === 1 && "font-medium text-foreground",
              h.level === 2 && "pl-3",
              h.level === 3 && "pl-6",
              h.level >= 4 && "pl-9 text-[11px]",
            )}
          >
            {h.text}
          </a>
        ))}
      </nav>
    </div>
  );
}
