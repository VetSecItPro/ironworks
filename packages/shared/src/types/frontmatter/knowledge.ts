import type { BaseFrontmatter } from "./base.js";

export interface KnowledgeFrontmatter extends BaseFrontmatter {
  type: "knowledge";
  slug: string;
  document_type?: string;
  department?: string;
  deliverable_status?: string;
  auto_generated: boolean;
  revision_number: number;
  agent_id?: string;
  project_id?: string;
}
