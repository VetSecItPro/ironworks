/**
 * Multi-tenant Telegram bridge.
 *
 * Each company that configures a Telegram bot token gets its own polling loop.
 * Messages become Issues; CEO agent responses are relayed back to Telegram.
 */

import type { Db } from "@ironworksai/db";
import { agents as agentsTable, messagingBridges } from "@ironworksai/db";
import { and, eq, isNotNull } from "drizzle-orm";
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
const chatHistory = new Map<string, Turn[]>(); // chatId → rolling history
const ACTION_TAG_RE = /\[CREATE_TASK\]\s*title:\s*(.+?)\s*\|\s*description:\s*([\s\S]+?)(?:\n|$)/i;

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

// One LLM call that drives the whole exchange. The CEO uses judgment to
// decide whether the message warrants a task or just a conversational
// response. No upstream classifier — the CEO is the chief-of-staff.
async function runCeoTurn(db: Db, companyId: string, chatId: string, userMessage: string): Promise<CeoTurn> {
  const { persona, model } = await loadCeoPersona(db, companyId);
  const history = chatHistory.get(chatId) ?? [];

  const systemPrompt = `You are ${persona}, chatting with the principal operator on Telegram.

You are their chief-of-staff partner. Most messages are conversation: greetings, status updates, thinking out loud, asking questions. Respond naturally - brief, warm, professional, 1-3 sentences.

Sometimes the operator asks you to actually do something (research, draft, build, deliver). When you decide a concrete task is warranted, append a single line at the END of your reply in this exact format on its own line:

[CREATE_TASK] title: <short title under 100 chars> | description: <full task brief, can be multi-paragraph>

Only emit [CREATE_TASK] when:
- The operator clearly wants action taken (not just talking through an idea)
- The scope is concrete enough to brief the team
- You'd actually delegate this if you were a real CEO

Do NOT emit [CREATE_TASK] for:
- Greetings, status updates, casual conversation
- Questions you can answer directly
- Half-baked ideas the operator is still thinking through (ask clarifying questions instead)
- Acknowledgments

If unsure, ask a clarifying question instead of creating a task.

STYLE RULES (strict):
- Never use em dashes (—) or en dashes (–). Use regular dashes (-) or rewrite.
- No sparkle or decorative emoji.
- Plain text only. No markdown formatting.`;

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
        max_tokens: 600,
      }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "[telegram-bridge] CEO turn failed, returning fallback");
      return { reply: "Got it.", createTask: null };
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    raw = (data.choices?.[0]?.message?.content ?? "").trim();
  } catch (err) {
    logger.warn({ err }, "[telegram-bridge] CEO turn error, returning fallback");
    return { reply: "Got it.", createTask: null };
  }

  // Parse out the optional [CREATE_TASK] tag.
  const match = raw.match(ACTION_TAG_RE);
  let createTask: CeoTurn["createTask"] = null;
  let reply = raw;
  if (match) {
    createTask = { title: match[1].trim(), description: match[2].trim() };
    reply = raw.replace(ACTION_TAG_RE, "").trim() || "On it.";
  }

  // Strip em/en dashes belt-and-suspenders.
  reply = reply.replace(/[—–]/g, "-").slice(0, 1000);

  // Persist the turn (truncate to last N exchanges).
  const updated: Turn[] = [...messages, { role: "assistant", content: reply }];
  chatHistory.set(chatId, updated.slice(-CHAT_HISTORY_LIMIT));

  return { reply, createTask };
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
        // turn warrants creating a task (emits [CREATE_TASK] tag) or is just
        // conversation. No upstream classifier — single source of judgment.
        const turn = await runCeoTurn(db, bot.companyId, chatId, text);

        if (turn.createTask) {
          // Sanitize sender name (SEC-INTEG-004) before stamping into issue.
          const rawSenderName = msg.from?.first_name ?? msg.from?.username ?? "Unknown";
          const senderName = rawSenderName.replace(/[`*_~[\]<>]/g, "").slice(0, 50);
          const safeTitle = turn.createTask.title.slice(0, 200);
          const safeBody =
            `${turn.createTask.description}\n\n---\nOriginated from Telegram (${senderName}, chat ${chatId}). ` +
            `User's message: ${text.slice(0, 1000)}`;

          const issue = await createBridgeIssue(db, bot.companyId, bot.ceoAgentId, safeTitle, safeBody);
          if (issue.error) {
            await sendTelegram(bot.token, chatId, `${turn.reply}\n\n(Couldn't create task: ${issue.error})`);
          } else {
            const newIssueId = issue.id ?? issue.issueId ?? "";
            bot.activeThreads.set(chatId, newIssueId);
            bot.lastSeenComment.set(newIssueId, Date.now());
            await sendTelegram(bot.token, chatId, `${turn.reply}\n\n(Task ${issue.identifier ?? newIssueId} filed.)`);
          }
        } else {
          // Pure conversation turn — just relay the CEO's reply.
          await sendTelegram(bot.token, chatId, turn.reply);
        }
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
