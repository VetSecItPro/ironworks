import { BookOpen } from "lucide-react";
import { useMemo } from "react";
import type { KnowledgePage } from "../../api/knowledge";
import { cn } from "../../lib/utils";

export function WikiLinkedBody({
  body,
  pages,
  onNavigate,
}: {
  body: string;
  pages: KnowledgePage[];
  onNavigate: (slug: string) => void;
}) {
  const rendered = useMemo(() => {
    // Detect [[Page Title]] patterns
    const wikiLinkPattern = /\[\[([^\]]+)\]\]/g;
    const parts: Array<{ type: "text" | "link"; value: string; slug?: string }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = wikiLinkPattern.exec(body)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: "text", value: body.slice(lastIndex, match.index) });
      }
      const title = match[1];
      const linkedPage = pages.find(
        (p) => p.title.toLowerCase() === title.toLowerCase() || p.slug === title.toLowerCase().replace(/\s+/g, "-"),
      );
      parts.push({
        type: "link",
        value: title,
        slug: linkedPage?.slug,
      });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < body.length) {
      parts.push({ type: "text", value: body.slice(lastIndex) });
    }
    return parts;
  }, [body, pages]);

  // If no wiki links found, just pass through to markdown
  const hasLinks = rendered.some((p) => p.type === "link");
  if (!hasLinks) return null;

  return (
    <div className="flex flex-wrap gap-1 pb-2">
      {rendered
        .filter((p) => p.type === "link")
        .map((p, i) => (
          <button type="button"
            key={i}
            onClick={() => p.slug && onNavigate(p.slug)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
              p.slug
                ? "border-blue-500/20 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 cursor-pointer"
                : "border-border bg-muted/30 text-muted-foreground cursor-default",
            )}
          >
            <BookOpen className="h-3 w-3" />
            {p.value}
            {!p.slug && <span className="text-[10px] opacity-60">(missing)</span>}
          </button>
        ))}
    </div>
  );
}
