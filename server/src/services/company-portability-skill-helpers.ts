// Skill-related helpers for the company-portability domain: key derivation,
// org-chart construction from manifest, skill source-entry building, and
// skill markdown rendering.

import type { CompanyPortabilityManifest, CompanySkill } from "@ironworksai/shared";
import { normalizeAgentUrlKey } from "@ironworksai/shared";
import { type OrgNode } from "../routes/org-chart-svg.js";
import { asString, isPlainRecord, resolveBundledSkillsCommit } from "./company-portability-defaults.js";

/** Build OrgNode tree from manifest agent list (slug + reportsToSlug). */
export function buildOrgTreeFromManifest(agents: CompanyPortabilityManifest["agents"]): OrgNode[] {
  const ROLE_LABELS: Record<string, string> = {
    ceo: "Chief Executive",
    cto: "Technology",
    cmo: "Marketing",
    cfo: "Finance",
    coo: "Operations",
    vp: "VP",
    manager: "Manager",
    engineer: "Engineer",
    agent: "Agent",
  };
  const bySlug = new Map(agents.map((a) => [a.slug, a]));
  const childrenOf = new Map<string | null, typeof agents>();
  for (const a of agents) {
    const parent = a.reportsToSlug ?? null;
    const list = childrenOf.get(parent) ?? [];
    list.push(a);
    childrenOf.set(parent, list);
  }
  const build = (parentSlug: string | null): OrgNode[] => {
    const members = childrenOf.get(parentSlug) ?? [];
    return members.map((m) => ({
      id: m.slug,
      name: m.name,
      role: ROLE_LABELS[m.role] ?? m.role,
      status: "active",
      reports: build(m.slug),
    }));
  };
  // Find roots: agents whose reportsToSlug is null or points to a non-existent slug
  const roots = agents.filter((a) => !a.reportsToSlug || !bySlug.has(a.reportsToSlug));
  const _rootSlugs = new Set(roots.map((r) => r.slug));
  // Start from null parent, but also include orphans
  const tree = build(null);
  for (const root of roots) {
    if (root.reportsToSlug && !bySlug.has(root.reportsToSlug)) {
      // Orphan root (parent slug doesn't exist)
      tree.push({
        id: root.slug,
        name: root.name,
        role: ROLE_LABELS[root.role] ?? root.role,
        status: "active",
        reports: build(root.slug),
      });
    }
  }
  return tree;
}

export function normalizeSkillSlug(value: string | null | undefined) {
  return value ? (normalizeAgentUrlKey(value) ?? null) : null;
}

export function normalizeSkillKey(value: string | null | undefined) {
  if (!value) return null;
  const segments = value
    .split("/")
    .map((segment) => normalizeSkillSlug(segment))
    .filter((segment): segment is string => Boolean(segment));
  return segments.length > 0 ? segments.join("/") : null;
}

export function readSkillKey(frontmatter: Record<string, unknown>) {
  const metadata = isPlainRecord(frontmatter.metadata) ? frontmatter.metadata : null;
  const ironworks = isPlainRecord(metadata?.ironworks) ? (metadata?.ironworks as Record<string, unknown>) : null;
  return normalizeSkillKey(
    asString(frontmatter.key) ??
      asString(frontmatter.skillKey) ??
      asString(metadata?.skillKey) ??
      asString(metadata?.canonicalKey) ??
      asString(metadata?.ironworksSkillKey) ??
      asString(ironworks?.skillKey) ??
      asString(ironworks?.key),
  );
}

export function deriveManifestSkillKey(
  frontmatter: Record<string, unknown>,
  fallbackSlug: string,
  metadata: Record<string, unknown> | null,
  sourceType: string,
  sourceLocator: string | null,
) {
  const explicit = readSkillKey(frontmatter);
  if (explicit) return explicit;
  const slug = normalizeSkillSlug(asString(frontmatter.slug) ?? fallbackSlug) ?? "skill";
  const sourceKind = asString(metadata?.sourceKind);
  const owner = normalizeSkillSlug(asString(metadata?.owner));
  const repo = normalizeSkillSlug(asString(metadata?.repo));
  if (
    (sourceType === "github" || sourceType === "skills_sh" || sourceKind === "github" || sourceKind === "skills_sh") &&
    owner &&
    repo
  ) {
    return `${owner}/${repo}/${slug}`;
  }
  if (sourceKind === "ironworks_bundled") {
    return `ironworksai/ironworks/${slug}`;
  }
  if (sourceType === "url" || sourceKind === "url") {
    try {
      const host = normalizeSkillSlug(sourceLocator ? new URL(sourceLocator).host : null) ?? "url";
      return `url/${host}/${slug}`;
    } catch {
      return `url/unknown/${slug}`;
    }
  }
  return slug;
}

export async function buildSkillSourceEntry(skill: CompanySkill) {
  const metadata = isPlainRecord(skill.metadata) ? skill.metadata : null;
  if (asString(metadata?.sourceKind) === "ironworks_bundled") {
    const commit = await resolveBundledSkillsCommit();
    return {
      kind: "github-dir",
      repo: "ironworksai/ironworks",
      path: `skills/${skill.slug}`,
      commit,
      trackingRef: "master",
      url: `https://github.com/ironworksai/ironworks/tree/master/skills/${skill.slug}`,
    };
  }

  if (skill.sourceType === "github" || skill.sourceType === "skills_sh") {
    const owner = asString(metadata?.owner);
    const repo = asString(metadata?.repo);
    const repoSkillDir = asString(metadata?.repoSkillDir);
    if (!owner || !repo || !repoSkillDir) return null;
    return {
      kind: "github-dir",
      repo: `${owner}/${repo}`,
      path: repoSkillDir,
      commit: skill.sourceRef ?? null,
      trackingRef: asString(metadata?.trackingRef),
      url: skill.sourceLocator,
    };
  }

  if (skill.sourceType === "url" && skill.sourceLocator) {
    return {
      kind: "url",
      url: skill.sourceLocator,
    };
  }

  return null;
}

export function shouldReferenceSkillOnExport(skill: CompanySkill, expandReferencedSkills: boolean) {
  if (expandReferencedSkills) return false;
  const metadata = isPlainRecord(skill.metadata) ? skill.metadata : null;
  if (asString(metadata?.sourceKind) === "ironworks_bundled") return true;
  return skill.sourceType === "github" || skill.sourceType === "skills_sh" || skill.sourceType === "url";
}

export function readAgentSkillRefs(frontmatter: Record<string, unknown>) {
  const skills = frontmatter.skills;
  if (!Array.isArray(skills)) return [];
  return Array.from(
    new Set(
      skills
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => normalizeSkillKey(entry) ?? entry.trim())
        .filter(Boolean),
    ),
  );
}
