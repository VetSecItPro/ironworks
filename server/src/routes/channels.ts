import type { Db } from "@ironworksai/db";
import { agentChannels } from "@ironworksai/db";
import { eq } from "drizzle-orm";
import { Router } from "express";
import {
  checkQuorum,
  concludeDeliberation,
  createForkAndTest,
  detectCrossChannelOverlap,
  discoverExpertise,
  ensureCompanyChannel,
  extractDecisions,
  getMessages,
  getPinnedMessages,
  listChannels,
  pinMessage,
  postMessage,
  startDeliberation,
  summarizeChannel,
  unpinMessage,
} from "../services/channels.js";
import { channelAnalytics } from "../services/executive-analytics.js";
import { heartbeatService } from "../services/index.js";
import { issueService } from "../services/issues.js";
import { publishLiveEvent } from "../services/live-events.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

export function channelRoutes(db: Db) {
  const router = Router();

  // GET /api/companies/:companyId/channels
  router.get("/companies/:companyId/channels", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    // Ensure at least the #company channel exists
    await ensureCompanyChannel(db, companyId);

    const channels = await listChannels(db, companyId);
    res.json(channels);
  });

  // GET /api/companies/:companyId/channels/:channelId/messages
  router.get("/companies/:companyId/channels/:channelId/messages", async (req, res) => {
    const companyId = req.params.companyId as string;
    const channelId = req.params.channelId as string;
    assertCompanyAccess(req, companyId);

    // Verify the channel belongs to this company
    const channel = await db
      .select({ id: agentChannels.id })
      .from(agentChannels)
      .where(eq(agentChannels.id, channelId))
      .then((rows) => rows[0] ?? null);

    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 50;
    const before = typeof req.query.before === "string" ? req.query.before : undefined;

    const messages = await getMessages(db, channelId, {
      limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 50,
      before,
    });

    res.json(messages);
  });

  // POST /api/companies/:companyId/channels/:channelId/messages
  router.post("/companies/:companyId/channels/:channelId/messages", async (req, res) => {
    const companyId = req.params.companyId as string;
    const channelId = req.params.channelId as string;
    assertCompanyAccess(req, companyId);

    // Verify the channel belongs to this company
    const channel = await db
      .select({ id: agentChannels.id, companyId: agentChannels.companyId })
      .from(agentChannels)
      .where(eq(agentChannels.id, channelId))
      .then((rows) => rows[0] ?? null);

    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    if (channel.companyId !== companyId) {
      res.status(403).json({ error: "Channel does not belong to this company" });
      return;
    }

    const body = req.body as {
      body?: unknown;
      messageType?: unknown;
      mentions?: unknown;
      linkedIssueId?: unknown;
      replyToId?: unknown;
      reasoning?: unknown;
    };

    if (typeof body.body !== "string" || body.body.trim().length === 0) {
      res.status(400).json({ error: "body is required" });
      return;
    }

    const actor = getActorInfo(req);

    // biome-ignore lint/suspicious/noExplicitAny: Drizzle DB type does not unify across schema-scoped overloads
    const heartbeat = heartbeatService(db as any);
    const message = await postMessage(db, {
      channelId,
      companyId,
      authorAgentId: actor.agentId ?? undefined,
      authorUserId: actor.actorType === "user" ? actor.actorId : undefined,
      body: body.body.trim(),
      messageType: typeof body.messageType === "string" ? body.messageType : "message",
      mentions: Array.isArray(body.mentions) ? (body.mentions as string[]) : [],
      linkedIssueId: typeof body.linkedIssueId === "string" ? body.linkedIssueId : undefined,
      replyToId: typeof body.replyToId === "string" ? body.replyToId : undefined,
      reasoning: typeof body.reasoning === "string" ? body.reasoning : undefined,
      // biome-ignore lint/suspicious/noExplicitAny: wakeOpts type differs between plugin-sdk and heartbeat service signatures
      enqueueWakeup: (agentId, wakeOpts) => heartbeat.wakeup(agentId, wakeOpts as any),
    });

    // Broadcast SSE event to all connected clients for this company
    publishLiveEvent({
      companyId,
      type: "channel.message",
      payload: { message, channelId },
    });

    res.status(201).json(message);
  });

  // -------------------------------------------------------------------------
  // Enhancement 1: Decision Registry
  // GET /api/companies/:companyId/channels/:channelId/decisions
  // -------------------------------------------------------------------------
  router.get("/companies/:companyId/channels/:channelId/decisions", async (req, res) => {
    const companyId = req.params.companyId as string;
    const channelId = req.params.channelId as string;
    assertCompanyAccess(req, companyId);

    const channel = await db
      .select({ id: agentChannels.id })
      .from(agentChannels)
      .where(eq(agentChannels.id, channelId))
      .then((rows) => rows[0] ?? null);

    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    const sinceParam = typeof req.query.since === "string" ? req.query.since : undefined;
    const since = sinceParam ? new Date(sinceParam) : undefined;

    const decisions = await extractDecisions(db, channelId, since);
    res.json(decisions);
  });

  // -------------------------------------------------------------------------
  // Enhancement 4: Thread Pinning
  // POST   /api/companies/:companyId/channels/:channelId/messages/:messageId/pin
  // DELETE /api/companies/:companyId/channels/:channelId/messages/:messageId/pin
  // GET    /api/companies/:companyId/channels/:channelId/pinned
  // -------------------------------------------------------------------------
  router.post("/companies/:companyId/channels/:channelId/messages/:messageId/pin", async (req, res) => {
    const companyId = req.params.companyId as string;
    const channelId = req.params.channelId as string;
    const messageId = req.params.messageId as string;
    assertCompanyAccess(req, companyId);

    const channel = await db
      .select({ id: agentChannels.id, companyId: agentChannels.companyId })
      .from(agentChannels)
      .where(eq(agentChannels.id, channelId))
      .then((rows) => rows[0] ?? null);

    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }
    if (channel.companyId !== companyId) {
      res.status(403).json({ error: "Channel does not belong to this company" });
      return;
    }

    await pinMessage(db, channelId, messageId);
    res.json({ ok: true });
  });

  router.delete("/companies/:companyId/channels/:channelId/messages/:messageId/pin", async (req, res) => {
    const companyId = req.params.companyId as string;
    const channelId = req.params.channelId as string;
    const messageId = req.params.messageId as string;
    assertCompanyAccess(req, companyId);

    const channel = await db
      .select({ id: agentChannels.id, companyId: agentChannels.companyId })
      .from(agentChannels)
      .where(eq(agentChannels.id, channelId))
      .then((rows) => rows[0] ?? null);

    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }
    if (channel.companyId !== companyId) {
      res.status(403).json({ error: "Channel does not belong to this company" });
      return;
    }

    await unpinMessage(db, channelId, messageId);
    res.json({ ok: true });
  });

  router.get("/companies/:companyId/channels/:channelId/pinned", async (req, res) => {
    const companyId = req.params.companyId as string;
    const channelId = req.params.channelId as string;
    assertCompanyAccess(req, companyId);

    const channel = await db
      .select({ id: agentChannels.id })
      .from(agentChannels)
      .where(eq(agentChannels.id, channelId))
      .then((rows) => rows[0] ?? null);

    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    const pinned = await getPinnedMessages(db, channelId);
    res.json(pinned);
  });

  // -------------------------------------------------------------------------
  // Feature 1: Deliberation Protocol
  // POST /api/companies/:companyId/channels/:channelId/deliberate
  // POST /api/companies/:companyId/channels/:channelId/deliberations/:deliberationId/conclude
  // -------------------------------------------------------------------------
  router.post("/companies/:companyId/channels/:channelId/deliberate", async (req, res) => {
    const companyId = req.params.companyId as string;
    const channelId = req.params.channelId as string;
    assertCompanyAccess(req, companyId);

    const channel = await db
      .select({ id: agentChannels.id, companyId: agentChannels.companyId })
      .from(agentChannels)
      .where(eq(agentChannels.id, channelId))
      .then((rows) => rows[0] ?? null);

    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }
    if (channel.companyId !== companyId) {
      res.status(403).json({ error: "Channel does not belong to this company" });
      return;
    }

    const body = req.body as {
      topic?: unknown;
      invitedAgentIds?: unknown;
      initiatedByAgentId?: unknown;
    };

    if (typeof body.topic !== "string" || !body.topic.trim()) {
      res.status(400).json({ error: "topic is required" });
      return;
    }
    if (!Array.isArray(body.invitedAgentIds) || body.invitedAgentIds.length === 0) {
      res.status(400).json({ error: "invitedAgentIds must be a non-empty array" });
      return;
    }

    const actor = getActorInfo(req);
    const initiatedByAgentId =
      typeof body.initiatedByAgentId === "string" ? body.initiatedByAgentId : (actor.agentId ?? "");

    const deliberationId = await startDeliberation(db, {
      channelId,
      companyId,
      topic: body.topic.trim(),
      initiatedByAgentId,
      invitedAgentIds: body.invitedAgentIds as string[],
    });

    publishLiveEvent({
      companyId,
      type: "channel.message",
      payload: { channelId },
    });

    res.status(201).json({ deliberationId });
  });

  router.post("/companies/:companyId/channels/:channelId/deliberations/:deliberationId/conclude", async (req, res) => {
    const companyId = req.params.companyId as string;
    const channelId = req.params.channelId as string;
    const deliberationId = req.params.deliberationId as string;
    assertCompanyAccess(req, companyId);

    const channel = await db
      .select({ id: agentChannels.id })
      .from(agentChannels)
      .where(eq(agentChannels.id, channelId))
      .then((rows) => rows[0] ?? null);

    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    const synthesis = await concludeDeliberation(db, deliberationId);

    publishLiveEvent({
      companyId,
      type: "channel.message",
      payload: { channelId },
    });

    res.json({ synthesis });
  });

  // -------------------------------------------------------------------------
  // Feature 4: Expertise Map
  // GET /api/companies/:companyId/expertise-map
  // -------------------------------------------------------------------------
  router.get("/companies/:companyId/expertise-map", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const expertiseMap = await discoverExpertise(db, companyId);
    res.json(expertiseMap);
  });

  // -------------------------------------------------------------------------
  // Feature 5: Fork-and-Test
  // POST /api/companies/:companyId/channels/:channelId/fork-and-test
  // -------------------------------------------------------------------------
  router.post("/companies/:companyId/channels/:channelId/fork-and-test", async (req, res) => {
    const companyId = req.params.companyId as string;
    const channelId = req.params.channelId as string;
    assertCompanyAccess(req, companyId);

    const channel = await db
      .select({ id: agentChannels.id, companyId: agentChannels.companyId })
      .from(agentChannels)
      .where(eq(agentChannels.id, channelId))
      .then((rows) => rows[0] ?? null);

    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }
    if (channel.companyId !== companyId) {
      res.status(403).json({ error: "Channel does not belong to this company" });
      return;
    }

    const body = req.body as {
      topic?: unknown;
      approachA?: unknown;
      approachB?: unknown;
      goalId?: unknown;
      projectId?: unknown;
    };

    if (typeof body.topic !== "string" || !body.topic.trim()) {
      res.status(400).json({ error: "topic is required" });
      return;
    }

    const approachA = body.approachA as { agentId?: string; description?: string } | undefined;
    const approachB = body.approachB as { agentId?: string; description?: string } | undefined;

    if (!approachA?.agentId || !approachA.description) {
      res.status(400).json({ error: "approachA.agentId and approachA.description are required" });
      return;
    }
    if (!approachB?.agentId || !approachB.description) {
      res.status(400).json({ error: "approachB.agentId and approachB.description are required" });
      return;
    }

    const result = await createForkAndTest(db, {
      companyId,
      channelId,
      topic: body.topic.trim(),
      approachA: { agentId: approachA.agentId, description: approachA.description },
      approachB: { agentId: approachB.agentId, description: approachB.description },
      goalId: typeof body.goalId === "string" ? body.goalId : null,
      projectId: typeof body.projectId === "string" ? body.projectId : null,
    });

    publishLiveEvent({
      companyId,
      type: "channel.message",
      payload: { channelId },
    });

    res.status(201).json(result);
  });

  // -------------------------------------------------------------------------
  // Enhancement 5: Channel Analytics
  // GET /api/companies/:companyId/channels/:channelId/analytics
  // -------------------------------------------------------------------------
  router.get("/companies/:companyId/channels/:channelId/analytics", async (req, res) => {
    const companyId = req.params.companyId as string;
    const channelId = req.params.channelId as string;
    assertCompanyAccess(req, companyId);

    const channel = await db
      .select({ id: agentChannels.id })
      .from(agentChannels)
      .where(eq(agentChannels.id, channelId))
      .then((rows) => rows[0] ?? null);

    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    const periodDaysParam = typeof req.query.periodDays === "string" ? parseInt(req.query.periodDays, 10) : 30;
    const periodDays = Number.isFinite(periodDaysParam) && periodDaysParam > 0 ? Math.min(periodDaysParam, 365) : 30;

    const data = await channelAnalytics(db, channelId, periodDays);
    res.json(data);
  });

  // -------------------------------------------------------------------------
  // Phase 8 - Enhancement 1: Conversation Summarizer
  // GET /api/companies/:companyId/channels/:channelId/summary?days=7
  // -------------------------------------------------------------------------
  router.get("/companies/:companyId/channels/:channelId/summary", async (req, res) => {
    const companyId = req.params.companyId as string;
    const channelId = req.params.channelId as string;
    assertCompanyAccess(req, companyId);

    const channel = await db
      .select({ id: agentChannels.id })
      .from(agentChannels)
      .where(eq(agentChannels.id, channelId))
      .then((rows) => rows[0] ?? null);

    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    const daysParam = typeof req.query.days === "string" ? parseInt(req.query.days, 10) : 7;
    const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 90) : 7;

    const summary = await summarizeChannel(db, channelId, days);
    res.json(summary);
  });

  // -------------------------------------------------------------------------
  // Phase 8 - Enhancement 2: Chat-to-Issue Pipeline
  // POST /api/companies/:companyId/channels/:channelId/messages/:messageId/create-issue
  // -------------------------------------------------------------------------
  router.post("/companies/:companyId/channels/:channelId/messages/:messageId/create-issue", async (req, res) => {
    const companyId = req.params.companyId as string;
    const channelId = req.params.channelId as string;
    const messageId = req.params.messageId as string;
    assertCompanyAccess(req, companyId);

    const channel = await db
      .select({ id: agentChannels.id, companyId: agentChannels.companyId })
      .from(agentChannels)
      .where(eq(agentChannels.id, channelId))
      .then((rows) => rows[0] ?? null);

    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }
    if (channel.companyId !== companyId) {
      res.status(403).json({ error: "Channel does not belong to this company" });
      return;
    }

    // Fetch the source message and up to 3 replies
    const msgs = await getMessages(db, channelId, { limit: 200 });
    const sourceMessage = msgs.find((m) => m.id === messageId) ?? null;

    if (!sourceMessage) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    const replyContext = msgs
      .filter((r) => r.replyToId === messageId)
      .slice(0, 3)
      .map((r) => `Reply: ${r.body}`)
      .join("\n");

    const body = req.body as { title?: unknown; assigneeAgentId?: unknown };
    const rawTitle = typeof body.title === "string" ? body.title.trim() : "";
    const title = rawTitle || sourceMessage.body.slice(0, 80);
    const assigneeAgentId = typeof body.assigneeAgentId === "string" ? body.assigneeAgentId : undefined;

    const description = replyContext ? `${sourceMessage.body}\n\n---\n${replyContext}` : sourceMessage.body;

    const actor = getActorInfo(req);
    const svc = issueService(db);
    const issue = await svc.create(companyId, {
      title,
      description,
      status: "todo",
      priority: "medium",
      assigneeAgentId: assigneeAgentId ?? undefined,
      createdByAgentId: actor.agentId ?? undefined,
      createdByUserId: actor.actorType === "user" ? actor.actorId : undefined,
    });

    // Post a status update back to the channel
    const statusMsg = await postMessage(db, {
      channelId,
      companyId,
      authorAgentId: actor.agentId ?? undefined,
      authorUserId: actor.actorType === "user" ? actor.actorId : undefined,
      body: `Created issue: ${title}`,
      messageType: "status_update",
      linkedIssueId: issue.id,
    });

    publishLiveEvent({
      companyId,
      type: "channel.message",
      payload: { message: statusMsg, channelId },
    });

    res.status(201).json(issue);
  });

  // -------------------------------------------------------------------------
  // Phase 8 - Enhancement 7: Quorum Detection
  // GET /api/companies/:companyId/channels/:channelId/messages/:messageId/quorum
  // -------------------------------------------------------------------------
  router.get("/companies/:companyId/channels/:channelId/messages/:messageId/quorum", async (req, res) => {
    const companyId = req.params.companyId as string;
    const channelId = req.params.channelId as string;
    const messageId = req.params.messageId as string;
    assertCompanyAccess(req, companyId);

    const channel = await db
      .select({ id: agentChannels.id })
      .from(agentChannels)
      .where(eq(agentChannels.id, channelId))
      .then((rows) => rows[0] ?? null);

    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    const quorum = await checkQuorum(db, channelId, messageId);
    res.json(quorum);
  });

  // -------------------------------------------------------------------------
  // Phase 8 - Enhancement 4: Cross-Channel Overlap
  // GET /api/companies/:companyId/channels/:channelId/overlap?q=...
  // -------------------------------------------------------------------------
  router.get("/companies/:companyId/channels/:channelId/overlap", async (req, res) => {
    const companyId = req.params.companyId as string;
    const channelId = req.params.channelId as string;
    assertCompanyAccess(req, companyId);

    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) {
      res.json(null);
      return;
    }

    const match = await detectCrossChannelOverlap(db, companyId, q, channelId);
    res.json(match);
  });

  return router;
}
