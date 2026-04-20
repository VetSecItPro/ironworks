import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Bookmark,
  BookOpen,
  Bot,
  CircleDot,
  DollarSign,
  FileText,
  Hexagon,
  History,
  Inbox,
  Keyboard,
  LayoutDashboard,
  Plus,
  Search,
  Settings,
  Shield,
  SquarePen,
  Target,
  Trash2,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useNavigate } from "@/lib/router";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useSidebar } from "../context/SidebarContext";
import { queryKeys } from "../lib/queryKeys";
import { agentUrl, projectUrl } from "../lib/utils";
import {
  loadSavedSearches,
  matchNaturalLanguage,
  persistSavedSearches,
  type SavedSearch,
} from "./command-palette/nlSearch";
import { Identity } from "./Identity";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(loadSavedSearches);
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();
  const { openNewIssue, openNewAgent } = useDialog();
  const { isMobile, setSidebarOpen } = useSidebar();
  const searchQuery = query.trim();

  const nlMatches = useMemo(() => matchNaturalLanguage(searchQuery), [searchQuery]);

  const saveCurrentSearch = useCallback(() => {
    const currentUrl = window.location.pathname + window.location.search;
    const name = searchQuery || `Search: ${currentUrl}`;
    const id = `ss-${Date.now()}`;
    const updated = [...savedSearches, { id, name, url: currentUrl }];
    setSavedSearches(updated);
    persistSavedSearches(updated);
  }, [searchQuery, savedSearches]);

  const removeSavedSearch = useCallback(
    (id: string) => {
      const updated = savedSearches.filter((s) => s.id !== id);
      setSavedSearches(updated);
      persistSavedSearches(updated);
    },
    [savedSearches],
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
        if (isMobile) setSidebarOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobile, setSidebarOpen]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const { data: issues = [] } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && open,
  });

  const { data: searchedIssues = [] } = useQuery({
    queryKey: queryKeys.issues.search(selectedCompanyId!, searchQuery),
    queryFn: () => issuesApi.list(selectedCompanyId!, { q: searchQuery }),
    enabled: !!selectedCompanyId && open && searchQuery.length > 0,
  });

  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && open,
  });

  const { data: allProjects = [] } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && open,
  });
  const projects = useMemo(() => allProjects.filter((p) => !p.archivedAt), [allProjects]);

  function go(path: string) {
    setOpen(false);
    navigate(path);
  }

  const agentName = (id: string | null) => {
    if (!id) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  };

  const visibleIssues = useMemo(
    () => (searchQuery.length > 0 ? searchedIssues : issues),
    [issues, searchedIssues, searchQuery],
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v && isMobile) setSidebarOpen(false);
      }}
      data-tour="command-palette"
    >
      <CommandInput placeholder="Search missions, agents, projects..." value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {nlMatches.length > 0 && (
          <>
            <CommandGroup heading="Smart Suggestions">
              {nlMatches.map((match) => (
                <CommandItem key={match.url} onSelect={() => go(match.url)}>
                  <Search className="mr-2 h-4 w-4 text-blue-500" />
                  {match.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {savedSearches.length > 0 && (
          <>
            <CommandGroup heading="Saved Searches">
              {savedSearches.map((ss) => (
                <CommandItem key={ss.id} value={`saved-search ${ss.name}`} onSelect={() => go(ss.url)}>
                  <Bookmark className="mr-2 h-4 w-4 text-amber-500" />
                  <span className="flex-1 truncate">{ss.name}</span>
                  <button
                    className="ml-2 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSavedSearch(ss.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() => {
              setOpen(false);
              openNewIssue();
            }}
          >
            <SquarePen className="mr-2 h-4 w-4" />
            Create new mission
            <span className="ml-auto text-xs text-muted-foreground">C</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false);
              openNewAgent();
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create new agent
          </CommandItem>
          <CommandItem onSelect={() => go("/projects")}>
            <Plus className="mr-2 h-4 w-4" />
            Create new project
          </CommandItem>
          <CommandItem
            onSelect={() => {
              saveCurrentSearch();
              setOpen(false);
            }}
          >
            <Bookmark className="mr-2 h-4 w-4" />
            Save current page as search
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Pages">
          <CommandItem onSelect={() => go("/dashboard")}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Dashboard<span className="ml-auto text-xs text-muted-foreground">g d</span>
          </CommandItem>
          <CommandItem onSelect={() => go("/inbox")}>
            <Inbox className="mr-2 h-4 w-4" />
            Inbox<span className="ml-auto text-xs text-muted-foreground">g n</span>
          </CommandItem>
          <CommandItem onSelect={() => go("/issues")}>
            <CircleDot className="mr-2 h-4 w-4" />
            Missions<span className="ml-auto text-xs text-muted-foreground">g i</span>
          </CommandItem>
          <CommandItem onSelect={() => go("/projects")}>
            <Hexagon className="mr-2 h-4 w-4" />
            Projects<span className="ml-auto text-xs text-muted-foreground">g p</span>
          </CommandItem>
          <CommandItem onSelect={() => go("/goals")}>
            <Target className="mr-2 h-4 w-4" />
            Goals<span className="ml-auto text-xs text-muted-foreground">g o</span>
          </CommandItem>
          <CommandItem onSelect={() => go("/agents")}>
            <Bot className="mr-2 h-4 w-4" />
            Agents<span className="ml-auto text-xs text-muted-foreground">g a</span>
          </CommandItem>
          <CommandItem onSelect={() => go("/costs")}>
            <DollarSign className="mr-2 h-4 w-4" />
            Costs<span className="ml-auto text-xs text-muted-foreground">g c</span>
          </CommandItem>
          <CommandItem onSelect={() => go("/activity")}>
            <History className="mr-2 h-4 w-4" />
            Activity
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="More Pages">
          <CommandItem onSelect={() => go("/playbooks")}>
            <FileText className="mr-2 h-4 w-4" />
            Playbooks<span className="ml-auto text-xs text-muted-foreground">g b</span>
          </CommandItem>
          <CommandItem onSelect={() => go("/library")}>
            <BookOpen className="mr-2 h-4 w-4" />
            Library<span className="ml-auto text-xs text-muted-foreground">g l</span>
          </CommandItem>
          <CommandItem onSelect={() => go("/performance")}>
            <BarChart3 className="mr-2 h-4 w-4" />
            Performance
          </CommandItem>
          <CommandItem onSelect={() => go("/audit-log")}>
            <Shield className="mr-2 h-4 w-4" />
            Audit Log
          </CommandItem>
          <CommandItem onSelect={() => go("/org")}>
            <Users className="mr-2 h-4 w-4" />
            Org Chart
          </CommandItem>
          <CommandItem onSelect={() => go("/company/settings")}>
            <Settings className="mr-2 h-4 w-4" />
            Company Settings<span className="ml-auto text-xs text-muted-foreground">g s</span>
          </CommandItem>
          <CommandItem onSelect={() => go("/keyboard-shortcuts")}>
            <Keyboard className="mr-2 h-4 w-4" />
            Keyboard Shortcuts<span className="ml-auto text-xs text-muted-foreground">g k</span>
          </CommandItem>
        </CommandGroup>

        {visibleIssues.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Missions">
              {visibleIssues.slice(0, 10).map((issue) => (
                <CommandItem
                  key={issue.id}
                  value={searchQuery.length > 0 ? `${searchQuery} ${issue.identifier ?? ""} ${issue.title}` : undefined}
                  onSelect={() => go(`/issues/${issue.identifier ?? issue.id}`)}
                >
                  <CircleDot className="mr-2 h-4 w-4" />
                  <span className="text-muted-foreground mr-2 font-mono text-xs">
                    {issue.identifier ?? issue.id.slice(0, 8)}
                  </span>
                  <span className="flex-1 truncate">{issue.title}</span>
                  {issue.assigneeAgentId &&
                    (() => {
                      const name = agentName(issue.assigneeAgentId);
                      return name ? <Identity name={name} size="sm" className="ml-2 hidden sm:inline-flex" /> : null;
                    })()}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {agents.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Agents">
              {agents.slice(0, 10).map((agent) => (
                <CommandItem key={agent.id} onSelect={() => go(agentUrl(agent))}>
                  <Bot className="mr-2 h-4 w-4" />
                  {agent.name}
                  <span className="text-xs text-muted-foreground ml-2">{agent.role}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {projects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Projects">
              {projects.slice(0, 10).map((project) => (
                <CommandItem key={project.id} onSelect={() => go(projectUrl(project))}>
                  <Hexagon className="mr-2 h-4 w-4" />
                  {project.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
