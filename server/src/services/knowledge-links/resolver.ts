import { type Db, knowledgePages } from "@ironworksai/db";
import { and, arrayOverlaps, eq, inArray, or } from "drizzle-orm";
import type { ParsedLink } from "./parser.js";

export interface ResolvedLink {
  /** Resolved page id, OR null if slug not found in this company. */
  toId: string | null;
  /** Original slug as written; preserved for unresolved storage. */
  slug: string;
  anchor: string | null;
}

interface PageRow {
  id: string;
  slug: string;
  aliases: string[] | null;
  createdAt: Date;
}

/**
 * Resolve parsed wikilinks to page IDs within a company.
 *
 * Slugs match by `knowledge_pages.slug` OR by entries in the denormalized
 * `aliases` column (populated by write-paths from YAML frontmatter).
 *
 * Multi-alias collision rule: first-created page wins (ORDER BY created_at ASC).
 * Lookup is scoped by `companyId` - cross-tenant matches are excluded.
 *
 * Empty input short-circuits without a query.
 */
export async function resolveLinks(db: Db, companyId: string, parsed: ParsedLink[]): Promise<ResolvedLink[]> {
  if (parsed.length === 0) return [];

  // Distinct slugs to query (parser already dedupes (slug, anchor) tuples,
  // but the same slug may appear with multiple anchors - fetch once).
  const slugs = Array.from(new Set(parsed.map((p) => p.slug)));

  const rows = (await db
    .select({
      id: knowledgePages.id,
      slug: knowledgePages.slug,
      aliases: knowledgePages.aliases,
      createdAt: knowledgePages.createdAt,
    })
    .from(knowledgePages)
    .where(
      and(
        eq(knowledgePages.companyId, companyId),
        or(
          inArray(knowledgePages.slug, slugs),
          // Postgres array overlap (`&&`): pages whose aliases intersect query slugs.
          arrayOverlaps(knowledgePages.aliases, slugs),
        ),
      ),
    )) as PageRow[];

  // Build slug -> winning page id map. First-by-created_at wins on collision.
  // Sort rows ascending so later set() calls don't overwrite earlier (winning) ones.
  const sorted = [...rows].sort((a, b) => {
    const ta = a.createdAt.getTime();
    const tb = b.createdAt.getTime();
    return ta - tb;
  });

  const slugToId = new Map<string, string>();
  for (const row of sorted) {
    // Direct slug match - only set if not already taken by an earlier-created page.
    if (!slugToId.has(row.slug)) {
      slugToId.set(row.slug, row.id);
    }
    // Alias matches - same first-wins rule.
    for (const alias of row.aliases ?? []) {
      if (!slugToId.has(alias)) {
        slugToId.set(alias, row.id);
      }
    }
  }

  return parsed.map((p) => ({
    slug: p.slug,
    anchor: p.anchor,
    toId: slugToId.get(p.slug) ?? null,
  }));
}
