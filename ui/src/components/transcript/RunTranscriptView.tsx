import { useMemo } from "react";
import type { TranscriptEntry } from "../../adapters";
import { cn } from "../../lib/utils";
import type { TranscriptMode, TranscriptDensity } from "./transcript-utils";
import { normalizeTranscript, formatRawEntry, formatToolPayload } from "./transcript-utils";
import {
  TranscriptMessageBlock,
  TranscriptThinkingBlock,
  TranscriptToolCard,
  TranscriptCommandGroup,
  TranscriptStdoutRow,
  TranscriptActivityRow,
  TranscriptEventRow,
} from "./TranscriptBlocks";

// Re-export types so existing consumers keep working
export type { TranscriptMode, TranscriptDensity };
export { normalizeTranscript };

interface RunTranscriptViewProps {
  entries: TranscriptEntry[];
  mode?: TranscriptMode;
  density?: TranscriptDensity;
  limit?: number;
  streaming?: boolean;
  collapseStdout?: boolean;
  emptyMessage?: string;
  className?: string;
  thinkingClassName?: string;
}

function RawTranscriptView({
  entries,
  density,
}: {
  entries: TranscriptEntry[];
  density: TranscriptDensity;
}) {
  const compact = density === "compact";
  return (
    <div className={cn("font-mono", compact ? "space-y-1 text-[11px]" : "space-y-1.5 text-xs")}>
      {entries.map((entry, idx) => (
        <div
          key={`${entry.kind}-${entry.ts}-${idx}`}
          className={cn(
            "grid gap-x-3",
            "grid-cols-[auto_1fr]",
          )}
        >
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {entry.kind}
          </span>
          <pre className="min-w-0 whitespace-pre-wrap break-words text-foreground/80">
            {formatRawEntry(entry)}
          </pre>
        </div>
      ))}
    </div>
  );
}

export function RunTranscriptView({
  entries,
  mode = "nice",
  density = "comfortable",
  limit,
  streaming = false,
  collapseStdout = false,
  emptyMessage = "No transcript yet.",
  className,
  thinkingClassName,
}: RunTranscriptViewProps) {
  const blocks = useMemo(() => normalizeTranscript(entries, streaming), [entries, streaming]);
  const visibleBlocks = limit ? blocks.slice(-limit) : blocks;
  const visibleEntries = limit ? entries.slice(-limit) : entries;

  if (entries.length === 0) {
    return (
      <div className={cn("rounded-2xl border border-dashed border-border/70 bg-background/40 p-4 text-sm text-muted-foreground", className)}>
        {emptyMessage}
      </div>
    );
  }

  if (mode === "raw") {
    return (
      <div className={className}>
        <RawTranscriptView entries={visibleEntries} density={density} />
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {visibleBlocks.map((block, index) => (
        <div
          key={`${block.type}-${block.ts}-${index}`}
          className={cn(index === visibleBlocks.length - 1 && streaming && "animate-in fade-in slide-in-from-bottom-1 duration-300")}
        >
          {block.type === "message" && <TranscriptMessageBlock block={block} density={density} />}
          {block.type === "thinking" && (
            <TranscriptThinkingBlock block={block} density={density} className={thinkingClassName} />
          )}
          {block.type === "tool" && <TranscriptToolCard block={block} density={density} />}
          {block.type === "command_group" && <TranscriptCommandGroup block={block} density={density} />}
          {block.type === "stdout" && (
            <TranscriptStdoutRow block={block} density={density} collapseByDefault={collapseStdout} />
          )}
          {block.type === "activity" && <TranscriptActivityRow block={block} density={density} />}
          {block.type === "event" && <TranscriptEventRow block={block} density={density} />}
        </div>
      ))}
    </div>
  );
}
