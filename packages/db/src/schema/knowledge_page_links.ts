import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { knowledgePages } from "./knowledge_pages.js";

/**
 * Wikilink graph for knowledge pages.
 *
 * Each row models a single [[...]] reference from one page to either a
 * resolved page (`toId`) or an unresolved slug (`unresolvedSlug`). The
 * SQL-level CHECK constraint `knowledge_page_links_target_xor` enforces
 * that exactly one of those two columns is set; we don't reproduce that
 * invariant in Drizzle types, so callers must respect it at write time.
 *
 * `anchor` captures the optional `#section` portion of the link target.
 * Forward traversal hits `fromIdx`; backlinks ("what links here") hit
 * `toIdx`. Unresolved-slug lookups (used when a page is created and we
 * need to promote dangling links pointing at its slug) hit
 * `unresolvedIdx` scoped by `companyId`.
 *
 * The two unique indexes dedupe identical edges -- one branch per
 * resolved-vs-unresolved state. Anchor participates in uniqueness so the
 * same source page can legitimately link to multiple anchors on the same
 * target.
 */
export const knowledgePageLinks = pgTable(
  "knowledge_page_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromId: uuid("from_id")
      .notNull()
      .references(() => knowledgePages.id, { onDelete: "cascade" }),
    toId: uuid("to_id").references(() => knowledgePages.id, { onDelete: "cascade" }),
    unresolvedSlug: text("unresolved_slug"),
    anchor: text("anchor"),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    fromIdx: index("knowledge_page_links_from_idx").on(t.fromId),
    toIdx: index("knowledge_page_links_to_idx").on(t.toId),
    unresolvedIdx: index("knowledge_page_links_unresolved_idx").on(t.companyId, t.unresolvedSlug),
    uniqResolved: uniqueIndex("knowledge_page_links_uniq_resolved").on(t.fromId, t.toId, t.anchor),
    uniqUnresolved: uniqueIndex("knowledge_page_links_uniq_unresolved").on(t.fromId, t.unresolvedSlug, t.anchor),
  }),
);

export type KnowledgePageLink = typeof knowledgePageLinks.$inferSelect;
export type NewKnowledgePageLink = typeof knowledgePageLinks.$inferInsert;
