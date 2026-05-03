/**
 * Multi-tenant Telegram bridge.
 *
 * Each company that configures a Telegram bot token gets its own polling loop.
 * Messages become Issues; CEO agent responses are relayed back to Telegram.
 */

import type { Db } from "@ironworksai/db";
import { agents as agentsTable, issues as issuesTable, messagingBridges } from "@ironworksai/db";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { logger } from "../middleware/logger.js";
import { agentService } from "../services/agents.js";
import { issueService } from "../services/issues.js";
import { messagingBridgeService } from "../services/messaging-bridges.js";
import { secretService } from "../services/secrets.js";

// OpenRouter is the LLM transport for the Telegram bridge. Other providers
// (Ollama Cloud, direct Anthropic, etc.) are not used here even when
// available — the bridge defers to OpenRouter because it works for every
// workspace that has an OPENROUTER_API_KEY configured (the dominant case
// for free-Western model usage).
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const FALLBACK_CHAT_MODEL = "openai/gpt-oss-120b:free";

const TELEGRAM_API = "https://api.telegram.org";
const POLL_INTERVAL_MS = 10_000;
const MAX_TELEGRAM_MSG_LENGTH = 4000; // leave buffer under 4096 limit

// ── Intent classification ──

// In-memory per-chat conversation history. This is the only state the bridge
// keeps between Telegram messages so the CEO has continuity. Lost on restart
// (acceptable trade for v1 — DB-backed history is a follow-up).
const CHAT_HISTORY_LIMIT = 20;
type Turn = { role: "user" | "assistant"; content: string };
// SEC: cross-tenant key isolation — chatId alone collides if multiple bots talk to same Telegram chat
const chatHistory = new Map<string, Turn[]>(); // `${companyId}::${chatId}` → rolling history

// Per-chat record of issues the CEO has filed from this conversation. Lets us
// answer "close all the tasks you created" without forcing the operator to
// remember ATL-ids and lets the system prompt teach Holland what's open.
type FiledIssue = { id: string; identifier: string; title: string; createdAt: number };
// SEC: cross-tenant key isolation — chatId alone collides if multiple bots talk to same Telegram chat
const chatFiledIssues = new Map<string, FiledIssue[]>(); // `${companyId}::${chatId}` → filed issues

function chatKey(companyId: string, chatId: string): string {
  return `${companyId}::${chatId}`;
}

// Action tags the CEO can emit at the end of a reply. The bridge parses each
// one (in order) and executes the corresponding workspace action. Anything
// else stays as conversational text that gets sent back to Telegram.
const TAG_CREATE_TASK = /\[CREATE_TASK\]\s*title:\s*(.+?)\s*\|\s*description:\s*([\s\S]+?)(?=\n\[|$)/gi;
const TAG_CLOSE_TASK = /\[CLOSE_TASK\]\s*id:\s*([A-Z]+-\d+)(?:\s*\|\s*reason:\s*([^\n]+))?/gi;
const TAG_CLOSE_ALL_FROM_CHAT = /\[CLOSE_ALL_FROM_CHAT\](?:\s*\|\s*reason:\s*([^\n]+))?/gi;
const TAG_REASSIGN =
  /\[REASSIGN\]\s*id:\s*([A-Z]+-\d+)\s*\|\s*to:\s*([^|\n]+?)(?:\s*\|\s*reason:\s*([^\n]+))?(?=\n|$)/gi;
const TAG_ADD_COMMENT = /\[ADD_COMMENT\]\s*id:\s*([A-Z]+-\d+)\s*\|\s*body:\s*([\s\S]+?)(?=\n\[|$)/gi;
const ALL_TAGS_RE = /\[(?:CREATE_TASK|CLOSE_TASK|CLOSE_ALL_FROM_CHAT|REASSIGN|ADD_COMMENT)\][^\n]*(?:\n(?!\[).+)*/gi;

// Read the CEO agent for this workspace so the chat persona reflects whatever
// the operator has named/configured for that role. Falls back to a generic
// "the CEO" identity if no row is found, and to the workspace-default model
// from the matrix if the agent has no adapter_config.model set.
async function loadCeoPersona(db: Db, companyId: string): Promise<{ persona: string; model: string }> {
  try {
    const ceo = await db
      .select({ name: agentsTable.name, title: agentsTable.title, adapterConfig: agentsTable.adapterConfig })
      .from(agentsTable)
      .where(and(eq(agentsTable.companyId, companyId), eq(agentsTable.role, "ceo")))
      .then((rows) => rows[0] ?? null);
    const name = (ceo?.name ?? "").trim();
    const title = (ceo?.title ?? "").trim();
    const persona =
      name && title && name.toLowerCase() !== "ceo"
        ? `${name}, ${title}`
        : name && name.toLowerCase() !== "ceo"
          ? name
          : "the CEO";
    const cfg = (ceo?.adapterConfig ?? {}) as { model?: string };
    return { persona, model: cfg.model ?? FALLBACK_CHAT_MODEL };
  } catch {
    return { persona: "the CEO", model: FALLBACK_CHAT_MODEL };
  }
}

interface CeoTurn {
  reply: string;
  createTask: { title: string; description: string } | null;
}

interface ParsedActions {
  createTasks: Array<{ title: string; description: string }>;
  closeTasks: Array<{ identifier: string; reason: string | null }>;
  closeAllFromChat: { reason: string | null } | null;
  reassigns: Array<{ identifier: string; to: string; reason: string | null }>;
  addComments: Array<{ identifier: string; body: string }>;
}

function parseActions(raw: string): ParsedActions {
  const out: ParsedActions = {
    createTasks: [],
    closeTasks: [],
    closeAllFromChat: null,
    reassigns: [],
    addComments: [],
  };
  for (const m of raw.matchAll(TAG_CREATE_TASK)) {
    out.createTasks.push({ title: m[1].trim(), description: m[2].trim() });
  }
  for (const m of raw.matchAll(TAG_CLOSE_TASK)) {
    out.closeTasks.push({ identifier: m[1].trim(), reason: m[2]?.trim() ?? null });
  }
  for (const m of raw.matchAll(TAG_CLOSE_ALL_FROM_CHAT)) {
    out.closeAllFromChat = { reason: m[1]?.trim() ?? null };
  }
  for (const m of raw.matchAll(TAG_REASSIGN)) {
    out.reassigns.push({ identifier: m[1].trim(), to: m[2].trim(), reason: m[3]?.trim() ?? null });
  }
  for (const m of raw.matchAll(TAG_ADD_COMMENT)) {
    out.addComments.push({ identifier: m[1].trim(), body: m[2].trim() });
  }
  return out;
}

// Pre-load context so the CEO can answer status questions directly without
// needing tool calls. Pulls top open issues, the agent roster, and recent
// cost summary. Capped tight so we don't blow the prompt budget on every turn.
async function loadWorkspaceContext(db: Db, companyId: string): Promise<string> {
  const lines: string[] = [];
  try {
    const openRows = await db
      .select({
        identifier: issuesTable.identifier,
        title: issuesTable.title,
        status: issuesTable.status,
        assigneeAgentId: issuesTable.assigneeAgentId,
      })
      .from(issuesTable)
      .where(
        and(
          eq(issuesTable.companyId, companyId),
          inArray(issuesTable.status, ["backlog", "todo", "in_progress", "in_review", "blocked"]),
        ),
      )
      .orderBy(desc(issuesTable.updatedAt))
      .limit(15);

    if (openRows.length === 0) {
      lines.push("(no open issues)");
    } else {
      const agentMap = new Map<string, string>();
      const ids = openRows.map((r) => r.assigneeAgentId).filter(Boolean) as string[];
      if (ids.length > 0) {
        const agentRows = await db
          .select({ id: agentsTable.id, name: agentsTable.name })
          .from(agentsTable)
          .where(inArray(agentsTable.id, ids));
        for (const a of agentRows) agentMap.set(a.id, a.name);
      }
      for (const r of openRows) {
        const who = r.assigneeAgentId ? (agentMap.get(r.assigneeAgentId) ?? "(unassigned)") : "(unassigned)";
        lines.push(`- ${r.identifier} [${r.status}] (${who}): ${r.title.slice(0, 100)}`);
      }
    }
  } catch (err) {
    logger.warn({ err }, "[telegram-bridge] failed to load workspace context");
    lines.push("(context fetch failed)");
  }

  return lines.join("\n");
}

// One LLM call that drives the whole exchange. The CEO uses judgment to
// decide whether the message warrants action — and emits one or more action
// tags that the bridge translates into real workspace operations. Tags
// supported: CREATE_TASK, CLOSE_TASK, CLOSE_ALL_FROM_CHAT, REASSIGN.
async function runCeoTurn(
  db: Db,
  companyId: string,
  chatId: string,
  userMessage: string,
): Promise<{ reply: string; raw: string; actions: ParsedActions }> {
  const { persona, model } = await loadCeoPersona(db, companyId);
  const key = chatKey(companyId, chatId);
  const history = chatHistory.get(key) ?? [];
  const filed = chatFiledIssues.get(key) ?? [];
  const workspaceContext = await loadWorkspaceContext(db, companyId);

  // Inject the current filed-issue ledger as context so the CEO can speak
  // about specific tasks by ATL-id and act on them with CLOSE/REASSIGN tags.
  const filedContext =
    filed.length === 0
      ? "(no tasks filed from this Telegram thread yet)"
      : filed.map((f) => `- ${f.identifier}: ${f.title}`).join("\n");

  const systemPrompt = `You are ${persona}, chatting with the principal operator on Telegram. You are their chief-of-staff partner.

# Your CAPABILITIES (what you can actually do)

You can take real action on the workspace by ending your reply with one or more action tags. The bridge will execute them. Available tags:

[CREATE_TASK] title: <short title, <100 chars> | description: <full brief, multi-paragraph ok>
  - Files a new issue assigned to you (CEO).

[CLOSE_TASK] id: ATL-N | reason: <one line>
  - Closes (cancels) a specific issue by its identifier.

[CLOSE_ALL_FROM_CHAT] | reason: <one line>
  - Closes every issue you have filed from this Telegram thread. Use when the operator says "stop all" or "cancel everything I asked for."

[REASSIGN] id: ATL-N | to: <full agent name> | reason: <one line>
  - Reassigns an issue to a specific teammate by name. Use the exact name of the agent (Holland Reyes, Rhys Donovan, Theo Lindquist, Cora Whitfield, Sloane Pemberton, Ingrid Soriano, Bram Halloran, Genevieve Marchetti, Felix Brennan, Mira Voss, Quinn Aldridge, Vivian Hollis, Liam Petersen).

[ADD_COMMENT] id: ATL-N | body: <comment text, can be multi-line>
  - Posts a comment on an existing issue. Use this to leave a note for the team, give guidance, or capture a decision without changing the task itself.

You can emit MULTIPLE tags in one reply (e.g. CREATE_TASK followed by REASSIGN + ADD_COMMENT to delegate with guidance). Each tag goes on its own line.

# What you CANNOT do (be honest about limits)

You currently have NO ability to:
- Read files, code, or external URLs
- Send email, Slack, or other external messages
- Halt running agents or pause heartbeats
- Query the knowledge base or library
- Read internal data beyond what's listed in this prompt

If the operator asks for something not in your CAPABILITIES, say honestly that you cannot do it yet and suggest the closest thing you can do (e.g. "I can file a task for the team to investigate" instead of pretending to have done it).

# Active tasks you have filed from this Telegram thread

${filedContext}

# Open issues across the workspace (for context — answer questions like "what's open" / "what's on Theo's plate" directly from this list)

${workspaceContext}

# How to decide

- Most messages are conversation. Respond naturally - brief, warm, professional, 1-3 sentences. No tags.
- Greetings / status updates / casual chat: reply, no tags.
- Questions you can answer directly from your knowledge: reply, no tags.
- The operator clearly wants action: emit the appropriate tag(s) AND a brief acknowledgment.
- The operator wants you to halt work: emit CLOSE_ALL_FROM_CHAT (with a clear reason).
- Operator wants to delegate to someone specific: file CREATE_TASK + REASSIGN, or just REASSIGN if the task already exists.
- If unsure, ask a clarifying question instead of guessing the action.

# Style rules (strict)

- Never use em dashes (—) or en dashes (–). Use regular dashes (-) or rewrite.
- No sparkle or decorative emoji.
- Plain text only. No markdown formatting.
- Keep replies under 4 sentences unless the operator asks for depth.`;

  const messages: Turn[] = [...history, { role: "user", content: userMessage }];

  let raw: string;
  try {
    const apiKey = process.env.ADAPTER_OPENROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY ?? "";
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        max_tokens: 800,
      }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "[telegram-bridge] CEO turn failed, returning fallback");
      return {
        reply: "Got it.",
        raw: "",
        actions: { createTasks: [], closeTasks: [], closeAllFromChat: null, reassigns: [], addComments: [] },
      };
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    raw = (data.choices?.[0]?.message?.content ?? "").trim();
  } catch (err) {
    logger.warn({ err }, "[telegram-bridge] CEO turn error, returning fallback");
    return {
      reply: "Got it.",
      raw: "",
      actions: { createTasks: [], closeTasks: [], closeAllFromChat: null, reassigns: [], addComments: [] },
    };
  }

  // Extract action tags first, then build the conversational reply by
  // stripping tag lines from the raw output.
  const actions = parseActions(raw);
  let reply = raw.replace(ALL_TAGS_RE, "").trim();
  // Strip em/en dashes belt-and-suspenders.
  reply = reply.replace(/[—–]/g, "-").slice(0, 1500);
  if (!reply) reply = "On it.";

  // Persist the turn — store the cleaned reply (no tags) so future turns
  // see what the user actually saw, not the raw model output.
  const updated: Turn[] = [...messages, { role: "assistant", content: reply }];
  chatHistory.set(key, updated.slice(-CHAT_HISTORY_LIMIT));

  return { reply, raw, actions };
}

// ── Types ──

interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
    from?: { first_name?: string; username?: string };
  };
}

interface BotInstance {
  companyId: string;
  token: string;
  ceoAgentId: string | null;
  ownerChatId: string | null;
  lastUpdateId: number;
  activeThreads: Map<string, string>; // chatId -> issueId
  lastSeenComment: Map<string, number>; // issueId -> timestamp
  abortController: AbortController;
  pollTimer: ReturnType<typeof setTimeout> | null;
  responsePollTimer: ReturnType<typeof setTimeout> | null;
}

// ── Module state ──

const bots = new Map<string, BotInstance>(); // companyId -> BotInstance

// ── Telegram API helpers ──

async function tgApi(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; result?: unknown; description?: string }> {
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as { ok: boolean; result?: unknown; description?: string };
  } catch (err) {
    return { ok: false, description: (err as Error).message };
  }
}

async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  // Split into chunks respecting Telegram's 4096-char limit
  for (let i = 0; i < text.length; i += MAX_TELEGRAM_MSG_LENGTH) {
    const chunk = text.slice(i, i + MAX_TELEGRAM_MSG_LENGTH);
    await tgApi(token, "sendMessage", {
      chat_id: chatId,
      text: chunk,
      parse_mode: "Markdown",
    });
  }
}

// ── Issue helpers ──

function getIssueService(db: Db) {
  return issueService(db);
}

async function createBridgeIssue(
  db: Db,
  companyId: string,
  ceoAgentId: string | null,
  title: string,
  description: string,
): Promise<{ id?: string; issueId?: string; identifier?: string; error?: string }> {
  const svc = getIssueService(db);
  try {
    const issue = await svc.create(companyId, {
      title: title.slice(0, 200),
      description,
      assigneeAgentId: ceoAgentId ?? undefined,
      status: "todo",
      originKind: "telegram_bridge",
    });
    return issue as { id?: string; issueId?: string; identifier?: string };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

async function addBridgeComment(
  db: Db,
  _companyId: string,
  issueId: string,
  body: string,
): Promise<{ error?: string }> {
  const svc = getIssueService(db);
  try {
    await svc.addComment(issueId, body, { userId: "telegram-bridge" });
    return {};
  } catch (err) {
    return { error: (err as Error).message };
  }
}

async function getIssueComments(db: Db, _companyId: string, issueId: string): Promise<Array<Record<string, unknown>>> {
  const svc = getIssueService(db);
  try {
    const comments = await svc.listComments(issueId, { limit: 50, order: "asc" });
    return (comments as Array<Record<string, unknown>>) ?? [];
  } catch {
    return [];
  }
}

// ── Resolve the CEO agent for a company ──

async function findCeoAgent(db: Db, companyId: string): Promise<string | null> {
  const svc = agentService(db);
  try {
    const agents = await svc.list(companyId);
    const ceo = (agents as Array<{ id: string; role?: string; title?: string }>).find(
      (a) => a.role?.toLowerCase() === "ceo" || a.title?.toLowerCase()?.includes("ceo"),
    );
    return ceo?.id ?? (agents as Array<{ id: string }>)[0]?.id ?? null;
  } catch {
    return null;
  }
}

// ── Resolve the bot token from a secret ──

async function _resolveToken(db: Db, companyId: string, secretId: string): Promise<string | null> {
  const svc = secretService(db);
  try {
    const value = await svc.resolveSecretValue(companyId, secretId, "latest");
    return value ?? null;
  } catch {
    return null;
  }
}

// ── Polling loops ──

function startTelegramPollLoop(db: Db, bot: BotInstance): void {
  async function poll() {
    if (bot.abortController.signal.aborted) return;

    try {
      const data = await tgApi(bot.token, "getUpdates", {
        offset: bot.lastUpdateId + 1,
        timeout: 30,
        allowed_updates: ["message"],
      });

      if (!data.ok || !Array.isArray(data.result) || data.result.length === 0) {
        schedulePoll();
        return;
      }

      for (const update of data.result as TelegramUpdate[]) {
        bot.lastUpdateId = update.update_id;
        const msg = update.message;
        if (!msg?.text) continue;

        const chatId = String(msg.chat.id);
        const text = msg.text.trim();

        // Handle /start
        if (text === "/start") {
          await sendTelegram(
            bot.token,
            chatId,
            "Ironworks Bridge\n\nYour messages go directly to the CEO agent.\n\nCommands:\n/new - Start a new conversation thread\n/status - Check CEO response status",
          );
          continue;
        }

        // Handle /new
        if (text === "/new") {
          bot.activeThreads.delete(chatId);
          await sendTelegram(
            bot.token,
            chatId,
            "New thread started. Send your message and it will create a new task for the CEO.",
          );
          continue;
        }

        // Handle /status
        if (text === "/status") {
          const issueId = bot.activeThreads.get(chatId);
          if (!issueId) {
            await sendTelegram(bot.token, chatId, "No active thread. Send a message to start one.");
          } else {
            await sendTelegram(bot.token, chatId, `Active thread: ${issueId}\nWaiting for CEO response...`);
          }
          continue;
        }

        // Single-owner enforcement.
        // First chat to /start (or send any message) claims ownership of the
        // bot. After that, every other chat_id is rejected with a friendly
        // "private bot" message. The operator can reset the owner via the
        // Settings UI to transfer the channel.
        if (!bot.ownerChatId) {
          bot.ownerChatId = chatId;
          const bridgeSvc = messagingBridgeService(db);
          const bridge = await bridgeSvc.getByPlatform(bot.companyId, "telegram");
          if (bridge) {
            const config = (bridge.config ?? {}) as Record<string, unknown>;
            config.ownerChatId = chatId;
            await db
              .update(messagingBridges)
              .set({ config, updatedAt: new Date() })
              .where(eq(messagingBridges.id, bridge.id));
          }
          logger.info({ companyId: bot.companyId, chatId }, "[telegram-bridge] Owner claimed");
        } else if (chatId !== bot.ownerChatId) {
          await sendTelegram(
            bot.token,
            chatId,
            "This bot is private. Reach out to the workspace admin if you need access.",
          );
          logger.warn(
            { companyId: bot.companyId, chatId, owner: bot.ownerChatId },
            "[telegram-bridge] Rejected non-owner message",
          );
          continue;
        }

        // Drive every message through the CEO. The CEO decides whether the
        // turn warrants action (one or more tags) or is just conversation.
        const turn = await runCeoTurn(db, bot.companyId, chatId, text);
        const issueSvc = getIssueService(db);
        const actionLog: string[] = [];
        const filedKey = chatKey(bot.companyId, chatId);

        // Sanitize sender name once for any task-create tags (SEC-INTEG-004).
        const rawSenderName = msg.from?.first_name ?? msg.from?.username ?? "Unknown";
        const senderName = rawSenderName.replace(/[`*_~[\]<>]/g, "").slice(0, 50);

        // CREATE_TASK actions
        for (const t of turn.actions.createTasks) {
          const safeTitle = t.title.slice(0, 200);
          const safeBody = `${t.description}\n\n---\nOriginated from Telegram (${senderName}, chat ${chatId}). User's message: ${text.slice(0, 1000)}`;
          const issue = await createBridgeIssue(db, bot.companyId, bot.ceoAgentId, safeTitle, safeBody);
          if (issue.error) {
            actionLog.push(`couldn't create "${safeTitle.slice(0, 60)}": ${issue.error}`);
          } else {
            const newIssueId = issue.id ?? issue.issueId ?? "";
            const identifier = issue.identifier ?? newIssueId.slice(0, 8);
            bot.activeThreads.set(chatId, newIssueId);
            bot.lastSeenComment.set(newIssueId, Date.now());
            const filed = chatFiledIssues.get(filedKey) ?? [];
            filed.push({ id: newIssueId, identifier, title: safeTitle, createdAt: Date.now() });
            chatFiledIssues.set(filedKey, filed);
            actionLog.push(`filed ${identifier}`);
          }
        }

        // CLOSE_TASK actions
        for (const c of turn.actions.closeTasks) {
          try {
            const issue = await issueSvc.getByIdentifier(c.identifier, bot.companyId);
            if (!issue) {
              actionLog.push(`couldn't close ${c.identifier}: not found`);
              continue;
            }
            await issueSvc.update(issue.id, { status: "cancelled" });
            actionLog.push(`closed ${c.identifier}${c.reason ? ` (${c.reason})` : ""}`);
            // Remove from chat ledger if it was filed by this chat.
            const filed = chatFiledIssues.get(filedKey) ?? [];
            chatFiledIssues.set(
              filedKey,
              filed.filter((f) => f.identifier !== c.identifier),
            );
          } catch (err) {
            actionLog.push(`couldn't close ${c.identifier}: ${(err as Error).message.slice(0, 80)}`);
          }
        }

        // CLOSE_ALL_FROM_CHAT
        if (turn.actions.closeAllFromChat) {
          const filed = chatFiledIssues.get(filedKey) ?? [];
          if (filed.length === 0) {
            actionLog.push("no tasks to close from this thread");
          } else {
            let closed = 0;
            for (const f of filed) {
              try {
                await issueSvc.update(f.id, { status: "cancelled" });
                closed++;
              } catch {
                /* skip — keep going */
              }
            }
            chatFiledIssues.set(filedKey, []);
            actionLog.push(`closed ${closed} task${closed === 1 ? "" : "s"} from this thread`);
          }
        }

        // ADD_COMMENT actions
        for (const c of turn.actions.addComments) {
          try {
            const issue = await issueSvc.getByIdentifier(c.identifier, bot.companyId);
            if (!issue) {
              actionLog.push(`couldn't comment on ${c.identifier}: not found`);
              continue;
            }
            const result = await addBridgeComment(db, bot.companyId, issue.id, `[via Telegram CEO]: ${c.body}`);
            if (result.error) {
              actionLog.push(`couldn't comment on ${c.identifier}: ${result.error}`);
            } else {
              actionLog.push(`commented on ${c.identifier}`);
            }
          } catch (err) {
            actionLog.push(`couldn't comment on ${c.identifier}: ${(err as Error).message.slice(0, 80)}`);
          }
        }

        // REASSIGN actions
        for (const r of turn.actions.reassigns) {
          try {
            const issue = await issueSvc.getByIdentifier(r.identifier, bot.companyId);
            if (!issue) {
              actionLog.push(`couldn't reassign ${r.identifier}: not found`);
              continue;
            }
            const targetAgent = await db
              .select({ id: agentsTable.id })
              .from(agentsTable)
              .where(and(eq(agentsTable.companyId, bot.companyId), eq(agentsTable.name, r.to.trim())))
              .then((rows) => rows[0] ?? null);
            if (!targetAgent) {
              actionLog.push(`couldn't reassign ${r.identifier}: no agent named "${r.to}"`);
              continue;
            }
            await issueSvc.update(issue.id, { assigneeAgentId: targetAgent.id });
            actionLog.push(`reassigned ${r.identifier} to ${r.to.trim()}`);
          } catch (err) {
            actionLog.push(`couldn't reassign ${r.identifier}: ${(err as Error).message.slice(0, 80)}`);
          }
        }

        // Build outgoing Telegram message: conversational reply + action footer
        // (only if any actions ran). Keep the footer compact.
        const footer = actionLog.length > 0 ? `\n\n(${actionLog.join("; ")}.)` : "";
        await sendTelegram(bot.token, chatId, `${turn.reply}${footer}`);
      }
    } catch (err) {
      logger.error({ err, companyId: bot.companyId }, "[telegram-bridge] Poll error");
    }

    schedulePoll();
  }

  function schedulePoll() {
    if (bot.abortController.signal.aborted) return;
    bot.pollTimer = setTimeout(poll, 1000);
  }

  poll();
}

function startResponsePollLoop(db: Db, bot: BotInstance): void {
  async function pollResponses() {
    if (bot.abortController.signal.aborted) return;
    if (bot.activeThreads.size === 0) {
      scheduleResponsePoll();
      return;
    }

    for (const [chatId, issueId] of bot.activeThreads.entries()) {
      try {
        const comments = await getIssueComments(db, bot.companyId, issueId);
        const lastSeen = bot.lastSeenComment.get(issueId) ?? 0;

        const newComments = comments.filter((c) => {
          const createdAt = new Date((c.createdAt as string) ?? "").getTime();
          const isAgent = !!c.authorAgentId;
          const isUser = !!c.authorUserId;
          return createdAt > lastSeen && isAgent && !isUser;
        });

        for (const c of newComments) {
          const body = ((c.body as string) ?? "").trim();
          if (body) {
            await sendTelegram(bot.token, chatId, `CEO:\n${body}`);
          }
          const ts = new Date((c.createdAt as string) ?? "").getTime();
          if (ts > lastSeen) bot.lastSeenComment.set(issueId, ts);
        }
      } catch (err) {
        logger.error({ err, issueId }, "[telegram-bridge] Response poll error");
      }
    }

    scheduleResponsePoll();
  }

  function scheduleResponsePoll() {
    if (bot.abortController.signal.aborted) return;
    bot.responsePollTimer = setTimeout(pollResponses, POLL_INTERVAL_MS);
  }

  pollResponses();
}

// ── Public API ──

/**
 * Test a Telegram bot token by calling getMe.
 * Returns the bot username on success, or throws on failure.
 */
export async function testTelegramToken(token: string): Promise<string> {
  const result = await tgApi(token, "getMe", {});
  if (!result.ok) {
    throw new Error(result.description ?? "Invalid bot token");
  }
  const botInfo = result.result as { username?: string };
  return botInfo?.username ?? "unknown";
}

/**
 * Start a Telegram bot instance for a company.
 */
export async function startTelegramBridge(db: Db, companyId: string, token: string): Promise<void> {
  // Stop existing instance if any
  await stopTelegramBridge(companyId);

  const ceoAgentId = await findCeoAgent(db, companyId);

  // Load stored owner chat ID for startup notifications
  const bridgeSvc = messagingBridgeService(db);
  const bridge = await bridgeSvc.getByPlatform(companyId, "telegram");
  const storedConfig = (bridge?.config ?? {}) as Record<string, unknown>;
  const ownerChatId = (storedConfig.ownerChatId as string) ?? null;

  const bot: BotInstance = {
    companyId,
    token,
    ceoAgentId,
    ownerChatId,
    lastUpdateId: 0,
    activeThreads: new Map(),
    lastSeenComment: new Map(),
    abortController: new AbortController(),
    pollTimer: null,
    responsePollTimer: null,
  };

  bots.set(companyId, bot);

  // Update bridge status
  await bridgeSvc.updateStatus(companyId, "telegram", "connected");

  logger.info({ companyId }, "[telegram-bridge] started");

  // Send startup notification if we have an owner chat ID
  if (ownerChatId) {
    const now = new Date().toLocaleString("en-US", {
      timeZone: "America/Chicago",
      dateStyle: "short",
      timeStyle: "short",
    });
    sendTelegram(token, ownerChatId, `Server is back online. All systems operational. (${now} CT)`).catch((err) => {
      logger.warn({ err, companyId }, "[telegram-bridge] Failed to send startup notification");
    });
  }

  startTelegramPollLoop(db, bot);
  startResponsePollLoop(db, bot);
}

/**
 * Stop a Telegram bot instance for a company.
 */
export async function stopTelegramBridge(companyId: string): Promise<void> {
  const bot = bots.get(companyId);
  if (!bot) return;

  bot.abortController.abort();
  if (bot.pollTimer) clearTimeout(bot.pollTimer);
  if (bot.responsePollTimer) clearTimeout(bot.responsePollTimer);
  bots.delete(companyId);

  // SEC: drop all per-chat state for this company so map entries don't outlive the bot
  const prefix = `${companyId}::`;
  for (const k of chatHistory.keys()) {
    if (k.startsWith(prefix)) chatHistory.delete(k);
  }
  for (const k of chatFiledIssues.keys()) {
    if (k.startsWith(prefix)) chatFiledIssues.delete(k);
  }

  logger.info({ companyId }, "[telegram-bridge] stopped");
}

/**
 * Check if a Telegram bridge is running for a company.
 */
export function isTelegramBridgeRunning(companyId: string): boolean {
  return bots.has(companyId);
}

/**
 * Start all configured Telegram bridges on server startup.
 */
export async function startAllTelegramBridges(db: Db): Promise<void> {
  const bridgeSvc = messagingBridgeService(db);
  const secretSvc = secretService(db);

  // Load all telegram bridges that have a secretId
  const allBridges = await db
    .select()
    .from(messagingBridges)
    .where(and(eq(messagingBridges.platform, "telegram"), isNotNull(messagingBridges.secretId)));

  for (const bridge of allBridges) {
    if (!bridge.secretId) continue;
    try {
      let token: string | null = null;
      try {
        token = await secretSvc.resolveSecretValue(bridge.companyId, bridge.secretId, "latest");
      } catch (secretErr) {
        logger.warn(
          { secretErr, companyId: bridge.companyId },
          "[telegram-bridge] Secret decryption failed, trying TELEGRAM_BOT_TOKEN env",
        );
        token = process.env.TELEGRAM_BOT_TOKEN ?? null;
      }
      if (token) {
        await startTelegramBridge(db, bridge.companyId, token);
      }
    } catch (err) {
      logger.error({ err, companyId: bridge.companyId }, "[telegram-bridge] Failed to start bridge");
      await bridgeSvc.updateStatus(bridge.companyId, "telegram", "error", (err as Error).message);
    }
  }
}

/**
 * Clear the in-process bot registry between tests so a bot instance started
 * during one test does not respond to companyId lookups in a subsequent test.
 * Called by the global beforeEach in setup-singletons.ts.
 */
export function _resetSingletonsForTest(): void {
  bots.clear();
}
