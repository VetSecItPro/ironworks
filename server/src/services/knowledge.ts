import type { Db } from "@ironworksai/db";
import { knowledgePageRevisions, knowledgePages } from "@ironworksai/db";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { notFound } from "../errors.js";
import { getKnowledgeSeeds } from "./knowledge-seeds.js";

const MAX_BODY_BYTES = 102_400; // 100KB

// ── KB Page Summary Cache ─────────────────────────────────────────────────────
// In-memory cache for KB page summaries assembled during heartbeat context
// assembly. Avoids re-reading full page bodies on every heartbeat tick.

const KB_SUMMARY_CACHE = new Map<string, { summary: string; cachedAt: number }>();
const KB_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Return a cached KB page summary if it exists and is not stale.
 * Returns null if the cache is cold or the entry has expired.
 */
export function getCachedKBSummary(pageId: string): string | null {
  const entry = KB_SUMMARY_CACHE.get(pageId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > KB_CACHE_TTL_MS) {
    KB_SUMMARY_CACHE.delete(pageId);
    return null;
  }
  return entry.summary;
}

/**
 * Store a KB page summary in the in-memory cache.
 * Old entries are lazily evicted when they are next read.
 */
export function cacheKBSummary(pageId: string, summary: string): void {
  KB_SUMMARY_CACHE.set(pageId, { summary, cachedAt: Date.now() });
}

/**
 * Invalidate the summary cache for a specific page.
 * Call this whenever a page is updated so the next heartbeat picks up fresh content.
 */
export function invalidateKBSummaryCache(pageId: string): void {
  KB_SUMMARY_CACHE.delete(pageId);
}

// ─────────────────────────────────────────────────────────────────────────────

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "page"
  );
}

async function ensureUniqueSlug(db: Db, companyId: string, baseSlug: string, excludeId?: string): Promise<string> {
  let slug = baseSlug;
  let suffix = 2;
  while (true) {
    const conditions = [eq(knowledgePages.companyId, companyId), eq(knowledgePages.slug, slug)];
    if (excludeId) conditions.push(sql`${knowledgePages.id} != ${excludeId}`);
    const [existing] = await db
      .select({ id: knowledgePages.id })
      .from(knowledgePages)
      .where(and(...conditions))
      .limit(1);
    if (!existing) return slug;
    slug = `${baseSlug}-${suffix++}`;
  }
}

export interface KnowledgePageInput {
  title: string;
  body?: string;
  visibility?: "company" | "project" | "private";
  projectId?: string | null;
  department?: string | null;
  /** Optional folder prefix for the slug (e.g. "hr", "engineering", "projects/my-project"). */
  folder?: string | null;
}

export interface KnowledgePageUpdateInput {
  title?: string;
  body?: string;
  visibility?: "company" | "project" | "private";
  projectId?: string | null;
  department?: string | null;
  changeSummary?: string;
}

export function knowledgeService(db: Db) {
  return {
    async list(
      companyId: string,
      opts?: { search?: string; visibility?: string; department?: string; agentId?: string },
    ) {
      const conditions = [eq(knowledgePages.companyId, companyId)];
      if (opts?.visibility && opts.visibility !== "all") {
        conditions.push(eq(knowledgePages.visibility, opts.visibility));
      }
      if (opts?.department && opts.department !== "all") {
        conditions.push(eq(knowledgePages.department, opts.department));
      }
      if (opts?.agentId) {
        conditions.push(eq(knowledgePages.agentId, opts.agentId));
      }
      if (opts?.search?.trim()) {
        const q = `%${opts.search.trim()}%`;
        conditions.push(or(ilike(knowledgePages.title, q), ilike(knowledgePages.body, q))!);
      }
      return db
        .select()
        .from(knowledgePages)
        .where(and(...conditions))
        .orderBy(desc(knowledgePages.updatedAt));
    },

    async getById(id: string) {
      const [page] = await db.select().from(knowledgePages).where(eq(knowledgePages.id, id)).limit(1);
      return page ?? null;
    },

    async getBySlug(companyId: string, slug: string) {
      const [page] = await db
        .select()
        .from(knowledgePages)
        .where(and(eq(knowledgePages.companyId, companyId), eq(knowledgePages.slug, slug)))
        .limit(1);
      return page ?? null;
    },

    async create(companyId: string, input: KnowledgePageInput, actor: { agentId?: string; userId?: string }) {
      const body = input.body ?? "";
      if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
        throw new Error("Page body exceeds 100KB limit");
      }

      const baseSlug = slugify(input.title);
      const folderPrefix = input.folder?.trim().replace(/\/+$/, "");
      const rawSlug = folderPrefix ? `${folderPrefix}/${baseSlug}` : baseSlug;
      const slug = await ensureUniqueSlug(db, companyId, rawSlug);

      const [page] = await db
        .insert(knowledgePages)
        .values({
          companyId,
          slug,
          title: input.title.trim(),
          body,
          visibility: input.visibility ?? "company",
          projectId: input.projectId ?? null,
          department: input.department ?? null,
          revisionNumber: 1,
          createdByAgentId: actor.agentId ?? null,
          createdByUserId: actor.userId ?? null,
          updatedByAgentId: actor.agentId ?? null,
          updatedByUserId: actor.userId ?? null,
        })
        .returning();

      // Create initial revision
      await db.insert(knowledgePageRevisions).values({
        pageId: page.id,
        companyId,
        revisionNumber: 1,
        title: page.title,
        body: page.body,
        changeSummary: "Created page",
        editedByAgentId: actor.agentId ?? null,
        editedByUserId: actor.userId ?? null,
      });

      return page;
    },

    async update(id: string, input: KnowledgePageUpdateInput, actor: { agentId?: string; userId?: string }) {
      const existing = await this.getById(id);
      if (!existing) throw notFound("Knowledge page not found");

      if (input.body !== undefined && Buffer.byteLength(input.body, "utf8") > MAX_BODY_BYTES) {
        throw new Error("Page body exceeds 100KB limit");
      }

      const nextRevision = existing.revisionNumber + 1;
      const nextTitle = input.title?.trim() ?? existing.title;
      const nextBody = input.body ?? existing.body;
      const nextSlug = input.title
        ? await ensureUniqueSlug(db, existing.companyId, slugify(nextTitle), id)
        : existing.slug;

      const [updated] = await db
        .update(knowledgePages)
        .set({
          slug: nextSlug,
          title: nextTitle,
          body: nextBody,
          visibility: input.visibility ?? existing.visibility,
          projectId: input.projectId === undefined ? existing.projectId : input.projectId,
          department: input.department === undefined ? existing.department : input.department,
          revisionNumber: nextRevision,
          updatedByAgentId: actor.agentId ?? null,
          updatedByUserId: actor.userId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(knowledgePages.id, id))
        .returning();

      // Create revision record
      await db.insert(knowledgePageRevisions).values({
        pageId: id,
        companyId: existing.companyId,
        revisionNumber: nextRevision,
        title: nextTitle,
        body: nextBody,
        changeSummary: input.changeSummary ?? null,
        editedByAgentId: actor.agentId ?? null,
        editedByUserId: actor.userId ?? null,
      });

      return updated;
    },

    async remove(id: string) {
      const existing = await this.getById(id);
      if (!existing) throw notFound("Knowledge page not found");
      await db.delete(knowledgePages).where(eq(knowledgePages.id, id));
      return existing;
    },

    async listRevisions(pageId: string) {
      return db
        .select()
        .from(knowledgePageRevisions)
        .where(eq(knowledgePageRevisions.pageId, pageId))
        .orderBy(desc(knowledgePageRevisions.revisionNumber));
    },

    async getRevision(pageId: string, revisionNumber: number) {
      const [rev] = await db
        .select()
        .from(knowledgePageRevisions)
        .where(
          and(eq(knowledgePageRevisions.pageId, pageId), eq(knowledgePageRevisions.revisionNumber, revisionNumber)),
        )
        .limit(1);
      return rev ?? null;
    },

    async revertToRevision(pageId: string, revisionNumber: number, actor: { agentId?: string; userId?: string }) {
      const revision = await this.getRevision(pageId, revisionNumber);
      if (!revision) throw notFound("Revision not found");
      return this.update(
        pageId,
        {
          title: revision.title,
          body: revision.body,
          changeSummary: `Reverted to revision #${revisionNumber}`,
        },
        actor,
      );
    },

    /** Seed default KB pages for a new company (idempotent). */
    async seedDefaults(companyId: string): Promise<{ seeded: boolean; count: number }> {
      const [existing] = await db
        .select({ id: knowledgePages.id })
        .from(knowledgePages)
        .where(and(eq(knowledgePages.companyId, companyId), eq(knowledgePages.isSeeded, "true")))
        .limit(1);
      if (existing) return { seeded: false, count: 0 };

      const { seeds, sopTemplates } = getKnowledgeSeeds();
      let count = 0;

      for (const sop of sopTemplates) {
        const sopSlug = slugify(sop.title);
        await db.insert(knowledgePages).values({
          companyId,
          slug: sopSlug,
          title: sop.title,
          body: sop.body,
          visibility: "company",
          isSeeded: "true",
          revisionNumber: 1,
          createdByUserId: "system",
          updatedByUserId: "system",
        });
        count++;
      }

      for (const seed of seeds) {
        const slug = slugify(seed.title);
        await db.insert(knowledgePages).values({
          companyId,
          slug,
          title: seed.title,
          body: seed.body,
          visibility: "company",
          isSeeded: "true",
          revisionNumber: 1,
          createdByUserId: "system",
          updatedByUserId: "system",
        });
        count++;
      }

      return { seeded: true, count };
    },
  };
}
