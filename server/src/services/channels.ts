import { and, desc, eq, gt, gte, lt, sql } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import { agentChannels, agents, channelMemberships, channelMessages } from "@ironworksai/db";

export type Channel = typeof agentChannels.$inferSelect;
export type Message = typeof channelMessages.$inferSelect;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function upsertChannel(
  db: Db,
  companyId: string,
  scopeType: string,
  scopeId: string | null,
  name: string,
): Promise<string> {
  // Try to find existing channel first
  const existing = await db
    .select({ id: agentChannels.id })
    .from(agentChannels)
    .where(
      and(
        eq(agentChannels.companyId, companyId),
        eq(agentChannels.scopeType, scopeType),
        scopeId !== null
          ? eq(agentChannels.scopeId, scopeId)
          : sql`${agentChannels.scopeId} IS NULL`,
      ),
    )
    .then((rows) => rows[0] ?? null);

  if (existing) return existing.id;

  const [created] = await db
    .insert(agentChannels)
    .values({ companyId, scopeType, scopeId: scopeId ?? undefined, name })
    .returning({ id: agentChannels.id });

  return created.id;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Auto-create the #company channel for a company. Returns the channel id. */
export async function ensureCompanyChannel(db: Db, companyId: string): Promise<string> {
  return upsertChannel(db, companyId, "company", null, "company");
}

/** Auto-create a department channel. Returns the channel id. */
export async function ensureDepartmentChannel(
  db: Db,
  companyId: string,
  department: string,
): Promise<string> {
  return upsertChannel(db, companyId, "department", department, department);
}

/** Auto-create a project channel. Returns the channel id. */
export async function ensureProjectChannel(
  db: Db,
  companyId: string,
  projectId: string,
  projectName: string,
): Promise<string> {
  return upsertChannel(db, companyId, "project", projectId, projectName);
}

/**
 * Auto-join an agent to the #company channel and, if a department is
 * provided, to the department channel as well.
 */
export async function autoJoinAgentChannels(
  db: Db,
  companyId: string,
  agentId: string,
  department?: string,
): Promise<void> {
  const channelIds: string[] = [];

  const companyChannelId = await ensureCompanyChannel(db, companyId);
  channelIds.push(companyChannelId);

  if (department) {
    const deptChannelId = await ensureDepartmentChannel(db, companyId, department);
    channelIds.push(deptChannelId);
  }

  for (const channelId of channelIds) {
    // Upsert membership - ignore conflict if already a member
    await db
      .insert(channelMemberships)
      .values({ channelId, agentId })
      .onConflictDoNothing();
  }
}

/** List all channels for a company, with member count. */
export async function listChannels(db: Db, companyId: string): Promise<Channel[]> {
  return db
    .select()
    .from(agentChannels)
    .where(eq(agentChannels.companyId, companyId))
    .orderBy(agentChannels.createdAt);
}

/** Get paginated messages for a channel, newest first. */
export async function getMessages(
  db: Db,
  channelId: string,
  opts?: { limit?: number; before?: string },
): Promise<Message[]> {
  const limit = opts?.limit ?? 50;
  const conditions = [eq(channelMessages.channelId, channelId)];

  if (opts?.before) {
    // before is an ISO timestamp cursor
    conditions.push(lt(channelMessages.createdAt, new Date(opts.before)));
  }

  return db
    .select()
    .from(channelMessages)
    .where(and(...conditions))
    .orderBy(desc(channelMessages.createdAt))
    .limit(limit);
}

/**
 * Find the #company channel for a company. Returns the channel or null if it
 * doesn't exist yet (channels are created lazily on first agent join).
 */
export async function findCompanyChannel(
  db: Db,
  companyId: string,
): Promise<{ id: string } | null> {
  return db
    .select({ id: agentChannels.id })
    .from(agentChannels)
    .where(
      and(
        eq(agentChannels.companyId, companyId),
        eq(agentChannels.scopeType, "company"),
        sql`${agentChannels.scopeId} IS NULL`,
      ),
    )
    .then((rows) => rows[0] ?? null);
}

/**
 * Find the department channel for a given department. Returns null if the
 * channel doesn't exist yet or if department is null/empty.
 */
export async function findAgentDepartmentChannel(
  db: Db,
  companyId: string,
  department: string | null,
): Promise<{ id: string } | null> {
  if (!department) return null;
  return db
    .select({ id: agentChannels.id })
    .from(agentChannels)
    .where(
      and(
        eq(agentChannels.companyId, companyId),
        eq(agentChannels.scopeType, "department"),
        eq(agentChannels.scopeId, department),
      ),
    )
    .then((rows) => rows[0] ?? null);
}

/** Get last N messages from a channel for context injection, oldest first. */
export async function getRecentMessages(
  db: Db,
  channelId: string,
  limit: number,
): Promise<Message[]> {
  const rows = await db
    .select()
    .from(channelMessages)
    .where(eq(channelMessages.channelId, channelId))
    .orderBy(desc(channelMessages.createdAt))
    .limit(limit);
  // Return in chronological order (oldest first)
  return rows.reverse();
}

/** Post a message to a channel. */
export async function postMessage(
  db: Db,
  opts: {
    channelId: string;
    companyId: string;
    authorAgentId?: string;
    authorUserId?: string;
    body: string;
    messageType?: string;
    mentions?: string[];
    linkedIssueId?: string;
    replyToId?: string;
  },
): Promise<Message> {
  const [message] = await db
    .insert(channelMessages)
    .values({
      channelId: opts.channelId,
      companyId: opts.companyId,
      authorAgentId: opts.authorAgentId ?? null,
      authorUserId: opts.authorUserId ?? null,
      body: opts.body,
      messageType: opts.messageType ?? "message",
      mentions: opts.mentions ?? [],
      linkedIssueId: opts.linkedIssueId ?? null,
      replyToId: opts.replyToId ?? null,
    })
    .returning();

  // --- Escalation waterfall ---
  // When a non-#company channel receives an escalation message, auto-cross-post
  // a summary to #company and tag the CEO.
  if ((opts.messageType ?? "message") === "escalation") {
    try {
      const channel = await db
        .select({ scopeType: agentChannels.scopeType, name: agentChannels.name })
        .from(agentChannels)
        .where(eq(agentChannels.id, opts.channelId))
        .then((rows) => rows[0] ?? null);

      if (channel && channel.scopeType !== "company") {
        const companyChannel = await findCompanyChannel(db, opts.companyId);
        if (companyChannel) {
          // Find CEO agent id for the tag
          const ceoRow = await db
            .select({ id: agents.id, name: agents.name })
            .from(agents)
            .where(
              and(
                eq(agents.companyId, opts.companyId),
                sql`lower(${agents.role}) ~ '\\mceo\\M|\\mchief executive\\M'`,
              ),
            )
            .limit(1)
            .then((rows) => rows[0] ?? null);

          const ceoTag = ceoRow ? `@${ceoRow.name}` : "@CEO";
          const crossPostBody = `[ESCALATION from #${channel.name}] ${opts.body}\n\ncc ${ceoTag}`;

          await db.insert(channelMessages).values({
            channelId: companyChannel.id,
            companyId: opts.companyId,
            authorAgentId: opts.authorAgentId ?? null,
            authorUserId: opts.authorUserId ?? null,
            body: crossPostBody,
            messageType: "escalation",
            mentions: ceoRow ? [ceoRow.id] : [],
            linkedIssueId: opts.linkedIssueId ?? null,
            replyToId: null,
          });
        }
      }
    } catch {
      // Non-fatal: escalation cross-post errors must never block message delivery
    }
  }

  return message;
}

// ---------------------------------------------------------------------------
// Enhancement 1: Decision Registry
// ---------------------------------------------------------------------------

export interface DecisionRecord {
  messageId: string;
  decisionText: string;
  decidedByAgentId: string | null;
  decidedByUserId: string | null;
  linkedIssueId: string | null;
  createdAt: Date;
}

/** Return all decision (and optional escalation) messages from a channel. */
export async function extractDecisions(
  db: Db,
  channelId: string,
  since?: Date,
): Promise<DecisionRecord[]> {
  const conditions = [
    eq(channelMessages.channelId, channelId),
    eq(channelMessages.messageType, "decision"),
  ];
  if (since) {
    conditions.push(gte(channelMessages.createdAt, since));
  }

  const rows = await db
    .select({
      id: channelMessages.id,
      body: channelMessages.body,
      authorAgentId: channelMessages.authorAgentId,
      authorUserId: channelMessages.authorUserId,
      linkedIssueId: channelMessages.linkedIssueId,
      createdAt: channelMessages.createdAt,
    })
    .from(channelMessages)
    .where(and(...conditions))
    .orderBy(desc(channelMessages.createdAt));

  return rows.map((r) => ({
    messageId: r.id,
    decisionText: r.body,
    decidedByAgentId: r.authorAgentId,
    decidedByUserId: r.authorUserId,
    linkedIssueId: r.linkedIssueId,
    createdAt: r.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// Enhancement 2: @mention Response Tracking
// ---------------------------------------------------------------------------

export interface PendingMention {
  messageId: string;
  channelId: string;
  channelName: string;
  mentionedByName: string;
  body: string;
  createdAt: Date;
}

/**
 * Find messages that mention a specific agent where no reply from that agent
 * exists within the 3 messages posted after the mention.
 */
export async function getPendingMentions(
  db: Db,
  agentId: string,
  companyId: string,
): Promise<PendingMention[]> {
  // Get all messages in this company that mention the agent (mentions is jsonb array of strings)
  const mentionRows = await db
    .select({
      id: channelMessages.id,
      channelId: channelMessages.channelId,
      authorAgentId: channelMessages.authorAgentId,
      authorUserId: channelMessages.authorUserId,
      body: channelMessages.body,
      createdAt: channelMessages.createdAt,
    })
    .from(channelMessages)
    .where(
      and(
        eq(channelMessages.companyId, companyId),
        sql`${channelMessages.mentions} @> ${JSON.stringify([agentId])}::jsonb`,
      ),
    )
    .orderBy(desc(channelMessages.createdAt))
    .limit(50);

  if (mentionRows.length === 0) return [];

  // Gather unique channel ids
  const channelIds = [...new Set(mentionRows.map((r) => r.channelId))];

  // Fetch channel names
  const channelRows = await db
    .select({ id: agentChannels.id, name: agentChannels.name })
    .from(agentChannels)
    .where(sql`${agentChannels.id} = ANY(${channelIds})`);
  const channelNameMap = new Map(channelRows.map((c) => [c.id, c.name]));

  // Fetch author names for the mentioning messages
  const authorAgentIds = mentionRows
    .map((r) => r.authorAgentId)
    .filter((id): id is string => id !== null);

  const authorRows =
    authorAgentIds.length > 0
      ? await db
          .select({ id: agents.id, name: agents.name })
          .from(agents)
          .where(sql`${agents.id} = ANY(${authorAgentIds})`)
      : [];
  const authorNameMap = new Map(authorRows.map((a) => [a.id, a.name]));

  const pending: PendingMention[] = [];

  for (const mention of mentionRows) {
    // Check if the agent replied within the next 3 messages in the same channel
    const nextMessages = await db
      .select({ authorAgentId: channelMessages.authorAgentId })
      .from(channelMessages)
      .where(
        and(
          eq(channelMessages.channelId, mention.channelId),
          gt(channelMessages.createdAt, mention.createdAt),
        ),
      )
      .orderBy(channelMessages.createdAt)
      .limit(3);

    const agentReplied = nextMessages.some((m) => m.authorAgentId === agentId);
    if (agentReplied) continue;

    const mentionerName = mention.authorAgentId
      ? (authorNameMap.get(mention.authorAgentId) ?? "Unknown")
      : (mention.authorUserId ?? "User");

    pending.push({
      messageId: mention.id,
      channelId: mention.channelId,
      channelName: channelNameMap.get(mention.channelId) ?? mention.channelId,
      mentionedByName: mentionerName,
      body: mention.body,
      createdAt: mention.createdAt,
    });
  }

  return pending;
}

// ---------------------------------------------------------------------------
// Enhancement 4: Thread Pinning
// ---------------------------------------------------------------------------

/** Pin a message in a channel. Idempotent. */
export async function pinMessage(
  db: Db,
  channelId: string,
  messageId: string,
): Promise<void> {
  const channel = await db
    .select({ pinnedMessageIds: agentChannels.pinnedMessageIds })
    .from(agentChannels)
    .where(eq(agentChannels.id, channelId))
    .then((rows) => rows[0] ?? null);

  if (!channel) return;

  const current: string[] = channel.pinnedMessageIds ?? [];
  if (current.includes(messageId)) return;

  await db
    .update(agentChannels)
    .set({ pinnedMessageIds: [...current, messageId] })
    .where(eq(agentChannels.id, channelId));
}

/** Unpin a message from a channel. Idempotent. */
export async function unpinMessage(
  db: Db,
  channelId: string,
  messageId: string,
): Promise<void> {
  const channel = await db
    .select({ pinnedMessageIds: agentChannels.pinnedMessageIds })
    .from(agentChannels)
    .where(eq(agentChannels.id, channelId))
    .then((rows) => rows[0] ?? null);

  if (!channel) return;

  const updated = (channel.pinnedMessageIds ?? []).filter((id) => id !== messageId);
  await db
    .update(agentChannels)
    .set({ pinnedMessageIds: updated })
    .where(eq(agentChannels.id, channelId));
}

/** Get all pinned messages for a channel. */
export async function getPinnedMessages(
  db: Db,
  channelId: string,
): Promise<Message[]> {
  const channel = await db
    .select({ pinnedMessageIds: agentChannels.pinnedMessageIds })
    .from(agentChannels)
    .where(eq(agentChannels.id, channelId))
    .then((rows) => rows[0] ?? null);

  if (!channel || !channel.pinnedMessageIds || channel.pinnedMessageIds.length === 0) {
    return [];
  }

  const ids = channel.pinnedMessageIds;
  const rows = await db
    .select()
    .from(channelMessages)
    .where(sql`${channelMessages.id} = ANY(${ids})`);

  // Return in pinned order
  const rowMap = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => rowMap.get(id)).filter((r): r is Message => r !== undefined);
}

// ---------------------------------------------------------------------------
// Enhancement 6: Signal-to-Noise / Channel Health
// ---------------------------------------------------------------------------

export interface ChannelHealthResult {
  status: "healthy" | "quiet" | "noisy" | "stalled";
  messagesLast48h: number;
  decisionsLast7d: number;
  circularTopicScore: number;
}

/**
 * Evaluate channel health:
 * - quiet:   < 2 messages in 48 h
 * - noisy:   > 50 messages in 48 h with < 2 decisions
 * - stalled: > 8 messages sharing repeated keywords with no decision
 * - healthy: everything else
 */
export async function channelHealth(
  db: Db,
  channelId: string,
): Promise<ChannelHealthResult> {
  const now = new Date();
  const cutoff48h = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const cutoff7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(channelMessages)
    .where(
      and(
        eq(channelMessages.channelId, channelId),
        gte(channelMessages.createdAt, cutoff48h),
      ),
    );
  const messagesLast48h = Number(countRow?.count ?? 0);

  const [decisionRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(channelMessages)
    .where(
      and(
        eq(channelMessages.channelId, channelId),
        eq(channelMessages.messageType, "decision"),
        gte(channelMessages.createdAt, cutoff7d),
      ),
    );
  const decisionsLast7d = Number(decisionRow?.count ?? 0);

  // Circular topic detection: fetch last 20 messages and check keyword repetition
  const recentBodies = await db
    .select({ body: channelMessages.body, messageType: channelMessages.messageType })
    .from(channelMessages)
    .where(eq(channelMessages.channelId, channelId))
    .orderBy(desc(channelMessages.createdAt))
    .limit(20);

  // Extract significant words (>= 5 chars), count frequency
  const wordFreq = new Map<string, number>();
  for (const row of recentBodies) {
    const words = row.body
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= 5);
    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1);
    }
  }
  const repeatedWords = [...wordFreq.values()].filter((c) => c >= 3).length;
  const circularTopicScore = Math.min(repeatedWords, 10);

  const recentHasDecision = recentBodies.some((r) => r.messageType === "decision");

  let status: ChannelHealthResult["status"] = "healthy";

  if (messagesLast48h < 2) {
    status = "quiet";
  } else if (messagesLast48h > 50 && decisionsLast7d < 2) {
    status = "noisy";
  } else if (recentBodies.length > 8 && circularTopicScore >= 3 && !recentHasDecision) {
    status = "stalled";
  }

  return { status, messagesLast48h, decisionsLast7d, circularTopicScore };
}
