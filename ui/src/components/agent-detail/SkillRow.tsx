import type { AgentSkillEntry } from "@ironworksai/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "@/lib/router";
import { cn } from "../../lib/utils";
import { MarkdownBody } from "../MarkdownBody";

export type SkillRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  detail: string | null;
  locationLabel: string | null;
  originLabel: string | null;
  linkTo: string | null;
  readOnly: boolean;
  adapterEntry: AgentSkillEntry | null;
};

export function SkillRowItem({
  skill,
  adapterEntryByKey,
  skillDraft,
  setSkillDraft,
  skillMode,
  unsupportedSkillMessage,
}: {
  skill: SkillRow;
  adapterEntryByKey: Map<string, AgentSkillEntry>;
  skillDraft: string[];
  setSkillDraft: (draft: string[]) => void;
  skillMode?: string;
  unsupportedSkillMessage: string | null;
}) {
  const adapterEntry = skill.adapterEntry ?? adapterEntryByKey.get(skill.key);
  const required = Boolean(adapterEntry?.required);
  const rowClassName = cn(
    "flex items-start gap-3 border-b border-border px-3 py-3 text-sm last:border-b-0",
    skill.readOnly ? "bg-muted/20" : "hover:bg-accent/20",
  );
  const body = (
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="truncate font-medium">{skill.name}</span>
        </div>
        {skill.linkTo ? (
          <Link to={skill.linkTo} className="shrink-0 text-xs text-muted-foreground no-underline hover:text-foreground">
            View
          </Link>
        ) : null}
      </div>
      {skill.description && (
        <MarkdownBody className="mt-1 text-xs text-muted-foreground prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
          {skill.description}
        </MarkdownBody>
      )}
      {skill.readOnly && skill.originLabel && <p className="mt-1 text-xs text-muted-foreground">{skill.originLabel}</p>}
      {skill.readOnly && skill.locationLabel && (
        <p className="mt-1 text-xs text-muted-foreground">Location: {skill.locationLabel}</p>
      )}
      {skill.detail && <p className="mt-1 text-xs text-muted-foreground">{skill.detail}</p>}
    </div>
  );

  if (skill.readOnly) {
    return (
      <div key={skill.id} className={rowClassName}>
        <span className="mt-1 h-2 w-2 rounded-full bg-muted-foreground/40" />
        {body}
      </div>
    );
  }

  const checked = required || skillDraft.includes(skill.key);
  const disabled = required || skillMode === "unsupported";
  const checkbox = (
    <input
      id={`skill-row-${skill.id}`}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => {
        const next = event.target.checked
          ? Array.from(new Set([...skillDraft, skill.key]))
          : skillDraft.filter((value) => value !== skill.key);
        setSkillDraft(next);
      }}
      className="mt-0.5 disabled:cursor-not-allowed disabled:opacity-60"
    />
  );

  return (
    <label htmlFor={`skill-row-${skill.id}`} key={skill.id} className={rowClassName}>
      {required && adapterEntry?.requiredReason ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>{checkbox}</span>
          </TooltipTrigger>
          <TooltipContent side="top">{adapterEntry.requiredReason}</TooltipContent>
        </Tooltip>
      ) : skillMode === "unsupported" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>{checkbox}</span>
          </TooltipTrigger>
          <TooltipContent side="top">
            {unsupportedSkillMessage ?? "Manage skills in the adapter directly."}
          </TooltipContent>
        </Tooltip>
      ) : (
        checkbox
      )}
      {body}
    </label>
  );
}
