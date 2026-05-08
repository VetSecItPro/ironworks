import type { BaseFrontmatter } from "./base.js";

/**
 * Frontmatter for a company skill (markdown-defined skill packaged with the
 * company). Mirrors the most identifying columns of `company_skills` —
 * key/slug for routing, source provenance, trust + compatibility flags so
 * vault consumers can filter out untrusted or incompatible entries.
 */
export interface SkillFrontmatter extends BaseFrontmatter {
  type: "skill";
  /** Stable lookup key (unique per company). */
  key: string;
  slug: string;
  /** "local_path" | "git" | "registry" | ... — string literal kept open-ended. */
  source_type: string;
  source_locator?: string;
  source_ref?: string;
  /** "markdown_only" | "verified" | "trusted" | ... */
  trust_level: string;
  /** "compatible" | "incompatible" | "unknown" | ... */
  compatibility: string;
  /** "authored" | "extracted" | "seeded" | ... */
  origin: string;
}
