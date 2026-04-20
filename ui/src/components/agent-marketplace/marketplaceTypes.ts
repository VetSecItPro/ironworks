import type { LucideIcon } from "lucide-react";
import { Bot, Brain, Code, Palette, Search, Shield, Users } from "lucide-react";

export interface MarketplaceAgent {
  id: string;
  role: string;
  title: string;
  description: string;
  skills: string[];
  recommendedModel: string;
  category: string;
  popular: boolean;
}

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  engineering: Code,
  design: Palette,
  management: Users,
  analytics: Brain,
  security: Shield,
  research: Search,
  general: Bot,
};

export const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "engineering", label: "Engineering" },
  { id: "design", label: "Design" },
  { id: "management", label: "Management" },
  { id: "analytics", label: "Analytics" },
  { id: "security", label: "Security" },
  { id: "research", label: "Research" },
  { id: "general", label: "General" },
];

export const DEFAULT_MARKETPLACE_TEMPLATES: MarketplaceAgent[] = [
  {
    id: "tpl-engineer",
    role: "engineer",
    title: "Software Engineer",
    description:
      "Full-stack development, code reviews, bug fixes, and feature implementation. Handles complex technical tasks autonomously.",
    skills: ["TypeScript", "React", "Node.js", "Git", "Testing"],
    recommendedModel: "claude-sonnet-4-20250514",
    category: "engineering",
    popular: true,
  },
  {
    id: "tpl-qa",
    role: "qa",
    title: "QA Engineer",
    description:
      "Automated testing, quality assurance, bug triage, and regression testing. Ensures code quality before deployment.",
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

export function mapRoleToCategory(role: string): string {
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
