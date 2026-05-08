# Design Spec: Memory Upgrade Phase 1 — Cross-doc Link Graph

**Date:** 2026-05-08
**Approach:** A (ID-resolved + frontmatter aliases) + X (reactflow) + janitor self-heal
**Status:** APPROVED

---

## Problem

Phase 1 of the Memory + Knowledge Layer Upgrade (`ironworks-memory-upgrade.md`). After P0 shipped (PR #183) the memory layer can do semantic search, but the knowledge base itself is still a pile of disconnected markdown pages — no `[[wikilink]]` resolver, no backlinks, no graph navigation. This is the unique unlock both research reports flagged as the highest-leverage win after embeddings.

## Goal

After P1:

- Authors can write `[[some-slug]]` or `[[some-slug#anchor]]` in any knowledge page body and have it resolve to the right page on save (not at render time).
- Every knowledge page has a "Linked from N pages" sidebar showing inbound links with one click to navigate.
- Every knowledge page has a 1-2 hop force-directed graph view (inbound + outbound neighbors) with click-to-navigate.
- Renames don't break links: `to_id` is FK-locked, and `aliases: []` on frontmatter lets renamed pages keep accepting incoming `[[old-slug]]` text from other authors' bodies.
- Unresolved slugs persist as visible broken-link placeholders that auto-rebind when the target is created.

## Non-Goals

- ❌ NOT a global graph view (just 1-2 hop neighborhoods per page)
- ❌ NOT auto-rewriting other authors' bodies when a target page renames (Approach C from brainstorm — rejected)
- ❌ NOT a separate KnowledgeBase router or page reorganization
- ❌ NOT touching agent memory — this is purely the knowledge_pages graph
- ❌ NOT changing how `knowledge_chunks` (P0 chunking) works
- ❌ NOT supporting cross-company links (links are scoped per company; same-company only)

## Approach

### High-level architecture

```
                       knowledge.create()
                       knowledge.update()
                       knowledge.revertToRevision()
                              │
                              ▼
                  ┌─────────────────────────┐
                  │ extractWikilinks(body)  │ ─── pure function
                  │ → ParsedLink[]           │
                  │   { slug, anchor }       │
                  └────────┬────────────────┘
                           ▼
              ┌────────────────────────────┐
              │ resolveLinks(db, page,     │
              │              parsedLinks)  │
              │   for each parsed link:    │
              │     - lookup slug by       │
              │       (slug, aliases[])    │
              │     - if hit  → to_id      │
              │     - if miss → unresolved │
              └────────┬───────────────────┘
                       ▼
              ┌────────────────────────────┐
              │ syncPageLinks(db, page,    │
              │               resolved)    │
              │   - DELETE rows where      │
              │     from_id=page.id AND    │
              │     not in new set         │
              │   - INSERT new rows        │
              │   - upsert on              │
              │     (from_id, to_id|       │
              │      unresolved, anchor)   │
              └────────────────────────────┘

  knowledge.create() also runs:
              ┌────────────────────────────┐
              │ rebindUnresolvedLinks(     │
              │   db, page)                │
              │   - any pending broken     │
              │     row whose unresolved_  │
              │     slug matches new       │
              │     page.slug or aliases   │
              │     gets to_id rebound,    │
              │     unresolved_slug        │
              │     cleared                │
              └────────────────────────────┘

  Page rename (knowledge.update with slug change):
              same syncPageLinks runs because body
              of THIS page may reference itself; +
              we re-run rebindUnresolvedLinks(db,
              page) so previously-broken inbound
              links latching onto the new slug
              snap to alive.
```

### Why ID-resolved over slug-resolved

The upgrade doc says "FK is by id, not slug." Storing `to_id` makes renames inherently safe — the FK never points at a moving target. The cost is that the body text `[[old-slug]]` may go stale visually after a rename. We accept this because:

- Rendering can show the canonical title from `to_id` instead of the literal slug, masking the staleness.
- Frontmatter `aliases: ["old-slug"]` lets the author opt-in to redirects so other authors' bodies still resolve.
- Auto-rewriting bodies (Approach C) creates revision churn and conflicts with concurrent edits — explicit non-goal.

### Why a janitor on create

When page A's body says `[[some-future-slug]]` and that target doesn't exist yet, we don't want a write to fail. We persist a row with `to_id = NULL, unresolved_slug = "some-future-slug"`. When page B is later created with that slug (or aliases it), `rebindUnresolvedLinks` sets `to_id = B.id` and clears `unresolved_slug`. Self-healing without periodic crons.

### Why reactflow

`@xyflow/react` (the modern reactflow package name) is React-first, ~40KB gzipped, supports force-directed layouts via `dagre` or built-in elk, has TypeScript types, and matches the codebase's component style. 1-2 hop graphs (typically <30 nodes) are well within its perf envelope.

## Architecture

### Components to Create

| Component | Path | Purpose |
|---|---|---|
| `knowledge_page_links` migration | `packages/db/src/migrations/NNNN_knowledge_page_links.sql` | Forward-only CREATE TABLE + indexes |
| `knowledge_page_links` schema | `packages/db/src/schema/knowledge_page_links.ts` | Drizzle schema + Insert/Select types |
| Wikilink parser | `server/src/services/knowledge-links/parser.ts` | `extractWikilinks(body): ParsedLink[]` |
| Link resolver | `server/src/services/knowledge-links/resolver.ts` | `resolveLinks(db, companyId, parsedLinks): ResolvedLink[]` |
| Link sync | `server/src/services/knowledge-links/sync.ts` | `syncPageLinks(db, page, resolvedLinks)` (insert/delete diff) |
| Janitor | `server/src/services/knowledge-links/janitor.ts` | `rebindUnresolvedLinks(db, page)` |
| Backlinks query | `server/src/services/knowledge-links/queries.ts` | `getBacklinks(db, pageId)`, `getNeighborhood(db, pageId, hops=2)` |
| Backlinks route | `server/src/routes/knowledge-links.ts` | `GET /knowledge-pages/:id/backlinks`, `GET /knowledge-pages/:id/graph` |
| Backlinks panel | `ui/src/components/library/KnowledgePageBacklinks.tsx` | Sidebar panel rendering "Linked from N pages" |
| Graph view | `ui/src/components/library/KnowledgePageGraph.tsx` | reactflow-driven 1-2 hop graph |
| API client | extend `ui/src/api/knowledge.ts` | `knowledgeApi.getBacklinks(id)`, `knowledgeApi.getGraph(id)` |
| Tests | `server/src/services/knowledge-links/__tests__/*.test.ts` (5 files) | Unit + integration coverage |
| Test | `server/src/__tests__/knowledge-links-route.test.ts` | Route integration |
| Test | `ui/src/components/library/__tests__/KnowledgePageBacklinks.test.tsx` | UI render + interaction |
| Test | `ui/src/components/library/__tests__/KnowledgePageGraph.test.tsx` | UI render + click-to-navigate |

### Components to Modify

| File | What Changes | Why |
|---|---|---|
| `packages/db/src/schema/index.ts` | Export `knowledgePageLinks` | Drizzle registry |
| `packages/shared/src/types/frontmatter/knowledge.ts` | Add optional `aliases?: string[]` field | P0 frontmatter extends with rename-redirect support |
| `server/src/services/knowledge.ts` | After successful `create`, `update`, `revertToRevision`: call `extractWikilinks` → `resolveLinks` → `syncPageLinks`. After `create`: also call `rebindUnresolvedLinks`. After `update`: if slug changed, also call `rebindUnresolvedLinks` for the new slug + aliases. | Wire write path |
| `server/src/app.ts` | Register `knowledgeLinksRoutes` router | Surface backlinks/graph endpoints |
| `ui/src/components/library/KnowledgePageViewer.tsx` | Add `<KnowledgePageBacklinks pageId={pageId}>` sidebar + tab/toggle for `<KnowledgePageGraph pageId={pageId}>` | Surface UI |
| `ui/src/api/knowledge.ts` | Add backlinks + graph fetchers | Client API |
| `ui/package.json` | Add `@xyflow/react` dep | Graph rendering |
| `pnpm-lock.yaml` | Updated by add | Lockfile |
| `CHANGELOG.md` `[Unreleased]` | "Added: cross-doc `[[wikilink]]` parser, knowledge_page_links table, backlinks API + UI panel, 1-2 hop graph view, frontmatter `aliases` for rename redirects" | Release trail |

### Data Model

```typescript
// packages/db/src/schema/knowledge_page_links.ts
export const knowledgePageLinks = pgTable(
  "knowledge_page_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromId: uuid("from_id")
      .notNull()
      .references(() => knowledgePages.id, { onDelete: "cascade" }),
    /** Resolved target page; NULL when unresolved (target slug doesn't exist yet). */
    toId: uuid("to_id").references(() => knowledgePages.id, { onDelete: "cascade" }),
    /** Slug text as written when the link couldn't resolve. NULL when toId is set. */
    unresolvedSlug: text("unresolved_slug"),
    /** Optional anchor (the part after #). NULL means link points at whole page. */
    anchor: text("anchor"),
    /** companyId denormalized for tenant-scoped queries (avoids join through knowledge_pages). */
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Either toId or unresolvedSlug must be set, not both — enforced via app-layer assertion
    // (Drizzle CHECK constraints aren't standard; document in migration SQL)
    fromIdx: index("knowledge_page_links_from_idx").on(t.fromId),
    toIdx: index("knowledge_page_links_to_idx").on(t.toId), // backlinks query
    unresolvedIdx: index("knowledge_page_links_unresolved_idx").on(t.companyId, t.unresolvedSlug),
    // Same (from, to|unresolved, anchor) combo can only appear once
    uniqResolved: uniqueIndex("knowledge_page_links_uniq_resolved").on(t.fromId, t.toId, t.anchor),
    uniqUnresolved: uniqueIndex("knowledge_page_links_uniq_unresolved").on(t.fromId, t.unresolvedSlug, t.anchor),
  }),
);
```

The migration SQL adds:
```sql
ALTER TABLE knowledge_page_links
  ADD CONSTRAINT knowledge_page_links_target_xor_unresolved
  CHECK ((to_id IS NOT NULL) <> (unresolved_slug IS NOT NULL));
```

### Frontmatter extension

```typescript
// packages/shared/src/types/frontmatter/knowledge.ts
export interface KnowledgeFrontmatter extends BaseFrontmatter {
  type: "knowledge";
  slug: string;
  aliases?: string[];        // NEW — old slugs that still resolve to this page
  document_type?: string;
  // ...rest unchanged
}
```

### API

| Endpoint | Method | Input | Output |
|---|---|---|---|
| `/knowledge-pages/:id/backlinks` | GET | `:id` | `{ backlinks: Array<{ pageId, slug, title, anchor, documentType }> }` ordered by source page `updated_at` desc |
| `/knowledge-pages/:id/graph` | GET | `:id`, `?hops=1\|2` (default 2) | `{ nodes: Array<{ id, slug, title, isCurrent }>, edges: Array<{ from, to, anchor, isUnresolved }> }` |

Both routes use the existing actor-middleware + tenant scoping. Page must be visible to the actor per existing `knowledge_pages.visibility` rules.

## User Flow

### Author writing a wikilink
1. Author edits page `engineering/api-conventions` and writes `See [[engineering/error-handling#5xx]] for retry policy.`
2. On save, `knowledge.update` runs.
3. `extractWikilinks(body)` returns `[{ slug: "engineering/error-handling", anchor: "5xx" }]`.
4. `resolveLinks` looks up the slug — finds page id `abc-123`.
5. `syncPageLinks` inserts row `(from_id=current.id, to_id=abc-123, anchor='5xx')`.
6. Done — no UI change visible yet.

### Reader viewing a page with backlinks
1. Reader navigates to `engineering/error-handling`.
2. `KnowledgePageViewer` renders body + sidebar.
3. Sidebar fires `GET /knowledge-pages/:id/backlinks` → "Linked from 3 pages: api-conventions, retry-policy-rfc, runbook-incident-flow".
4. Reader clicks "api-conventions" → navigates to that page.

### Reader viewing the graph
1. Reader clicks "Graph" toggle on the same page.
2. `KnowledgePageGraph` fires `GET /knowledge-pages/:id/graph?hops=2`.
3. reactflow renders force-directed graph: current page in center, 1-hop neighbors as a ring, 2-hop as outer ring.
4. Click any node → navigate to that page.

### Author renaming a page
1. Author renames `engineering/error-handling` to `engineering/errors-and-retries` and adds `aliases: ["engineering/error-handling"]` in frontmatter.
2. `knowledge.update` runs — slug change triggers re-resolution of THIS page's body (in case it self-references) AND a `rebindUnresolvedLinks` pass to claim any previously broken links matching the old slug or new slug.
3. Other pages' bodies still say `[[engineering/error-handling]]` literally; their `knowledge_page_links` rows still point to `to_id=abc-123` (unaffected by slug rename). Display can lookup current slug from `to_id`.

### Future page resolves a broken link
1. Page A has `[[future-spec]]` in body. Saved with `unresolved_slug='future-spec'`.
2. Days later, page B is created with `slug='future-spec'`.
3. `rebindUnresolvedLinks(db, B)` sets the row's `to_id = B.id`, clears `unresolved_slug`.
4. UI now shows the link as alive.

## Edge Cases

| Case | Behavior |
|---|---|
| `[[]]` empty wikilink | Parser ignores (no slug present) |
| `[[ slug with spaces ]]` | Parser trims; if internal whitespace remains, treats as unresolved (slugs don't have whitespace) |
| `[[slug#anchor]]` | `anchor='anchor'` stored; resolved to same page row but with anchor field set |
| `[[slug#]]` (trailing hash, no anchor) | Anchor stripped to NULL |
| `[[slug]]` matching multiple aliases on different pages | First-match wins by `pages.created_at ASC` (stable, deterministic). Authors should resolve aliasing collisions; not our problem to enumerate. |
| Page deleted | `ON DELETE CASCADE` on `from_id` removes outbound rows; `ON DELETE CASCADE` on `to_id` removes inbound rows. Bodies referencing deleted pages become unresolved — caller of next syncPageLinks (i.e., next save of the source page) will detect and store as unresolved. |
| Page revisionRevert | Same flow as update; `syncPageLinks` runs on the reverted body |
| Cross-company link attempt (`[[other-company/slug]]`) | Not supported — slug lookup is scoped by `companyId`. Any unmatched cross-tenant text becomes unresolved. |
| Author writes 100 wikilinks in one body | Parser caps at 200 distinct links per page (sanity limit; logs warning if exceeded) |
| Body content unchanged on save | `syncPageLinks` is idempotent — diff produces no DB writes |
| Duplicate `[[slug]] ... [[slug]]` in same body | Stored as one row (uniqueness on `(from_id, to_id, anchor)`) |
| Same slug with different anchors `[[slug#a]] [[slug#b]]` | Stored as two rows |
| Self-link `[[my-own-slug]]` | Stored normally (`to_id == from_id`) — graph view shows self-edge |
| Janitor performance: page A creates and rebinds 1000 unresolved links | Single UPDATE with `WHERE unresolved_slug = ANY($aliases)` — index `knowledge_page_links_unresolved_idx` makes it fast |
| Aliases collision: two pages claim the same alias | First-created page wins on rebind; second page's `aliases` is silently inert. Document in user-facing CHANGELOG. |
| Concurrent edits to the same page | Existing `knowledge.update` locking applies; `syncPageLinks` runs inside the same call sequence. Last write wins for body content; link rows reflect the winning body. |
| Frontmatter parse failure (legacy MD without YAML header) | `aliases` defaults to `[]`; everything still works |
| Graph endpoint with hops=0 | Returns just the current page node, zero edges (sanity case for clients) |
| Graph endpoint with hops=3+ | Capped at 2 server-side; param-out-of-range returns 400 |

## Constraints

- **No regressions to existing knowledge.ts behavior.** All current `knowledge.test.ts` tests pass without modification.
- **No latency tax > 50ms p95** on `knowledge.create/update`. The link sync is a single SELECT + bounded INSERT/DELETE batch; under 200 links per page this is well within budget.
- **Tenant safety.** All queries scoped by `companyId`. Cross-tenant slug lookup is impossible by construction.
- **Visibility honored.** The graph endpoint only returns nodes the actor can see (per existing `knowledge_pages.visibility` rules — same filter the read path uses).
- **No `as any`.**
- **Tests ship with code.** ~30+ new tests across parser/resolver/sync/janitor/queries/route/UI.
- **TDD per task.** Failing test first.
- **Steel Principle #7 (no tech debt).**

## Testing Strategy

- **Parser unit tests:** all bracket forms, anchor variants, edge cases, the 200-link cap, malformed brackets, code fence exclusion (don't parse `[[foo]]` inside ```` ``` ```` blocks).
- **Resolver unit tests:** slug match, alias match, miss → unresolved, multi-alias collision (deterministic first-match), cross-tenant exclusion.
- **Sync unit tests:** insert new, delete removed, update unchanged (idempotent no-op), anchor diff, dedup duplicate links in same body.
- **Janitor integration:** create page that rebinds N pending links; assert all rebound; assert non-matching slugs untouched.
- **Queries integration:** seed graph of 5 pages with edges; assert `getBacklinks(p3)` returns inbound only; assert `getNeighborhood(p3, hops=2)` returns expected node + edge sets.
- **Route integration:** auth + visibility scoping + 200/404 paths.
- **UI render tests:** backlinks panel renders empty state + populated state; click navigates. Graph renders nodes + edges; click navigates.
- **End-to-end flow:** create A with `[[B]]` (unresolved) → create B → assert backlinks(B) shows A.

## Rollout

1. Ship migration + Drizzle schema + frontmatter type extension (no behavior change yet).
2. Ship parser/resolver/sync/janitor + tests.
3. Wire write paths in `knowledge.ts`. New pages created from this point will populate links; existing pages still have empty link tables.
4. Ship route + UI components.
5. Run a backfill script `scripts/backfill-knowledge-links.ts` (mirror P0's `backfill-embeddings.ts` shape): iterate every `knowledge_pages` row, run extract/resolve/sync against current body. Idempotent.
6. After backfill: links table is fully populated. Backlinks panel + graph view show real data.

No feature flag — link sync is additive (empty link rows are valid for unlinked pages). UI components hide themselves with "no links yet" state when the page has zero edges.

## Out of Scope (Revisit Later)

- **Global graph view** (entire company KB at once) — performance question; reactflow can handle ~500 nodes but UI affordances change at that scale.
- **Cross-company linking** for shared/public pages — needs visibility model design first.
- **Auto-suggest while typing `[[`** — editor-side concern, separate UX project.
- **Link strength weighting** (mention count, recency) — could enrich graph layout later.
- **Backlink filtering by document_type** — keep it simple for v1; can add filter affordances if asked.
- **Link health dashboard** (every broken link in the company) — easy follow-up using the unresolved index.
- **Realtime updates** of backlinks panel when a peer creates a new linker — requires WS push; out of scope.

## Open Questions

None.

---

## Implementation Handoff

Ready for `/subagent-dev docs/brainstorm/specs/2026-05-08-memory-upgrade-p1-design.md`.

Task decomposition (each gets two-stage review):

1. **Migration + Drizzle schema for `knowledge_page_links`** + index export (T#32 P1.1)
2. **Frontmatter `aliases` extension** in `packages/shared/src/types/frontmatter/knowledge.ts` + tests
3. **Wikilink parser** (`extractWikilinks`) + tests covering all bracket/anchor/edge cases including code-fence exclusion
4. **Resolver + sync + janitor** modules + integration tests
5. **Wire write paths** in `knowledge.ts` (create/update/revertToRevision + janitor on create/rename) — existing tests must still pass
6. **Backlinks + graph queries** module + tests
7. **Backlinks + graph routes** in `routes/knowledge-links.ts` + register in `app.ts` + integration tests
8. **API client** additions in `ui/src/api/knowledge.ts`
9. **Backlinks panel** UI component + tests
10. **Graph view** UI component (`@xyflow/react` install + render) + tests
11. **Wire UI** into `KnowledgePageViewer.tsx` (sidebar + tab toggle) + integration test
12. **Backfill script** `scripts/backfill-knowledge-links.ts` + integration test
13. **CHANGELOG `[Unreleased]` + .env.example (none new) + ops note (link health follow-up)** in `docs/OPERATIONS.md`

Total: 13 tasks, projected ~3-5 days of focused execution with two-stage review per task.
