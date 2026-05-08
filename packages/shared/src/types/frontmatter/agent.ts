import type { BaseFrontmatter } from "./base.js";

/**
 * Frontmatter for an agent. Picks the identifying / org-chart fields from
 * `agents` — name, role, hierarchy (reports_to), employment shape, and
 * status. Skips runtime/budget mutable fields; those belong in live state,
 * not the navigability shape.
 */
export interface AgentFrontmatter extends BaseFrontmatter {
  type: "agent";
  /** Display name (matches `agents.name`). */
  name: string;
  /** Role slug (e.g. "general", "engineer", "manager"). */
  role: string;
  agent_title?: string;
  /** Status: "idle" | "running" | "paused" | "terminated" | ... */
  status: string;
  /** Parent agent in the org chart, if any. */
  reports_to?: string;
  department?: string;
  employment_type: string;
  adapter_type: string;
}
