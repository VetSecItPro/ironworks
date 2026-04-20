import { Clock, Users } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LibraryContributor, LibraryFileMeta } from "../../api/library";
import { formatRelative, visibilityIcon } from "./libraryHelpers";

export function FileMetaBar({ meta, contributors }: { meta: LibraryFileMeta; contributors: LibraryContributor[] }) {
  const VisIcon = visibilityIcon(meta.visibility);
  return (
    <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border bg-muted/10 text-xs text-muted-foreground">
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-1">
            <VisIcon className="h-3 w-3" />
            {meta.visibility}
          </span>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Visibility: {meta.visibility}</TooltipContent>
      </Tooltip>

      <span className="flex items-center gap-1">
        <Clock className="h-3 w-3" />
        Created {formatRelative(meta.createdAt)}
      </span>

      {contributors.length > 0 && (
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {contributors.length} contributor
              {contributors.length !== 1 ? "s" : ""}
            </span>
          </TooltipTrigger>
          <TooltipContent className="text-xs">
            {contributors.map((c) => c.agentName ?? c.agentId ?? "Unknown").join(", ")}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
