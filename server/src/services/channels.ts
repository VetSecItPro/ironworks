import { and, desc, eq, lt, sql } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import { agentChannels, channelMemberships, channelMessages } from "@ironworksai/db";

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

  return message;
}
