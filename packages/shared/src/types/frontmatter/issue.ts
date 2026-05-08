import type { BaseFrontmatter } from "./base.js";

/**
 * Frontmatter for an issue (UI: "Mission"). Captures status, priority,
 * routing (project + parent + assignee), origin provenance, and the human
 * identifier so a vault reader can find the issue without DB access.
 */
export interface IssueFrontmatter extends BaseFrontmatter {
  type: "issue";
  /** "backlog" | "todo" | "in_progress" | "in_review" | "blocked" | "done" | "cancelled" | ... */
  status: string;
  /** "low" | "medium" | "high" | "urgent" | ... */
  priority: string;
  /** Public identifier (e.g. "ENG-123"); separate from `id` (UUID). */
  identifier?: string;
  issue_number?: number;
  project_id?: string;
  parent_id?: string;
  assignee_agent_id?: string;
  assignee_user_id?: string;
  /** "manual" | "routine_execution" | "incoming_email" | ... */
  origin_kind: string;
  /** ISO 8601 timestamp; deadline urgency cue. */
  target_date?: string;
  depends_on?: string[];
}
