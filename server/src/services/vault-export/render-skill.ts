import type { companySkills } from "@ironworksai/db";
import { renderFrontmatter, type SkillFrontmatter } from "@ironworksai/shared";
import type { RenderedFile } from "./render-knowledge.js";

export type CompanySkill = typeof companySkills.$inferSelect;

/**
 * Convert the skill's display name into a filesystem-safe path segment.
 * Mirrors `slugifyAgentName`: lower-case, dash-collapse non-alphanumerics,
 * trim edges. Falls back to the row's `slug` column when name collapses to
 * empty (the schema column is non-null so this is always a valid backup).
 *
 * We don't pre-strip an "unsafe chars" set first; the `[^a-z0-9]+ → -`
 * collapse already covers every hostile char by mapping it to dash, which
 * preserves word boundaries (`foo:bar` → `foo-bar`, not `foobar`).
 */
export function slugifySkillName(name: string, fallbackSlug: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : fallbackSlug;
}

/**
 * Render a `company_skills` row to `skills/<name-slug>.md`. Pure: caller
 * loads the row, we emit canonical frontmatter + the markdown body verbatim.
 */
export function renderSkill(skill: CompanySkill): RenderedFile {
  const nameSlug = slugifySkillName(skill.name, skill.slug);

  const fm: SkillFrontmatter = {
    id: skill.id,
    type: "skill",
    title: skill.name,
    key: skill.key,
    slug: skill.slug,
    source_type: skill.sourceType,
    trust_level: skill.trustLevel,
    compatibility: skill.compatibility,
    origin: skill.origin,
    created_at: skill.createdAt.toISOString(),
    updated_at: skill.updatedAt.toISOString(),
  };
  if (skill.sourceLocator) fm.source_locator = skill.sourceLocator;
  if (skill.sourceRef) fm.source_ref = skill.sourceRef;

  const frontmatter = renderFrontmatter(fm);
  // The `markdown` column is the source-of-truth body the user wrote in the
  // skills UI (or that the extraction loop produced). We pass it through
  // verbatim so the round-trip is byte-identical post-frontmatter.
  const body = skill.markdown ?? "";
  const content = `${frontmatter}\n${body}${body.endsWith("\n") ? "" : "\n"}`;

  return {
    path: `skills/${nameSlug}.md`,
    content,
  };
}
