import { Layers, Plus } from "lucide-react";
import { cn } from "../../lib/utils";

export interface IssueTemplate {
  id: string;
  name: string;
  icon: string;
  defaults: {
    title?: string;
    description?: string;
    priority?: string;
    labels?: string[];
  };
}

export const BUILT_IN_TEMPLATES: IssueTemplate[] = [
  {
    id: "bug",
    name: "Bug Report",
    icon: "bug",
    defaults: {
      title: "[Bug] ",
      description:
        "## Steps to Reproduce\n1. \n\n## Expected Behavior\n\n\n## Actual Behavior\n\n\n## Environment\n- \n",
      priority: "high",
      labels: ["bug"],
    },
  },
  {
    id: "feature",
    name: "Feature Request",
    icon: "lightbulb",
    defaults: {
      title: "[Feature] ",
      description: "## Summary\n\n\n## Motivation\n\n\n## Proposed Solution\n\n\n## Alternatives Considered\n\n",
      priority: "medium",
      labels: ["feature"],
    },
  },
  {
    id: "research",
    name: "Research Task",
    icon: "search",
    defaults: {
      title: "[Research] ",
      description: "## Objective\n\n\n## Scope\n\n\n## Key Questions\n1. \n\n## Deliverables\n- \n",
      priority: "medium",
      labels: ["research"],
    },
  },
  {
    id: "chore",
    name: "Maintenance / Chore",
    icon: "wrench",
    defaults: {
      title: "[Chore] ",
      description: "## Description\n\n\n## Tasks\n- [ ] \n",
      priority: "low",
      labels: ["chore"],
    },
  },
];

interface TemplatePickerProps {
  templates?: IssueTemplate[];
  onSelect: (template: IssueTemplate) => void;
  className?: string;
}

export function TemplatePicker({ templates = BUILT_IN_TEMPLATES, onSelect, className }: TemplatePickerProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      {templates.map((tmpl) => (
        <button
          key={tmpl.id}
          type="button"
          onClick={() => onSelect(tmpl)}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-accent/50 transition-colors"
        >
          <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
          <span>{tmpl.name}</span>
        </button>
      ))}
      <button
        type="button"
        className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent/50 transition-colors"
        onClick={() =>
          onSelect({
            id: "blank",
            name: "Blank Mission",
            icon: "file",
            defaults: {},
          })
        }
      >
        <Plus className="h-4 w-4 shrink-0" />
        <span>Blank</span>
      </button>
    </div>
  );
}
