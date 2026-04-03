import { Router } from "express";
import { eq, desc, and } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import { supportTickets, supportTicketComments } from "@ironworksai/db";
import { assertInstanceAdmin } from "./authz.js";
import { notFound, badRequest } from "../errors.js";

const VALID_TYPES = ["bug", "feature", "billing", "security", "other"] as const;
const VALID_STATUSES = ["open", "in-progress", "resolved"] as const;

// ── Public route factory ─────────────────────────────────────────────────────

export function supportPublicRoutes(db: Db) {
  const router = Router();

  /**
   * POST /api/support/tickets
   * Public endpoint — for landing site contact form or authenticated in-app use.
   * No auth required so that unauthenticated users can submit tickets.
   */
  router.post("/support/tickets", async (req, res) => {
    const {
      type,
      subject,
      body,
      email,
      name,
      companyId,
      userId,
    } = req.body as {
      type?: string;
      subject?: string;
      body?: string;
      email?: string;
      name?: string;
      companyId?: string;
      userId?: string;
    };

    if (!email || typeof email !== "string" || !email.includes("@")) {
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

    const [ticket] = await db
      .insert(supportTickets)
      .values({
        companyId: companyId ?? null,
        userId: userId ?? null,
        userEmail: email.trim(),
        userName: name?.trim() ?? null,
        type: ticketType,
        subject: subject.trim(),
        body: body.trim(),
      })
      .returning();

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

    const [comment] = await db
      .insert(supportTicketComments)
      .values({
        ticketId,
        authorType: "admin",
        authorName: authorName?.trim() ?? null,
        body: body.trim(),
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
