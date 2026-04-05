import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { roleTemplatesApi, type RoleTemplate } from "../api/roleTemplates";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AGENT_ROLE_LABELS,
  DEPARTMENT_LABELS,
} from "@ironworksai/shared";
import {
  Bot,
  Brain,
  Code,
  Cpu,
  Download,
  Filter,
  LayoutGrid,
  List,
  Palette,
  Search,
  Shield,
  Star,
  Users,
  Wand2,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Agent Marketplace - browse pre-built agent configurations by role.
 * Shows cards with role, description, skills, recommended model.
 * "Install" button opens the create agent dialog pre-filled.
 */

// Default marketplace templates when no company role templates exist
const DEFAULT_MARKETPLACE_TEMPLATES: MarketplaceAgent[] = [
  {
    id: "tpl-engineer",
    role: "engineer",
    title: "Software Engineer",
    description: "Full-stack development, code reviews, bug fixes, and feature implementation. Handles complex technical tasks autonomously.",
    skills: ["TypeScript", "React", "Node.js", "Git", "Testing"],
    recommendedModel: "claude-sonnet-4-20250514",
    category: "engineering",
    popular: true,
  },
  {
    id: "tpl-qa",
    role: "qa",
    title: "QA Engineer",
    description: "Automated testing, quality assurance, bug triage, and regression testing. Ensures code quality before deployment.",
    skills: ["Testing", "Cypress", "Jest", "Bug Triage", "Automation"],
    recommendedModel: "claude-sonnet-4-20250514",
    category: "engineering",
    popular: false,
  },
  {
    id: "tpl-devops",
    role: "devops",
    title: "DevOps Engineer",
    description: "CI/CD pipelines, infrastructure management, monitoring, and deployment automation.",
    skills: ["Docker", "GitHub Actions", "Terraform", "Monitoring", "Shell"],
    recommendedModel: "claude-sonnet-4-20250514",
    category: "engineering",
    popular: true,
  },
  {
    id: "tpl-designer",
    role: "designer",
    title: "UI/UX Designer",
    description: "Design system maintenance, component design, accessibility audits, and UI prototyping.",
    skills: ["CSS", "Figma", "Design Systems", "Accessibility", "Prototyping"],
    recommendedModel: "claude-sonnet-4-20250514",
    category: "design",
    popular: false,
  },
  {
    id: "tpl-pm",
    role: "pm",
    title: "Product Manager",
    description: "Requirements gathering, sprint planning, stakeholder updates, and roadmap management.",
    skills: ["Planning", "Analysis", "Roadmapping", "Documentation", "Coordination"],
    recommendedModel: "claude-sonnet-4-20250514",
    category: "management",
    popular: true,
  },
  {
    id: "tpl-analyst",
    role: "analyst",
    title: "Data Analyst",
    description: "Data analysis, reporting, metrics tracking, and business intelligence dashboards.",
    skills: ["SQL", "Python", "Data Viz", "Reporting", "Statistics"],
    recommendedModel: "claude-sonnet-4-20250514",
    category: "analytics",
    popular: false,
  },
  {
    id: "tpl-ciso",
    role: "ciso",
    title: "Security Officer",
    description: "Security audits, vulnerability scanning, compliance checks, and incident response planning.",
    skills: ["Security Audit", "OWASP", "Compliance", "Penetration Testing", "Monitoring"],
    recommendedModel: "claude-sonnet-4-20250514",
    category: "security",
    popular: false,
  },
  {
    id: "tpl-researcher",
    role: "researcher",
    title: "Research Analyst",
    description: "Market research, competitive analysis, technology evaluation, and strategic recommendations.",
    skills: ["Research", "Analysis", "Writing", "Synthesis", "Evaluation"],
    recommendedModel: "claude-sonnet-4-20250514",
    category: "research",
    popular: false,
  },
  {
    id: "tpl-cfo",
    role: "cfo",
    title: "Finance Manager",
    description: "Budget tracking, cost optimization, financial reporting, and resource allocation.",
    skills: ["Budgeting", "Cost Analysis", "Reporting", "Forecasting", "Optimization"],
    recommendedModel: "claude-sonnet-4-20250514",
    category: "management",
    popular: false,
  },
  {
    id: "tpl-general",
    role: "general",
    title: "General Agent",
    description: "Versatile agent that handles a wide range of tasks. Good starting point for custom configurations.",
    skills: ["General", "Flexible", "Multi-task"],
    recommendedModel: "claude-sonnet-4-20250514",
    category: "general",
    popular: false,
  },
];

interface MarketplaceAgent {
  id: string;
  role: string;
  title: string;
  description: string;
  skills: string[];
  recommendedModel: string;
  category: string;
  popular: boolean;
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  engineering: Code,
  design: Palette,
  management: Users,
  analytics: Brain,
  security: Shield,
  research: Search,
  general: Bot,
};

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "engineering", label: "Engineering" },
  { id: "design", label: "Design" },
  { id: "management", label: "Management" },
  { id: "analytics", label: "Analytics" },
  { id: "security", label: "Security" },
  { id: "research", label: "Research" },
  { id: "general", label: "General" },
];

export function AgentMarketplace() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    setBreadcrumbs([{ label: "Agent Marketplace" }]);
  }, [setBreadcrumbs]);

  // Fetch company role templates
  const { data: roleTemplates } = useQuery({
    queryKey: [...queryKeys.agents.list(selectedCompanyId!), "role-templates"],
    queryFn: () => roleTemplatesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // Merge company role templates with defaults
  const allTemplates = useMemo<MarketplaceAgent[]>(() => {
    const companyTemplates: MarketplaceAgent[] = (roleTemplates ?? []).map((rt) => ({
      id: rt.id,
      role: rt.role,
      title: rt.title,
      description: rt.description ?? `Custom ${rt.title} configuration`,
      skills: rt.defaultSkills ?? [],
      recommendedModel: "claude-sonnet-4-20250514",
      category: mapRoleToCategory(rt.role),
      popular: false,
    }));

    // Deduplicate - company templates override defaults for the same role
    const companyRoles = new Set(companyTemplates.map((t) => t.role));
    const defaults = DEFAULT_MARKETPLACE_TEMPLATES.filter(
      (t) => !companyRoles.has(t.role),
    );

    return [...companyTemplates, ...defaults];
  }, [roleTemplates]);

  // Filter
  const filtered = useMemo(() => {
    let result = allTemplates;
    if (category !== "all") {
      result = result.filter((t) => t.category === category);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.role.toLowerCase().includes(q) ||
          t.skills.some((s) => s.toLowerCase().includes(q)),
      );
    }
    return result.sort((a, b) => {
      if (a.popular && !b.popular) return -1;
      if (!a.popular && b.popular) return 1;
      return a.title.localeCompare(b.title);
    });
  }, [allTemplates, category, search]);

  function handleInstall(agent: MarketplaceAgent) {
    const params = new URLSearchParams();
    params.set("role", agent.role);
    params.set("name", agent.title);
    navigate(`/agents/new?${params.toString()}`);
  }

  if (!selectedCompanyId) {
    return <EmptyState icon={Bot} message="Select a company to browse the Agent Marketplace." />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold">Agent Marketplace</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse pre-built agent configurations by role. Install to create a new agent with recommended settings.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents..."
            className="pl-8 text-sm h-9"
          />
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-full transition-colors",
                category === c.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={() => setViewMode("list")}
          >
            <List className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Bot}
          message={search.trim() ? "No agents match your search." : "No agents in this category."}
        />
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((agent) => {
            const CategoryIcon = CATEGORY_ICONS[agent.category] ?? Bot;
            return (
              <div
                key={agent.id}
                className="rounded-lg border border-border bg-card p-4 flex flex-col hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <CategoryIcon className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-semibold truncate">{agent.title}</h3>
                      {agent.popular && (
                        <Star className="h-3 w-3 text-amber-500 shrink-0 fill-amber-500" />
                      )}
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">
                      {(AGENT_ROLE_LABELS as Record<string, string>)[agent.role] ?? agent.role}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground flex-1 mb-3 line-clamp-3">
                  {agent.description}
                </p>

                <div className="flex flex-wrap gap-1 mb-3">
                  {agent.skills.slice(0, 4).map((skill) => (
                    <span
                      key={skill}
                      className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground"
                    >
                      {skill}
                    </span>
                  ))}
                  {agent.skills.length > 4 && (
                    <span className="text-[10px] px-1.5 py-0.5 text-muted-foreground">
                      +{agent.skills.length - 4}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {agent.recommendedModel.replace("claude-", "").replace("-20250514", "")}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => handleInstall(agent)}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Install
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {filtered.map((agent) => {
            const CategoryIcon = CATEGORY_ICONS[agent.category] ?? Bot;
            return (
              <div
                key={agent.id}
                className="flex items-center gap-4 px-4 py-3 hover:bg-accent/20 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <CategoryIcon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{agent.title}</span>
                    {agent.popular && (
                      <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                    )}
                    <span className="text-[10px] text-muted-foreground uppercase">
                      {(AGENT_ROLE_LABELS as Record<string, string>)[agent.role] ?? agent.role}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{agent.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="hidden sm:flex gap-1">
                    {agent.skills.slice(0, 3).map((s) => (
                      <span
                        key={s}
                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => handleInstall(agent)}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Install
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function mapRoleToCategory(role: string): string {
  switch (role) {
    case "engineer":
    case "devops":
    case "qa":
      return "engineering";
    case "designer":
      return "design";
    case "pm":
    case "ceo":
    case "coo":
    case "cfo":
    case "vp":
    case "director":
    case "manager":
      return "management";
    case "analyst":
      return "analytics";
    case "ciso":
      return "security";
    case "researcher":
      return "research";
    default:
      return "general";
  }
}
