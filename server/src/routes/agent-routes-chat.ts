import type { Db } from "@ironworksai/db";
import { agentMemoryEntries, issues as issuesTable } from "@ironworksai/db";
import { and, desc, eq, inArray, not } from "drizzle-orm";
import { Router } from "express";
import { logger } from "../middleware/logger.js";
import { heartbeatService, issueService, logActivity } from "../services/index.js";
import { buildAgentRouteContext } from "./agent-route-helpers.js";
import { assertCanWrite, assertCompanyAccess, getActorInfo } from "./authz.js";

export function agentChatRoutes(db: Db): Router {
  const router = Router();
  const ctx = buildAgentRouteContext(db);
  const { svc, normalizeAgentReference } = ctx;

  /**
   * Get or create the single active chat issue for an agent.
   * Chat issues use originKind="chat" and are reused across sessions.
   * Inactive for 24 hours -> close automatically (handled by auto-close logic).
   */
  async function getOrCreateChatIssue(companyId: string, agentId: string, createdByUserId: string | null) {
    const issueSvc = issueService(db);

    // Look for an open chat issue already assigned to this agent
    const existing = await db
      .select()
      .from(issuesTable)
      .where(
        and(
          eq(issuesTable.companyId, companyId),
          eq(issuesTable.assigneeAgentId, agentId),
          eq(issuesTable.originKind, "chat"),
          not(inArray(issuesTable.status, ["done", "cancelled"])),
        ),
      )
      .orderBy(desc(issuesTable.updatedAt))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (existing) {
      return existing;
    }

    // Create a new chat issue
    const agent = await svc.getById(agentId);
    const title = agent ? `Chat with ${agent.name}` : "Agent Chat";

    const created = await issueSvc.create(companyId, {
      title,
      status: "todo",
      priority: "medium",
      assigneeAgentId: agentId,
      originKind: "chat",
      createdByUserId,
      createdByAgentId: null,
    } as Parameters<typeof issueSvc.create>[1]);

    return created;
  }

  // ── POST /companies/:companyId/agents/:agentId/messages ────────────────────
  // Agent-to-agent internal messaging via the activity log.
  router.post("/companies/:companyId/agents/:agentId/messages", async (req, res) => {
    const companyId = req.params.companyId as string;
    const fromAgentId = req.params.agentId as string;
    await assertCanWrite(req, companyId, db);

    // Validate sender exists
    const fromAgent = await svc.getById(fromAgentId);
    if (!fromAgent || fromAgent.companyId !== companyId) {
      res.status(404).json({ error: "Sender agent not found" });
      return;
    }

    const { toAgentId, subject, content } = req.body as {
      toAgentId?: string;
      subject?: string;
      content?: string;
    };

    if (!toAgentId || typeof toAgentId !== "string") {
      res.status(400).json({ error: "toAgentId is required" });
      return;
    }
    if (!content || typeof content !== "string") {
      res.status(400).json({ error: "content is required" });
      return;
    }

    // Validate receiver exists
    const toAgent = await svc.getById(toAgentId);
    if (!toAgent || toAgent.companyId !== companyId) {
      res.status(404).json({ error: "Recipient agent not found" });
      return;
    }

    const actor = getActorInfo(req);
    const _entry = await logActivity(db, {
      companyId,
      actorType: "agent",
      actorId: fromAgentId,
      agentId: fromAgentId,
      runId: actor.runId,
      action: "agent.message",
      entityType: "agent",
      entityId: toAgentId,
      details: {
        fromAgentId,
        fromAgentName: fromAgent.name,
        toAgentId,
        toAgentName: toAgent.name,
        subject: typeof subject === "string" ? subject : null,
        content,
      },
    });

    res.status(201).json({
      ok: true,
      from: { id: fromAgent.id, name: fromAgent.name },
      to: { id: toAgent.id, name: toAgent.name },
      subject: subject ?? null,
    });
  });

  /**
   * POST /api/companies/:companyId/agents/:agentId/chat
   * Body: { message: string }
   * Creates or reuses the active chat issue, posts the user message as a comment,
   * wakes the agent, and returns { issueId, commentId }.
   */
  router.post("/companies/:companyId/agents/:agentId/chat", async (req, res) => {
    const companyId = req.params.companyId as string;
    const agentIdParam = req.params.agentId as string;
    await assertCanWrite(req, companyId, db);

    if (req.actor.type !== "board") {
      res.status(403).json({ error: "Board authentication required for chat" });
      return;
    }
    if (!req.actor.userId) {
      res.status(403).json({ error: "User context required for chat" });
      return;
    }

    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const agentId = await normalizeAgentReference(req, agentIdParam);
    const agent = await svc.getById(agentId);
    if (!agent || agent.companyId !== companyId) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const issueSvc = issueService(db);
    const chatIssue = await getOrCreateChatIssue(companyId, agentId, req.actor.userId);

    const actor = getActorInfo(req);
    const comment = await issueSvc.addComment(chatIssue.id, message, {
      userId: req.actor.userId,
      agentId: undefined,
    });

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.comment_added",
      entityType: "issue",
      entityId: chatIssue.id,
      details: { commentId: comment.id, source: "chat" },
    });

    // Wake the agent so it can respond
    const heartbeatSvc = heartbeatService(db);
    heartbeatSvc
      .wakeup(agentId, {
        source: "automation",
        triggerDetail: "system",
        reason: "issue_commented",
        payload: {
          issueId: chatIssue.id,
          commentId: comment.id,
          mutation: "comment",
        },
        requestedByActorType: actor.actorType,
        requestedByActorId: actor.actorId,
        contextSnapshot: {
          issueId: chatIssue.id,
          taskId: chatIssue.id,
          commentId: comment.id,
          wakeCommentId: comment.id,
          source: "chat",
          wakeReason: "issue_commented",
        },
      })
      .catch((err) => logger.warn({ err, agentId, issueId: chatIssue.id }, "failed to wake agent for chat"));

    res.status(201).json({ issueId: chatIssue.id, commentId: comment.id });
  });

  /**
   * GET /api/companies/:companyId/agents/:agentId/chat/issue
   * Returns the active chat issue for the agent (or null).
   */
  router.get("/companies/:companyId/agents/:agentId/chat/issue", async (req, res) => {
    const companyId = req.params.companyId as string;
    const agentIdParam = req.params.agentId as string;
    assertCompanyAccess(req, companyId);

    const agentId = await normalizeAgentReference(req, agentIdParam);
    const agent = await svc.getById(agentId);
    if (!agent || agent.companyId !== companyId) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const existing = await db
      .select()
      .from(issuesTable)
      .where(
        and(
          eq(issuesTable.companyId, companyId),
          eq(issuesTable.assigneeAgentId, agentId),
          eq(issuesTable.originKind, "chat"),
          not(inArray(issuesTable.status, ["done", "cancelled"])),
        ),
      )
      .orderBy(desc(issuesTable.updatedAt))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    res.json(existing ?? null);
  });

  // ── Structured Feedback (REQ-10) ──

  // POST /companies/:companyId/agents/:agentId/feedback
  router.post("/companies/:companyId/agents/:agentId/feedback", async (req, res) => {
    const { companyId, agentId } = req.params;
    await assertCanWrite(req, companyId, db);

    const { issueId, feedbackType, content } = req.body as {
      issueId?: string;
      feedbackType?: "positive" | "negative" | "correction";
      content?: string;
    };

    if (!feedbackType || !content) {
      res.status(422).json({ error: "feedbackType and content are required" });
      return;
    }

    if (!["positive", "negative", "correction"].includes(feedbackType)) {
      res.status(422).json({ error: "feedbackType must be positive, negative, or correction" });
      return;
    }

    const agentRow = await svc.getById(agentId);
    if (!agentRow) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    try {
      const now = new Date();

      // Create feedback memory entry
      await db.insert(agentMemoryEntries).values({
        agentId,
        companyId,
        memoryType: "episodic",
        category: "feedback",
        content: `[${feedbackType}] ${content}`,
        sourceIssueId: issueId ?? null,
        confidence: feedbackType === "negative" ? 90 : 80,
        lastAccessedAt: now,
      });

      // If negative feedback, also create a bad quality example
      if (feedbackType === "negative") {
        await db.insert(agentMemoryEntries).values({
          agentId,
          companyId,
          memoryType: "procedural",
          category: "quality_flag",
          content: `Bad quality example: ${content}`,
          sourceIssueId: issueId ?? null,
          confidence: 85,
          lastAccessedAt: now,
        });
      }

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "agent.feedback_received",
        entityType: "agent",
        entityId: agentId,
        details: { feedbackType, issueId: issueId ?? null },
      });

      res.json({ ok: true });
    } catch (err) {
      logger.error({ err, companyId, agentId }, "failed to process agent feedback");
      res.status(500).json({ error: "Failed to process feedback" });
    }
  });

  return router;
}
