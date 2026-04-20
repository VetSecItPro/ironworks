import { cn } from "../../lib/utils";

interface DiffLine {
  type: "added" | "removed" | "unchanged";
  text: string;
}

function computeLineDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  // Simple Myers-like diff using LCS
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;

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

export function SimpleDiff({ oldText, newText }: { oldText: string; newText: string }) {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  // Simple LCS-based diff
  const diff = computeLineDiff(oldLines, newLines);

  return (
    <div className="font-mono text-[11px] leading-5 overflow-x-auto max-h-64 overflow-y-auto rounded border border-border">
      {diff.map((line, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: diff lines have no identity beyond their position; same line text can appear multiple times on both sides
        <div key={i} className={cn("px-3 py-0.5 whitespace-pre-wrap", line.type === "removed" ? "bg-red-500/10 text-red-400" : line.type === "added" ? "bg-emerald-500/10 text-emerald-400" : "text-muted-foreground/80")}>
          <span className="inline-block w-4 text-right mr-2 select-none opacity-50">
            {line.type === "removed" ? "-" : line.type === "added" ? "+" : " "}
          </span>
          {line.text}
        </div>
      ))}
      {diff.length === 0 && <div className="px-3 py-2 text-muted-foreground text-center">No differences found.</div>}
    </div>
  );
}
