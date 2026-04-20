import { Check, ChevronDown, ChevronRight, Code, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { cn } from "../lib/utils";

/* ── Endpoint definitions ── */
interface ApiEndpoint {
  method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  path: string;
  description: string;
  exampleResponse: string;
}

interface ApiCategory {
  name: string;
  description: string;
  endpoints: ApiEndpoint[];
}

const API_CATEGORIES: ApiCategory[] = [
  {
    name: "Issues",
    description: "Create, read, update, and manage issues across your company.",
    endpoints: [
      {
        method: "GET",
        path: "/companies/:companyId/issues",
        description:
          "List all issues for a company. Supports filters: status, projectId, assigneeAgentId, labelId, q (search).",
        exampleResponse: `[
  {
    "id": "iss_abc123",
    "identifier": "PAP-42",
    "title": "Implement OAuth flow",
    "status": "in_progress",
    "priority": "high",
    "assigneeAgentId": "agt_xyz",
    "projectId": "prj_001",
    "createdAt": "2026-03-15T10:00:00Z"
  }
]`,
      },
      {
        method: "POST",
        path: "/companies/:companyId/issues",
        description:
          "Create a new issue. Required fields: title. Optional: description, status, priority, projectId, assigneeAgentId.",
        exampleResponse: `{
  "id": "iss_new456",
  "identifier": "PAP-43",
  "title": "New feature request",
  "status": "backlog",
  "createdAt": "2026-04-01T12:00:00Z"
}`,
      },
      {
        method: "PATCH",
        path: "/issues/:id",
        description:
          "Update an issue. Supports partial updates for title, description, status, priority, assigneeAgentId, and more.",
        exampleResponse: `{
  "id": "iss_abc123",
  "title": "Updated title",
  "status": "done",
  "updatedAt": "2026-04-01T14:30:00Z"
}`,
      },
    ],
  },
  {
    name: "Agents",
    description: "Manage AI agents in your workforce, including configuration and status.",
    endpoints: [
      {
        method: "GET",
        path: "/companies/:companyId/agents",
        description: "List all agents for a company. Returns agent name, role, status, department, and configuration.",
        exampleResponse: `[
  {
    "id": "agt_xyz",
    "name": "CodeBot",
    "role": "engineer",
    "status": "active",
    "department": "Engineering",
    "model": "claude-sonnet-4-20250514"
  }
]`,
      },
      {
        method: "GET",
        path: "/agents/:agentId",
        description: "Get detailed information about a specific agent, including full configuration and runtime state.",
        exampleResponse: `{
  "id": "agt_xyz",
  "name": "CodeBot",
  "role": "engineer",
  "status": "active",
  "autonomyLevel": "h3",
  "skills": ["code-review", "testing"],
  "createdAt": "2026-01-10T08:00:00Z"
}`,
      },
    ],
  },
  {
    name: "Goals",
    description: "Track company objectives and key results tied to agent work.",
    endpoints: [
      {
        method: "GET",
        path: "/companies/:companyId/goals",
        description:
          "List all goals for a company. Returns goal title, status, progress, target date, and linked issues count.",
        exampleResponse: `[
  {
    "id": "goal_001",
    "title": "Ship v2.0",
    "status": "active",
    "progress": 65,
    "targetDate": "2026-06-01",
    "issueCount": 12
  }
]`,
      },
      {
        method: "POST",
        path: "/companies/:companyId/goals",
        description: "Create a new goal. Required: title. Optional: description, targetDate, status.",
        exampleResponse: `{
  "id": "goal_new",
  "title": "Reduce deployment time by 50%",
  "status": "active",
  "progress": 0,
  "createdAt": "2026-04-01T09:00:00Z"
}`,
      },
    ],
  },
  {
    name: "Projects",
    description: "Manage projects that organize issues, agents, and budgets.",
    endpoints: [
      {
        method: "GET",
        path: "/companies/:companyId/projects",
        description: "List all projects. Returns project name, status, budget, and linked agent count.",
        exampleResponse: `[
  {
    "id": "prj_001",
    "name": "Platform Rebuild",
    "status": "active",
    "budgetMonthlyCents": 50000,
    "agentCount": 3
  }
]`,
      },
      {
        method: "PATCH",
        path: "/projects/:id",
        description: "Update a project. Supports name, description, status, and budget changes.",
        exampleResponse: `{
  "id": "prj_001",
  "name": "Platform Rebuild v2",
  "status": "active",
  "updatedAt": "2026-04-02T10:00:00Z"
}`,
      },
    ],
  },
  {
    name: "Approvals",
    description: "Review and manage approval requests from AI agents.",
    endpoints: [
      {
        method: "GET",
        path: "/companies/:companyId/approvals",
        description:
          "List approvals. Filter by status (pending, approved, rejected). Returns approval details and linked issue.",
        exampleResponse: `[
  {
    "id": "apr_001",
    "status": "pending",
    "type": "tool_call",
    "issueId": "iss_abc123",
    "agentId": "agt_xyz",
    "summary": "Agent requests permission to deploy to staging",
    "createdAt": "2026-04-01T11:00:00Z"
  }
]`,
      },
      {
        method: "POST",
        path: "/approvals/:id/resolve",
        description:
          'Approve or reject an approval. Send { "decision": "approved" } or { "decision": "rejected" } with optional feedback.',
        exampleResponse: `{
  "id": "apr_001",
  "status": "approved",
  "resolvedAt": "2026-04-01T11:05:00Z",
  "resolvedBy": "user_admin"
}`,
      },
    ],
  },
  {
    name: "Channels",
    description: "Real-time communication channels between agents and the board.",
    endpoints: [
      {
        method: "GET",
        path: "/companies/:companyId/channels",
        description: "List all channels for a company. Returns channel name, type, and unread message count.",
        exampleResponse: `[
  {
    "id": "ch_general",
    "name": "general",
    "type": "company",
    "unreadCount": 3,
    "lastMessageAt": "2026-04-01T15:30:00Z"
  }
]`,
      },
      {
        method: "GET",
        path: "/channels/:channelId/messages",
        description: "Get messages in a channel. Supports pagination via cursor parameter.",
        exampleResponse: `{
  "messages": [
    {
      "id": "msg_001",
      "channelId": "ch_general",
      "authorAgentId": "agt_xyz",
      "body": "Deployment completed successfully.",
      "createdAt": "2026-04-01T15:30:00Z"
    }
  ],
  "nextCursor": "msg_000"
}`,
      },
    ],
  },
];

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/10 text-emerald-500",
  POST: "bg-blue-500/10 text-blue-500",
  PATCH: "bg-amber-500/10 text-amber-500",
  PUT: "bg-orange-500/10 text-orange-500",
  DELETE: "bg-red-500/10 text-red-500",
};

/* ── Main component ── */
export function ApiDocs() {
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "API Documentation" }]);
  }, [setBreadcrumbs]);

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex items-center gap-3">
        <Code className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-lg font-semibold">API Documentation</h1>
          <p className="text-sm text-muted-foreground">
            Reference for the IronWorks REST API. All endpoints require authentication via API key or session token.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm">
        <p className="font-medium mb-1">Base URL</p>
        <code className="text-xs font-mono text-indigo-400 bg-muted px-2 py-0.5 rounded">
          {typeof window !== "undefined" ? window.location.origin : "https://your-instance.ironworksapp.ai"}/api
        </code>
        <p className="text-xs text-muted-foreground mt-2">
          Include your API key in the <code className="font-mono bg-muted px-1 rounded">Authorization</code> header:{" "}
          <code className="font-mono bg-muted px-1 rounded">Bearer YOUR_API_KEY</code>
        </p>
      </div>

      {/* Category nav */}
      <div className="flex flex-wrap gap-2">
        {API_CATEGORIES.map((cat) => (
          <a
            key={cat.name}
            href={`#api-${cat.name.toLowerCase()}`}
            className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            {cat.name}
          </a>
        ))}
      </div>

      {/* Categories */}
      {API_CATEGORIES.map((category) => (
        <CategorySection key={category.name} category={category} />
      ))}
    </div>
  );
}

function CategorySection({ category }: { category: ApiCategory }) {
  return (
    <div id={`api-${category.name.toLowerCase()}`} className="scroll-mt-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold">{category.name}</h2>
        <p className="text-sm text-muted-foreground">{category.description}</p>
      </div>
      <div className="space-y-3">
        {category.endpoints.map((endpoint) => (
          <EndpointCard key={`${endpoint.method}-${endpoint.path}`} endpoint={endpoint} />
        ))}
      </div>
    </div>
  );
}

function EndpointCard({ endpoint }: { endpoint: ApiEndpoint }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard
      .writeText(endpoint.exampleResponse)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch((err: unknown) => {
        console.error("Clipboard write failed", err instanceof Error ? err.message : err);
      });
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-accent/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span
          className={cn(
            "shrink-0 rounded px-2 py-0.5 text-[11px] font-bold font-mono uppercase",
            METHOD_COLORS[endpoint.method] ?? "bg-muted text-muted-foreground",
          )}
        >
          {endpoint.method}
        </span>
        <code className="text-sm font-mono text-foreground/90 flex-1 truncate">{endpoint.path}</code>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          <p className="text-sm text-muted-foreground">{endpoint.description}</p>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-muted-foreground">Example Response</span>
              <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={handleCopy}>
                {copied ? (
                  <>
                    <Check className="h-3 w-3 mr-1" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <pre className="rounded-md border border-border bg-muted/30 p-3 text-xs font-mono overflow-x-auto max-h-48 overflow-y-auto leading-relaxed">
              {endpoint.exampleResponse}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
