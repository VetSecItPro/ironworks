import type { Db } from "@ironworksai/db";
import { Router } from "express";
import { z } from "zod";
import { badRequest, HttpError, notFound } from "../errors.js";
import { knowledgeService } from "../services/knowledge.js";
import { getBacklinks, getNeighborhood } from "../services/knowledge-links/queries.js";
import { assertCompanyAccess } from "./authz.js";

/**
 * HTTP layer over the wikilink graph queries (T6).
 *
 * Visibility model: mirrors the existing `GET /knowledge/:pageId` route in
 * `knowledge.ts` - load the page via the knowledge service, enforce
 * companyAccess. We diverge on one point: cross-tenant page lookups return
 * 404 rather than 403 so the existence of a foreign page is not leaked
 * through a status-code oracle (per spec § Tests, case 10).
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const idParamSchema = z.object({
  id: z.string().regex(UUID_REGEX, "id must be a UUID"),
});

const hopsQuerySchema = z.object({
  hops: z
    .union([z.literal("0"), z.literal("1"), z.literal("2")])
    .optional()
    .transform((v) => (v === undefined ? 2 : (Number.parseInt(v, 10) as 0 | 1 | 2))),
});

export function knowledgeLinksRoutes(db: Db) {
  const router = Router();
  const svc = knowledgeService(db);

  /**
   * Loads the page and verifies it is visible to the requesting actor.
   * Returns the page on success; throws `notFound` (404) when the page is
   * absent OR belongs to a company the actor cannot access. The 404-on-cross-
   * tenant choice intentionally avoids the 403/404 oracle distinction.
   */
  async function loadPageOr404(req: Parameters<typeof assertCompanyAccess>[0], pageId: string) {
    const page = await svc.getById(pageId);
    if (!page) throw notFound("Knowledge page not found");
    try {
      assertCompanyAccess(req, page.companyId);
    } catch (err) {
      // Re-throw 401 (no actor) so unauthenticated callers see auth errors.
      // Convert 403 (cross-tenant) into 404 to avoid leaking page existence.
      if (err instanceof HttpError && err.status === 401) throw err;
      throw notFound("Knowledge page not found");
    }
    return page;
  }

  router.get("/knowledge-pages/:id/backlinks", async (req, res) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) {
      throw badRequest("Invalid page id", params.error.flatten());
    }
    const page = await loadPageOr404(req, params.data.id);
    const backlinks = await getBacklinks(db, {
      pageId: page.id,
      companyId: page.companyId,
    });
    res.json({ backlinks });
  });

  router.get("/knowledge-pages/:id/graph", async (req, res) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) {
      throw badRequest("Invalid page id", params.error.flatten());
    }
    const query = hopsQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw badRequest("hops must be 0, 1, or 2", query.error.flatten());
    }
    const page = await loadPageOr404(req, params.data.id);
    const result = await getNeighborhood(db, {
      pageId: page.id,
      companyId: page.companyId,
      hops: query.data.hops,
    });
    res.json(result);
  });

  return router;
}
