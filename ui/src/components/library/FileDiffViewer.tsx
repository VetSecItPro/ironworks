import { Columns } from "lucide-react";
import { useMemo } from "react";
import { cn } from "../../lib/utils";

interface DiffLine {
  type: "added" | "removed" | "unchanged";
  text: string;
}

function computeLineDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const result: DiffLine[] = [];
  let i = m,
    j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: "unchanged", text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "added", text: newLines[j - 1] });
      j--;
    } else if (i > 0) {
      result.unshift({ type: "removed", text: oldLines[i - 1] });
      i--;
    }
  }
  return result;
}

export function FileDiffViewer({
  oldContent,
  newContent,
  fileName,
}: {
  oldContent: string;
  newContent: string;
  fileName: string;
}) {
  const diff = useMemo(() => computeLineDiff(oldContent.split("\n"), newContent.split("\n")), [oldContent, newContent]);
  const oldLines = diff.filter((l) => l.type !== "added");
  const newLines = diff.filter((l) => l.type !== "removed");
  const addedCount = diff.filter((l) => l.type === "added").length;
  const removedCount = diff.filter((l) => l.type === "removed").length;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/20 shrink-0">
        <div className="flex items-center gap-2">
          <Columns className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Diff: {fileName}</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-emerald-500">+{addedCount}</span>
          <span className="text-red-500">-{removedCount}</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-2 divide-x divide-border min-w-[600px]">
          <div className="font-mono text-[11px] leading-5">
            <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-red-500/5 border-b border-border">
              Previous
            </div>
            {oldLines.map((line, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: diff lines have no identity beyond position; same text can appear on multiple lines
              <div
                key={i}
                className={cn(
                  "px-3 py-0.5 whitespace-pre-wrap",
                  line.type === "removed" ? "bg-red-500/10 text-red-400" : "text-muted-foreground/80",
                )}
              >
                <span className="inline-block w-6 text-right mr-2 select-none opacity-40 text-[10px]">{i + 1}</span>
                {line.text}
              </div>
            ))}
          </div>
          <div className="font-mono text-[11px] leading-5">
            <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-emerald-500/5 border-b border-border">
              Current
            </div>
            {newLines.map((line, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: diff lines have no identity beyond position; same text can appear on multiple lines
              <div
                key={i}
                className={cn(
                  "px-3 py-0.5 whitespace-pre-wrap",
                  line.type === "added" ? "bg-emerald-500/10 text-emerald-400" : "text-muted-foreground/80",
                )}
              >
                <span className="inline-block w-6 text-right mr-2 select-none opacity-40 text-[10px]">{i + 1}</span>
                {line.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
