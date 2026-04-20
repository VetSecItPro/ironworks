import { BookOpen, CircleDot, DollarSign, FolderOpen, Inbox, Play, Target, Users } from "lucide-react";
import { memo } from "react";
import { useNavigate } from "@/lib/router";
import { cn } from "../../lib/utils";

interface QuickAction {
  icon: React.ElementType;
  label: string;
  description: string;
  action: () => void;
  accent: string;
}

export const QuickActionsGrid = memo(function QuickActionsGrid({
  onCreateIssue,
  onCreateGoal,
  onCreateProject,
}: {
  onCreateIssue: () => void;
  onCreateGoal: () => void;
  onCreateProject: () => void;
}) {
  const navigate = useNavigate();

  const actions: QuickAction[] = [
    {
      icon: CircleDot,
      label: "New Issue",
      description: "Create a task",
      action: onCreateIssue,
      accent: "text-blue-500",
    },
    {
      icon: Target,
      label: "New Goal",
      description: "Set an objective",
      action: onCreateGoal,
      accent: "text-emerald-500",
    },
    {
      icon: FolderOpen,
      label: "New Project",
      description: "Start a project",
      action: onCreateProject,
      accent: "text-violet-500",
    },
    {
      icon: Users,
      label: "Agents",
      description: "Manage workforce",
      action: () => navigate("/agents"),
      accent: "text-amber-500",
    },
    {
      icon: Inbox,
      label: "Inbox",
      description: "Review items",
      action: () => navigate("/inbox"),
      accent: "text-red-500",
    },
    {
      icon: Play,
      label: "Playbooks",
      description: "Run automation",
      action: () => navigate("/playbooks"),
      accent: "text-cyan-500",
    },
    {
      icon: BookOpen,
      label: "Knowledge",
      description: "Browse docs",
      action: () => navigate("/knowledge"),
      accent: "text-pink-500",
    },
    {
      icon: DollarSign,
      label: "Costs",
      description: "View spending",
      action: () => navigate("/costs"),
      accent: "text-orange-500",
    },
  ];

  return (
    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
      {actions.map((action) => (
        <button type="button"
          key={action.label}
          onClick={action.action}
          className="group flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card p-3 text-center hover:bg-accent/50 hover:-translate-y-0.5 hover:shadow-md transition-all"
        >
          <action.icon className={cn("h-5 w-5", action.accent)} />
          <span className="text-xs font-medium">{action.label}</span>
        </button>
      ))}
    </div>
  );
});
