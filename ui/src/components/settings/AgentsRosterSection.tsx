/**
 * Bulk-rename surface for the company's agents.
 *
 * Wizard provisioning defaults each agent's `name` to its title (CEO, CTO, …)
 * unless the operator typed something custom in the roster step. This section
 * is the post-launch UI for personalizing those names — typing real human-style
 * names ("Anouar Bencheqroun") so the team-directory placeholder rendered into
 * the system prompt every heartbeat reflects who's actually on the team.
 *
 * Reads from `agentsApi.slim` (small payload — name/title/role/status only)
 * and writes via the existing `agentsApi.update` PATCH route. Renames take
 * effect on the next heartbeat with no migration.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { type AgentSlim, agentsApi } from "../../api/agents";
import { queryKeys } from "../../lib/queryKeys";

interface RosterDraft {
  id: string;
  name: string;
  title: string;
  role: string;
  status: string;
  /** True when the user has edited this row's name or title since load. */
  dirty: boolean;
}

function buildDrafts(agents: AgentSlim[]): RosterDraft[] {
  return agents.map((a) => ({
    id: a.id,
    name: a.name,
    title: a.title ?? "",
    role: a.role,
    status: a.status,
    dirty: false,
  }));
}

export function AgentsRosterSection({ companyId }: { companyId: string | null | undefined }) {
  const queryClient = useQueryClient();

  const agentsQuery = useQuery({
    queryKey: companyId ? queryKeys.agents.slim(companyId) : ["agents", "slim", "none"],
    queryFn: () => (companyId ? agentsApi.slim(companyId) : Promise.resolve([] as AgentSlim[])),
    enabled: !!companyId,
  });

  const [drafts, setDrafts] = useState<RosterDraft[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  // Hydrate drafts when the underlying agent list changes (initial load,
  // refetch after invalidation, etc.). User edits set `dirty: true`; we never
  // clobber dirty rows with server data — keeps in-flight edits intact if a
  // background refetch lands while the user is typing.
  useEffect(() => {
    if (!agentsQuery.data) return;
    setDrafts((prev) => {
      if (prev.length === 0) return buildDrafts(agentsQuery.data);
      const byId = new Map(prev.map((d) => [d.id, d]));
      return agentsQuery.data.map((a) => {
        const existing = byId.get(a.id);
        if (existing?.dirty) return existing;
        return { id: a.id, name: a.name, title: a.title ?? "", role: a.role, status: a.status, dirty: false };
      });
    });
  }, [agentsQuery.data]);

  const updateRow = (id: string, patch: { name?: string; title?: string }) => {
    setDrafts((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              name: patch.name ?? d.name,
              title: patch.title ?? d.title,
              dirty: true,
            }
          : d,
      ),
    );
    setSavedCount(null);
    setSaveError(null);
  };

  const saveMutation = useMutation({
    mutationFn: async (rows: RosterDraft[]) => {
      // PATCH each dirty row in parallel — small payloads, idempotent. The
      // underlying route validates with updateAgentSchema, so bad inputs surface
      // per-row rather than silently coercing.
      const results = await Promise.allSettled(
        rows.map((row) =>
          agentsApi.update(row.id, { name: row.name.trim(), title: row.title.trim() || null }, companyId ?? undefined),
        ),
      );
      const failures = results
        .map((r, i) => ({ result: r, row: rows[i] }))
        .filter((x) => x.result.status === "rejected");
      if (failures.length > 0) {
        const first = failures[0];
        const reason = first.result.status === "rejected" ? (first.result.reason as Error)?.message : "unknown error";
        throw new Error(
          `Failed to save ${failures.length} of ${rows.length} agent${rows.length === 1 ? "" : "s"}: ${reason}`,
        );
      }
      return rows.length;
    },
    onSuccess: (count) => {
      setSavedCount(count);
      setSaveError(null);
      // Invalidate the slim list and the full agent list so org chart, sidebar,
      // and detail pages all pick up the new names without a page reload.
      if (companyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.slim(companyId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(companyId) });
      }
      setDrafts((prev) => prev.map((d) => ({ ...d, dirty: false })));
    },
    onError: (err: Error) => {
      setSaveError(err.message);
      setSavedCount(null);
    },
  });

  const dirtyRows = drafts.filter((d) => d.dirty);
  const dirtyCount = dirtyRows.length;
  const canSave = dirtyCount > 0 && !saveMutation.isPending;
  const someBlankNames = dirtyRows.some((d) => d.name.trim().length === 0);

  return (
    <div id="agents-roster" className="space-y-4 scroll-mt-6">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Agents</h2>
      </div>
      <p className="text-xs text-muted-foreground leading-snug">
        Personalize agent names — they show up in the org chart, comments, and the team directory each agent reads at
        heartbeat time. Titles are independent of names; both are editable.
      </p>

      {agentsQuery.isLoading && <p className="text-xs text-muted-foreground">Loading agents...</p>}
      {agentsQuery.isError && (
        <p className="text-xs text-destructive">
          Failed to load agents: {(agentsQuery.error as Error)?.message ?? "unknown error"}
        </p>
      )}

      {drafts.length > 0 && (
        <div className="rounded-md border border-border divide-y divide-border">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-3 px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground/70">
            <span>Name</span>
            <span>Title</span>
            <span className="text-right">Role</span>
          </div>
          {drafts.map((row) => (
            <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-3 px-3 py-2 items-center">
              <input
                className="rounded border border-border bg-transparent px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 min-w-0"
                value={row.name}
                placeholder={row.title || row.role}
                onChange={(e) => updateRow(row.id, { name: e.target.value })}
                aria-label={`Name for ${row.title || row.role}`}
              />
              <input
                className="rounded border border-border bg-transparent px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 min-w-0"
                value={row.title}
                placeholder={row.role}
                onChange={(e) => updateRow(row.id, { title: e.target.value })}
                aria-label={`Title for ${row.name || row.role}`}
              />
              <span className="text-[10px] text-muted-foreground text-right whitespace-nowrap">{row.role}</span>
            </div>
          ))}
        </div>
      )}

      {drafts.length === 0 && !agentsQuery.isLoading && (
        <p className="text-xs text-muted-foreground italic">
          No agents yet — provision a team via the onboarding wizard, then return here to personalize names.
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] text-muted-foreground">
          {dirtyCount > 0
            ? `${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}.`
            : savedCount
              ? `Saved ${savedCount} agent${savedCount === 1 ? "" : "s"}.`
              : "No changes."}
          {someBlankNames && <span className="text-amber-500"> — Names cannot be blank.</span>}
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
          disabled={!canSave || someBlankNames}
          onClick={() => saveMutation.mutate(dirtyRows)}
        >
          <Save className="h-3.5 w-3.5" />
          {saveMutation.isPending ? "Saving..." : `Save ${dirtyCount > 0 ? dirtyCount : ""}`}
        </button>
      </div>

      {saveError && <p className="text-xs text-destructive">{saveError}</p>}
    </div>
  );
}
