import type { Db } from "@ironworksai/db";
import { agents } from "@ironworksai/db";
import { and, eq, sql } from "drizzle-orm";
import { type FrameworkToolCacheConfig, frameworkCacheGet, frameworkCacheSet } from "./tool-cache.js";

// ---------------------------------------------------------------------------
// First-party read cache configurations
// ---------------------------------------------------------------------------

/**
 * Team directory: per-agent view of colleagues, sorted by name.
 *
 * TTL 300s — the agent roster changes only on operator action (hire, rename,
 * terminate). A 5-minute window catches any roster change before the next
 * heartbeat while eliminating the 13 identical DB reads that fire when all
 * 13 Atlas Ops agents wake simultaneously. Key includes `currentAgentId`
 * because each agent sees every colleague EXCEPT itself.
 */
const TEAM_DIRECTORY_CACHE: FrameworkToolCacheConfig = {
  ttlSeconds: 300,
  keyFields: ["companyId", "currentAgentId"],
};

/**
 * Render a per-company colleague directory for substitution into the shared
 * `{{TEAM_DIRECTORY}}` placeholder in COMMON_AGENT_PREAMBLE. Each line is one
 * colleague (excluding self). Falls back to a "no colleagues" stub when the
 * agent is the only one in the company — keeps the prompt structurally valid
 * even on pre-fleet installs.
 *
 * Result is cached for 300 seconds: the colleague list only changes on
 * operator action (hire, rename, terminate), so within a heartbeat cycle
 * all agents beyond the first get a cache hit. Staleness is bounded to
 * one heartbeat cycle at most (default 4-hour interval).
 */
export async function renderTeamDirectory(db: Db, companyId: string, currentAgentId: string): Promise<string> {
  const cached = frameworkCacheGet<string>(
    companyId,
    "renderTeamDirectory",
    { companyId, currentAgentId },
    TEAM_DIRECTORY_CACHE,
  );
  if (cached.hit) return cached.value;

  const colleagues = await db
    .select({ name: agents.name, title: agents.title, role: agents.role })
    .from(agents)
    .where(
      and(eq(agents.companyId, companyId), sql`${agents.id} <> ${currentAgentId}`, sql`${agents.terminatedAt} IS NULL`),
    );
  const result =
    colleagues.length === 0
      ? "_(no other agents on this team yet)_"
      : colleagues.map((c) => `- ${c.name} (${c.title ?? c.role})`).join("\n");

  frameworkCacheSet(companyId, "renderTeamDirectory", { companyId, currentAgentId }, TEAM_DIRECTORY_CACHE, result);
  return result;
}
