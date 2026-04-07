import { Router } from "express";
import { eq, desc, and } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import { supportTickets, supportTicketComments } from "@ironworksai/db";
import { assertInstanceAdmin } from "./authz.js";
import { notFound, badRequest } from "../errors.js";

const VALID_TYPES = ["bug", "feature", "billing", "security", "other"] as const;
const VALID_STATUSES = ["open", "in-progress", "resolved"] as const;

// ── Rate limiter for public ticket submission (FIND-001) ─────────────────────
// 5 tickets per hour per IP, in-memory sliding window.
const ticketRateBuckets = new Map<string, { count: number; resetAt: number }>();
const TICKET_RATE_LIMIT = 5;
const TICKET_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkTicketRateLimit(ip: string): boolean {
  const now = Date.now();
  let bucket = ticketRateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + TICKET_RATE_WINDOW_MS };
    ticketRateBuckets.set(ip, bucket);
  }
  bucket.count++;
  // Prune stale buckets occasionally
  if (bucket.count === 1 && ticketRateBuckets.size > 5000) {
    for (const [k, v] of ticketRateBuckets) {
      if (now > v.resetAt) ticketRateBuckets.delete(k);
    }
  }
  return bucket.count <= TICKET_RATE_LIMIT;
}

// ── HTML sanitizer (FIND-002) ────────────────────────────────────────────────
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "");
}

// ── Email regex (FIND-001) ────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── CORS origin for landing site (FIND-006) ──────────────────────────────────
const LANDING_ORIGIN = "https://ironworksapp.ai";

// ── Public route factory ─────────────────────────────────────────────────────

export function supportPublicRoutes(db: Db) {
  const router = Router();

  // FIND-006: preflight for cross-origin ticket submission from landing site
  router.options("/support/tickets", (_req, res) => {
    res.setHeader("Access-Control-Allow-Origin", LANDING_ORIGIN);
    res.setHeader("Access-Control-Allow-Methods", "POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
  });

  /**
   * POST /api/support/tickets
   * Public endpoint — for landing site contact form or authenticated in-app use.
   * No auth required so that unauthenticated users can submit tickets.
   */
  router.post("/support/tickets", async (req, res) => {
    // FIND-001: per-IP rate limit
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    if (!checkTicketRateLimit(ip)) {
      res.status(429).json({ error: "Too many ticket submissions. Try again later." });
      return;
    }

    const {
      type,
      subject,
      body,
      email,
      name,
      companyId: bodyCompanyId,
      userId: bodyUserId,
    } = req.body as {
      type?: string;
      subject?: string;
      body?: string;
      email?: string;
      name?: string;
      companyId?: string;
      userId?: string;
    };

    // SEC-001: If the request is authenticated, ignore any userId/companyId from
    // the body and use only the authenticated session values. Unauthenticated
    // callers (e.g. the landing site contact form) may not supply these at all.
    const authenticatedUserId =
      req.actor?.type === "board" && req.actor.userId ? req.actor.userId : null;
    const resolvedUserId = authenticatedUserId ?? null;
    // companyId from body is only accepted when not authenticated, and only as
    // a hint (it is not verified against any membership — purely informational).
    // Authenticated users never have their companyId overridden from the body.
    const resolvedCompanyId = authenticatedUserId ? null : (bodyCompanyId ?? null);
    void bodyUserId; // always ignored — never trust client-supplied userId

    // FIND-001: proper email regex validation
    if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
      throw badRequest("A valid email address is required");
    }
    if (!subject || typeof subject !== "string" || subject.trim().length === 0) {
      throw badRequest("subject is required");
    }
    if (!body || typeof body !== "string" || body.trim().length === 0) {
      throw badRequest("body is required");
    }

    const ticketType =
      typeof type === "string" && (VALID_TYPES as readonly string[]).includes(type)
        ? type
        : "bug";

    // FIND-002: strip HTML from user-supplied text fields
    const safeSubject = stripHtml(subject.trim());
    const safeBody = stripHtml(body.trim());
    const safeName = name ? stripHtml(name.trim()) : null;

    const [ticket] = await db
      .insert(supportTickets)
      .values({
        companyId: resolvedCompanyId,
        userId: resolvedUserId,
        userEmail: email.trim(),
        userName: safeName || null,
        type: ticketType,
        subject: safeSubject,
        body: safeBody,
      })
      .returning();

    // FIND-006: CORS header on actual POST response
    res.setHeader("Access-Control-Allow-Origin", LANDING_ORIGIN);
    res.status(201).json({ id: ticket!.id, status: ticket!.status });
  });

  return router;
}

// ── Admin route factory ──────────────────────────────────────────────────────

export function supportAdminRoutes(db: Db) {
  const router = Router();

  /**
   * GET /api/admin/support/tickets
   * List all tickets with optional filters: status, type, limit, offset.
   */
  router.get("/support/tickets", async (req, res) => {
    assertInstanceAdmin(req);

    const { status, type } = req.query as { status?: string; type?: string };
    const limitParam = Number(req.query.limit);
    const offsetParam = Number(req.query.offset);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;
    const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

    const conditions = [];
    if (status && (VALID_STATUSES as readonly string[]).includes(status)) {
      conditions.push(eq(supportTickets.status, status));
    }
    if (type && (VALID_TYPES as readonly string[]).includes(type)) {
      conditions.push(eq(supportTickets.type, type));
    }

    const rows = await db
      .select()
      .from(supportTickets)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(supportTickets.createdAt))
      .limit(limit)
      .offset(offset);

    res.json(rows);
  });

  /**
   * GET /api/admin/support/tickets/:id
   * Get a single ticket with all its comments.
   */
  router.get("/support/tickets/:id", async (req, res) => {
    assertInstanceAdmin(req);

    const ticketId = req.params.id as string;

    const [ticket] = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      throw notFound("Ticket not found");
    }

    const comments = await db
      .select()
      .from(supportTicketComments)
      .where(eq(supportTicketComments.ticketId, ticketId))
      .orderBy(supportTicketComments.createdAt);

    res.json({ ticket, comments });
  });

  /**
   * POST /api/admin/support/tickets/:id/comments
   * Add an admin reply to a ticket.
   */
  router.post("/support/tickets/:id/comments", async (req, res) => {
    assertInstanceAdmin(req);

    const ticketId = req.params.id as string;
    const { body, authorName } = req.body as {
      body?: string;
      authorName?: string;
    };

    if (!body || typeof body !== "string" || body.trim().length === 0) {
      throw badRequest("body is required");
    }

    // Verify ticket exists
    const [ticket] = await db
      .select({ id: supportTickets.id })
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      throw notFound("Ticket not found");
    }

    // FIND-002: strip HTML from admin-supplied fields
    const safeCommentBody = stripHtml(body.trim());
    const safeAuthorName = authorName ? stripHtml(authorName.trim()) : null;

    const [comment] = await db
      .insert(supportTicketComments)
      .values({
        ticketId,
        authorType: "admin",
        authorName: safeAuthorName,
        body: safeCommentBody,
      })
      .returning();

    // Bump ticket updatedAt when a comment is added
    await db
      .update(supportTickets)
      .set({ updatedAt: new Date() })
      .where(eq(supportTickets.id, ticketId));

    res.status(201).json(comment);
  });

  /**
   * PATCH /api/admin/support/tickets/:id
   * Update ticket status.
   */
  router.patch("/support/tickets/:id", async (req, res) => {
    assertInstanceAdmin(req);

    const ticketId = req.params.id as string;
    const { status } = req.body as { status?: string };

    if (!status || !(VALID_STATUSES as readonly string[]).includes(status)) {
      throw badRequest(`status must be one of: ${VALID_STATUSES.join(", ")}`);
    }

    const [updated] = await db
      .update(supportTickets)
      .set({ status, updatedAt: new Date() })
      .where(eq(supportTickets.id, ticketId))
      .returning();

    if (!updated) {
      throw notFound("Ticket not found");
    }

    res.json(updated);
  });

  return router;
}
