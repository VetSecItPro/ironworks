import type { BaseFrontmatter } from "./base.js";

/**
 * Frontmatter for a cost rollup entity. Captures aggregated agent + provider
 * spend for a given period (weekly or monthly granularity) so the vault can
 * carry an auditable cost history alongside other entity types.
 *
 * `period_start` / `period_end` are date-only strings (YYYY-MM-DD) — they
 * describe a calendar window, not a precise instant, and YAML round-trips
 * date-only strings cleanly without timezone drift.
 */
export interface CostRollupFrontmatter extends BaseFrontmatter {
  type: "cost_rollup";
  /** YYYY-MM-DD (inclusive). */
  period_start: string;
  /** YYYY-MM-DD (inclusive). */
  period_end: string;
  granularity: "weekly" | "monthly";
  total_usd: number;
  by_agent: Array<{ agent_slug: string; total_usd: number }>;
  by_provider: Array<{ provider: string; total_usd: number }>;
}
