import { useQuery } from "@tanstack/react-query";
import { Bot, LayoutGrid, List, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "@/lib/router";
import { roleTemplatesApi } from "../api/roleTemplates";
import { MarketplaceGridView } from "../components/agent-marketplace/MarketplaceGridView";
import { MarketplaceListView } from "../components/agent-marketplace/MarketplaceListView";
import type { MarketplaceAgent } from "../components/agent-marketplace/marketplaceTypes";
import {
  CATEGORIES,
  DEFAULT_MARKETPLACE_TEMPLATES,
  mapRoleToCategory,
} from "../components/agent-marketplace/marketplaceTypes";
import { EmptyState } from "../components/EmptyState";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";

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

  const { data: roleTemplates } = useQuery({
    queryKey: [...queryKeys.agents.list(selectedCompanyId!), "role-templates"],
    queryFn: () => roleTemplatesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const allTemplates = useMemo<MarketplaceAgent[]>(() => {
    const companyTemplates: MarketplaceAgent[] = (roleTemplates ?? []).map((rt) => ({
      id: rt.id,
      role: rt.role,
      title: rt.title,
      description: rt.capabilities ?? `Custom ${rt.title} configuration`,
      skills: [],
      recommendedModel: "claude-sonnet-4-20250514",
      category: mapRoleToCategory(rt.role),
      popular: false,
    }));
    const companyRoles = new Set(companyTemplates.map((t) => t.role));
    const defaults = DEFAULT_MARKETPLACE_TEMPLATES.filter((t) => !companyRoles.has(t.role));
    return [...companyTemplates, ...defaults];
  }, [roleTemplates]);

  const filtered = useMemo(() => {
    let result = allTemplates;
    if (category !== "all") result = result.filter((t) => t.category === category);
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
      <div>
        <h1 className="text-lg font-bold">Agent Marketplace</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse pre-built agent configurations by role. Install to create a new agent with recommended settings.
        </p>
      </div>

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

      {filtered.length === 0 ? (
        <EmptyState
          icon={Bot}
          message={search.trim() ? "No agents match your search." : "No agents in this category."}
        />
      ) : viewMode === "grid" ? (
        <MarketplaceGridView agents={filtered} onInstall={handleInstall} />
      ) : (
        <MarketplaceListView agents={filtered} onInstall={handleInstall} />
      )}
    </div>
  );
}
