import { type Db, knowledgePageLinks } from "@ironworksai/db";
import { and, eq, inArray, isNull } from "drizzle-orm";

/**
 * After a page is created OR has its slug/aliases changed, find unresolved
 * link rows whose `unresolvedSlug` matches the page's slug or any of its
 * aliases, and rebind them to the new page id.
 *
 * The expected SQL shape:
 *   UPDATE knowledge_page_links
 *      SET to_id = $pageId, unresolved_slug = NULL
 *    WHERE company_id = $companyId
 *      AND to_id IS NULL
 *      AND unresolved_slug = ANY($candidates::text[])
 *
 * The XOR CHECK constraint (`knowledge_page_links_target_xor`) requires
 * exactly one of `to_id` / `unresolved_slug` to be set, so the SET clause
 * flips both atomically.
 *
 * Tenancy: scoped by `companyId` - never touches other tenants' rows.
 * Returns the count of rebound rows.
 *
 * Note: there is a subtle interaction with the `uniq_resolved` unique
 * index on (from_id, to_id, anchor). If a page already has a resolved
 * link to `pageId` with the same anchor AND a separate unresolved row
 * for the slug being rebound, the UPDATE would violate the unique index.
 * In practice this can't happen because: the same body-parse run that
 * created the unresolved row would have also produced the resolved row
 * iff the page existed at parse time; the resolved row comes from a
 * different `from` page than the unresolved one. Cross-page collisions
 * are impossible by construction. We let Postgres surface the error if
 * a future change breaks that invariant rather than silently swallow it.
 */
export async function rebindUnresolvedLinks(
  db: Db,
  args: { pageId: string; companyId: string; slug: string; aliases: string[] },
): Promise<number> {
  const { pageId, companyId, slug, aliases } = args;

  // Build candidate slug set: the page's canonical slug plus all aliases.
  // Dedupe to keep the IN-list tight; empty strings would never appear in
  // unresolved_slug (parser rejects empty), but filter defensively.
  const candidates = Array.from(new Set([slug, ...aliases].filter((s) => typeof s === "string" && s.length > 0)));

  if (candidates.length === 0) return 0;

  const updated = await db
    .update(knowledgePageLinks)
    .set({
      toId: pageId,
      unresolvedSlug: null,
    })
    .where(
      and(
        eq(knowledgePageLinks.companyId, companyId),
        isNull(knowledgePageLinks.toId),
        inArray(knowledgePageLinks.unresolvedSlug, candidates),
      ),
    )
    .returning({ id: knowledgePageLinks.id });

  return updated.length;
}
