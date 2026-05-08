/**
 * Canonical entity-type discriminator. Every Frontmatter shape sets `type` to
 * one of these literals so downstream code (export, import, vault render)
 * can route via a discriminated union.
 */
export type EntityType = "knowledge" | "decision" | "skill" | "agent" | "project" | "issue" | "run" | "cost_rollup";

/**
 * Fields shared by every entity's frontmatter. All other Frontmatter
 * interfaces extend this and narrow `type` to a literal.
 *
 * `created_at` / `updated_at` are ISO 8601 strings (not Date) because
 * frontmatter is serialized to YAML and YAML strings round-trip cleanly.
 */
export interface BaseFrontmatter {
  id: string;
  type: EntityType;
  title: string;
  /** ISO 8601 timestamp. */
  created_at: string;
  /** ISO 8601 timestamp. */
  updated_at: string;
  tags?: string[];
  visibility?: "company" | "project" | "private";
}
