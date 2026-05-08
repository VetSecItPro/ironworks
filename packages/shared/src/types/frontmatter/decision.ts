import type { BaseFrontmatter } from "./base.js";

export interface DecisionFrontmatter extends BaseFrontmatter {
  type: "decision";
  decision_id: string;
  status: "proposed" | "accepted" | "superseded" | "deprecated";
  context_issue_id?: string;
  decided_by_agent_id?: string;
  alternatives_considered?: string[];
  consequences?: string[];
}
