import type { BaseFrontmatter } from "./base.js";

/**
 * Frontmatter for a project. Surfaces the orientation fields a reader needs
 * to navigate the vault: name + status + lead + parent goal + target date.
 */
export interface ProjectFrontmatter extends BaseFrontmatter {
  type: "project";
  /** Project name (display string; `title` in BaseFrontmatter is the same value but kept for symmetry). */
  name: string;
  /** "backlog" | "active" | "paused" | "complete" | "archived" | ... */
  status: string;
  goal_id?: string;
  lead_agent_id?: string;
  /** ISO 8601 date (no time). */
  target_date?: string;
  archived?: boolean;
}
