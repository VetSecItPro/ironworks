export type { AgentFrontmatter } from "./agent.js";
export type { BaseFrontmatter, EntityType } from "./base.js";
export type { DecisionFrontmatter } from "./decision.js";
export type { IssueFrontmatter } from "./issue.js";
export type { KnowledgeFrontmatter } from "./knowledge.js";
export { parseFrontmatter } from "./parse.js";
export type { ProjectFrontmatter } from "./project.js";
export { renderFrontmatter } from "./render.js";
export type { RunFrontmatter } from "./run.js";
export type { SkillFrontmatter } from "./skill.js";

import type { AgentFrontmatter } from "./agent.js";
import type { DecisionFrontmatter } from "./decision.js";
import type { IssueFrontmatter } from "./issue.js";
import type { KnowledgeFrontmatter } from "./knowledge.js";
import type { ProjectFrontmatter } from "./project.js";
import type { RunFrontmatter } from "./run.js";
import type { SkillFrontmatter } from "./skill.js";

/**
 * Discriminated union over all 7 entity-specific frontmatter shapes.
 * Narrow via the `type` literal: `if (fm.type === "knowledge") { ... }`.
 */
export type AnyFrontmatter =
  | KnowledgeFrontmatter
  | DecisionFrontmatter
  | SkillFrontmatter
  | AgentFrontmatter
  | ProjectFrontmatter
  | IssueFrontmatter
  | RunFrontmatter;
