import { Router } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import { bugReports, authUsers } from "@ironworksai/db";
import { assertBoard, assertInstanceAdmin } from "./authz.js";
import { badRequest, notFound } from "../errors.js";

const VALID_TYPES = ["bug", "feature_request"] as const;
const VALID_SEVERITIES = ["low", "medium", "high", "critical"] as const;
const VALID_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;

export function bugReportRoutes(db: Db) {
  const router = Router();

  // ── POST /api/bug-reports - create a bug report (auth required) ──
  router.post("/bug-reports", async (req, res) => {
    assertBoard(req);

    const { type, title, description, pageUrl, severity } = req.body as {
      type?: string;
      title?: string;
      description?: string;
      pageUrl?: string;
      severity?: string;
    };

    if (!title || !title.trim()) {
      throw badRequest("Title is required");
    }

    const reportType = type && VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])
      ? type
      : "bug";

    const reportSeverity = severity && VALID_SEVERITIES.includes(severity as (typeof VALID_SEVERITIES)[number])
      ? severity
      : "medium";

    const companyId = req.actor.companyIds?.[0] ?? null;
    const userId = req.actor.userId ?? null;

    const [report] = await db
      .insert(bugReports)
      .values({
        companyId,
        reportedByUserId: userId,
        type: reportType,
        title: title.trim(),
        description: description?.trim() || null,
        pageUrl: pageUrl?.trim() || null,
        severity: reportType === "bug" ? reportSeverity : null,
        status: "open",
      })
      .returning();

    res.status(201).json(report);
  });

  // ── GET /api/bug-reports - list all (admin only) ──
  router.get("/bug-reports", async (req, res) => {
    assertInstanceAdmin(req);

    const { status, type } = req.query as { status?: string; type?: string };

    const conditions = [];
    if (status && VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
      conditions.push(eq(bugReports.status, status));
    }
    if (type && VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
      conditions.push(eq(bugReports.type, type));
    }

    const rows = await db
      .select({
        id: bugReports.id,
        companyId: bugReports.companyId,
        reportedByUserId: bugReports.reportedByUserId,
        type: bugReports.type,
        title: bugReports.title,
        description: bugReports.description,
        pageUrl: bugReports.pageUrl,
        severity: bugReports.severity,
        status: bugReports.status,
        adminNotes: bugReports.adminNotes,
        resolvedAt: bugReports.resolvedAt,
        createdAt: bugReports.createdAt,
        updatedAt: bugReports.updatedAt,
        reporterEmail: authUsers.email,
        reporterName: authUsers.name,
      })
      .from(bugReports)
      .leftJoin(authUsers, eq(bugReports.reportedByUserId, authUsers.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(bugReports.createdAt));

    res.json(rows);
  });

  // ── PATCH /api/bug-reports/:id - update status/notes (admin only) ──
  router.patch("/bug-reports/:id", async (req, res) => {
    assertInstanceAdmin(req);

    const { id } = req.params;
    const { status, adminNotes } = req.body as {
      status?: string;
      adminNotes?: string;
    };

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
        throw badRequest(`Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`);
      }
      updates.status = status;
      if (status === "resolved" || status === "closed") {
        updates.resolvedAt = new Date();
      }
    }

    if (adminNotes !== undefined) {
      updates.adminNotes = adminNotes;
    }

    const [updated] = await db
      .update(bugReports)
      .set(updates)
      .where(eq(bugReports.id, id))
      .returning();

    if (!updated) {
      throw notFound("Bug report not found");
    }

    res.json(updated);
  });

  return router;
}
