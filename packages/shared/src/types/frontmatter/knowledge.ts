import type { BaseFrontmatter } from "./base.js";

export interface KnowledgeFrontmatter extends BaseFrontmatter {
  type: "knowledge";
  slug: string;
  /**
   * Prior slugs this knowledge entry has been known by. Allows links written
   * against an old slug to still resolve after a rename. Optional + absent by
   * default; render strips undefined so unset entries don't emit `aliases: null`.
   */
  aliases?: string[];
  document_type?: string;
  department?: string;
  deliverable_status?: string;
  auto_generated: boolean;
  revision_number: number;
  agent_id?: string;
  project_id?: string;
}
