import type { Issue } from "@ironworksai/shared";
import { GitBranch } from "lucide-react";
import { useMemo } from "react";
import { computeCriticalPath } from "./critical-path";
import { DepGraphSvg } from "./DepGraphSvg";
import { DepListView } from "./DepListView";

interface IssueDependencyGraphProps {
  issue: Issue;
  allIssues: Issue[];
}

export function IssueDependencyGraph({ issue, allIssues }: IssueDependencyGraphProps) {
  const { blockers, blocked, criticalPath } = useMemo(() => {
    const issueMap = new Map<string, Issue>();
    for (const i of allIssues) issueMap.set(i.id, i);

    const blockerIssues = (issue.dependsOn ?? []).map((id) => issueMap.get(id)).filter((i): i is Issue => !!i);

    const blockedIssues = allIssues.filter((i) => i.id !== issue.id && (i.dependsOn ?? []).includes(issue.id));

    const cp = computeCriticalPath(issue, allIssues, blockerIssues, blockedIssues);

    return { blockers: blockerIssues, blocked: blockedIssues, criticalPath: cp };
  }, [issue, allIssues]);

  if (blockers.length === 0 && blocked.length === 0) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <GitBranch className="h-3.5 w-3.5" />
        No dependencies
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <DepGraphSvg issue={issue} blockers={blockers} blocked={blocked} criticalPath={criticalPath} />

      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-amber-500 rounded" />
          Critical path
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-3 h-0.5 bg-muted-foreground/40 rounded border-dashed"
            style={{ borderTop: "1px dashed" }}
          />
          Dependency link
        </span>
      </div>

      <DepListView blockers={blockers} blocked={blocked} criticalPath={criticalPath} />
    </div>
  );
}
