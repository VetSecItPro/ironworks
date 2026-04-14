import { Link } from "@/lib/router";
import { ChevronRight } from "lucide-react";

interface Ancestor {
  id: string;
  identifier?: string | null;
  title: string;
}

interface IssueAncestorBreadcrumbProps {
  ancestors: Ancestor[];
  issueTitle: string;
  locationState: unknown;
}

export function IssueAncestorBreadcrumb({ ancestors, issueTitle, locationState }: IssueAncestorBreadcrumbProps) {
  if (ancestors.length === 0) return null;

  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
      {[...ancestors].reverse().map((ancestor, i) => (
        <span key={ancestor.id} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
          <Link
            to={`/issues/${ancestor.identifier ?? ancestor.id}`}
            state={locationState}
            className="hover:text-foreground transition-colors truncate max-w-[200px]"
            title={ancestor.title}
          >
            {ancestor.title}
          </Link>
        </span>
      ))}
      <ChevronRight className="h-3 w-3 shrink-0" />
      <span className="text-foreground/60 truncate max-w-[200px]">{issueTitle}</span>
    </nav>
  );
}
