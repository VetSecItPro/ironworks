/* ── Natural Language Search Mappings ── */

export interface NLMapping {
  patterns: RegExp[];
  url: string;
  label: string;
}

export const NL_MAPPINGS: NLMapping[] = [
  {
    patterns: [/show\s*(me\s+)?all\s+failed\s+tasks/i, /failed\s+tasks/i, /failed\s+issues/i],
    url: "/issues?q=&status=blocked",
    label: "Show failed/blocked tasks",
  },
  {
    patterns: [/blocked\s+issues/i, /blocked\s+tasks/i, /what.*blocked/i],
    url: "/issues?q=&status=blocked",
    label: "Show blocked issues",
  },
  {
    patterns: [/overdue\s+issues/i, /overdue\s+tasks/i, /what.*overdue/i],
    url: "/issues?q=&status=in_progress",
    label: "Show in-progress issues (check for overdue)",
  },
  {
    patterns: [/active\s+(issues|tasks)/i, /in\s*progress/i, /what.*working\s+on/i],
    url: "/issues?q=&status=in_progress",
    label: "Show active issues",
  },
  {
    patterns: [/unassigned\s+(issues|tasks)/i, /no\s+assignee/i],
    url: "/issues?assignee=__unassigned",
    label: "Show unassigned issues",
  },
  {
    patterns: [/high\s*priority/i, /urgent\s+(issues|tasks)/i, /critical\s+(issues|tasks)/i],
    url: "/issues?q=&priority=critical,high",
    label: "Show high priority issues",
  },
  { patterns: [/backlog/i, /backlog\s+(issues|tasks)/i], url: "/issues?q=&status=backlog", label: "Show backlog" },
  {
    patterns: [/done\s+(issues|tasks)/i, /completed\s+(issues|tasks)/i, /finished/i],
    url: "/issues?q=&status=done",
    label: "Show completed issues",
  },
  {
    patterns: [/all\s+agents/i, /show\s*(me\s+)?agents/i, /who\s+works\s+here/i],
    url: "/agents",
    label: "Show all agents",
  },
  { patterns: [/paused\s+agents/i, /idle\s+agents/i], url: "/agents", label: "Show agents (filter for paused)" },
  { patterns: [/all\s+projects/i, /show\s*(me\s+)?projects/i], url: "/projects", label: "Show all projects" },
  { patterns: [/all\s+goals/i, /show\s*(me\s+)?goals/i, /objectives/i], url: "/goals", label: "Show all goals" },
  { patterns: [/costs?|spending|budget/i], url: "/costs", label: "Show costs" },
  { patterns: [/activity|what\s+happened/i, /recent\s+changes/i], url: "/activity", label: "Show recent activity" },
  { patterns: [/hiring|open\s+positions/i, /recruit/i], url: "/hiring", label: "Show hiring pipeline" },
  { patterns: [/org\s*chart|hierarchy|reporting/i], url: "/org", label: "Show org chart" },
];

export function matchNaturalLanguage(query: string): NLMapping[] {
  if (query.length < 4) return [];
  return NL_MAPPINGS.filter((m) => m.patterns.some((p) => p.test(query)));
}

/* ── Saved Searches ── */

export interface SavedSearch {
  id: string;
  name: string;
  url: string;
}

const SAVED_SEARCHES_KEY = "ironworks:saved-searches";

export function loadSavedSearches(): SavedSearch[] {
  try {
    const raw = localStorage.getItem(SAVED_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function persistSavedSearches(searches: SavedSearch[]) {
  try {
    localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(searches));
  } catch {
    /* ignore */
  }
}
