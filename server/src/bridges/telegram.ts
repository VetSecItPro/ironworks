/**
 * Multi-tenant Telegram bridge.
 *
 * Each company that configures a Telegram bot token gets its own polling loop.
 * Messages become Issues; CEO agent responses are relayed back to Telegram.
 */

import { and, eq, isNotNull } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import { messagingBridges } from "@ironworksai/db";
import { messagingBridgeService } from "../services/messaging-bridges.js";
import { issueService } from "../services/issues.js";
import { agentService } from "../services/agents.js";
import { secretService } from "../services/secrets.js";
import { logger } from "../middleware/logger.js";

const TELEGRAM_API = "https://api.telegram.org";
const POLL_INTERVAL_MS = 10_000;
const MAX_TELEGRAM_MSG_LENGTH = 4000; // leave buffer under 4096 limit

// ── Intent classification ──

const OBVIOUS_CHAT = /^(ok|yes|no|k|yep|nope|sure|thanks|thx|hi|hey|hello|yo)\.?!?$/i;
const EMOJI_ONLY = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u;

async function classifyIntent(text: string): Promise<"chat" | "task"> {
  const trimmed = text.trim();
  if (!trimmed) return "chat";
  if (EMOJI_ONLY.test(trimmed)) return "chat";
  if (OBVIOUS_CHAT.test(trimmed)) return "chat";

  // LLM classification for everything else
  try {
    const apiKey = process.env.OLLAMA_API_KEY ?? "";
    if (!apiKey) return "task"; // No key = fall back to task creation

    const response = await fetch("https://ollama.com/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "qwen3",
        messages: [
          {
            role: "system",
            content: "You are a message classifier for a CEO's Telegram bot. Classify the user's message as either TASK or CHAT.\n\nTASK: The user is giving a directive, asking for something to be done, reporting an issue, requesting information, or assigning work.\n\nCHAT: The user is making casual conversation, greeting, acknowledging, expressing emotion, giving status updates about themselves, or saying they're busy/unavailable.\n\nRespond with ONLY the word TASK or CHAT. Nothing else.",
          },
          {
            role: "user",
            content: text,
          },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, "[telegram-bridge] LLM classification failed, defaulting to task");
      return "task";
    }

    const data = await response.json() as { message?: { content?: string } };
    const answer = (data.message?.content ?? "").trim().toUpperCase();
    logger.debug({ intent: answer.includes("CHAT") ? "chat" : "task", text: text.slice(0, 50) }, "[telegram-bridge] Message classified");

    if (answer.includes("CHAT")) return "chat";
    return "task"; // Default to task if unclear
  } catch (err) {
    logger.warn({ err }, "[telegram-bridge] LLM classification error, defaulting to task");
    return "task";
  }
}

async function generateChatReply(text: string): Promise<string> {
  try {
    const apiKey = process.env.OLLAMA_API_KEY ?? "";
    if (!apiKey) return "Got it, Boss. Let me know when you need anything.";

    const response = await fetch("https://ollama.com/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "qwen3",
        messages: [
          {
            role: "system",
            content: "You are Marcus Cole, CEO of the company. You're chatting with the Boss (company owner) on Telegram. Keep responses brief (1-2 sentences), professional but warm. You're a confident leader who respects the boss's time. Never create tasks or mention issues. Just have a natural conversation.",
          },
          {
            role: "user",
            content: text,
          },
        ],
        stream: false,
      }),
    });

    if (!response.ok) return "Got it, Boss.";

    const data = await response.json() as { message?: { content?: string } };
    return (data.message?.content ?? "Got it, Boss.").trim().slice(0, 500);
  } catch {
    return "Got it, Boss. Let me know when you need anything.";
  }
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

async function getIssueComments(
  db: Db,
  _companyId: string,
  issueId: string,
): Promise<Array<Record<string, unknown>>> {
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
      (a) =>
        a.role?.toLowerCase() === "ceo" ||
        a.title?.toLowerCase()?.includes("ceo"),
    );
    return ceo?.id ?? (agents as Array<{ id: string }>)[0]?.id ?? null;
  } catch {
    return null;
  }
}

// ── Resolve the bot token from a secret ──

async function resolveToken(db: Db, companyId: string, secretId: string): Promise<string | null> {
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

        // Persist owner chat ID for startup notifications
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
        }

        // Regular message
        const existingIssueId = bot.activeThreads.get(chatId);

        if (!existingIssueId) {
          const intent = await classifyIntent(text);
          if (intent === "chat") {
            const reply = await generateChatReply(text);
            await sendTelegram(bot.token, chatId, reply);
            continue;
          }

          // Create new issue
          // SEC-INTEG-004: Sanitize Telegram content before creating issues
          const rawSenderName = msg.from?.first_name ?? msg.from?.username ?? "Unknown";
          const senderName = rawSenderName.replace(/[`*_~\[\]<>]/g, "").slice(0, 50);
          const safeText = text.slice(0, 4000);
          await sendTelegram(bot.token, chatId, "Creating task for CEO...");

          const issue = await createBridgeIssue(
            db,
            bot.companyId,
            bot.ceoAgentId,
            `[Telegram] ${safeText.slice(0, 150)}`,
            `Message from Telegram (${senderName}, chat ${chatId}):\n\n${safeText}`,
          );

          if (issue.error) {
            await sendTelegram(bot.token, chatId, `Error creating task: ${issue.error}`);
            continue;
          }

          const newIssueId = issue.id ?? issue.issueId ?? "";
          bot.activeThreads.set(chatId, newIssueId);
          bot.lastSeenComment.set(newIssueId, Date.now());
          await sendTelegram(
            bot.token,
            chatId,
            `Task created (${issue.identifier ?? newIssueId}). CEO will be notified on next heartbeat.\n\nI'll relay the CEO's response here.`,
          );
        } else {
          // Add comment to existing issue
          const result = await addBridgeComment(
            db,
            bot.companyId,
            existingIssueId,
            `[via Telegram]: ${text}`,
          );
          if (result.error) {
            await sendTelegram(bot.token, chatId, `Error: ${result.error}`);
          }
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
          const createdAt = new Date(
            (c.createdAt as string) ?? "",
          ).getTime();
          const isAgent = !!c.authorAgentId;
          const isUser = !!c.authorUserId;
          return createdAt > lastSeen && isAgent && !isUser;
        });

        for (const c of newComments) {
          const body = ((c.body as string) ?? "").trim();
          if (body) {
            await sendTelegram(bot.token, chatId, `CEO:\n${body}`);
          }
          const ts = new Date(
            (c.createdAt as string) ?? "",
          ).getTime();
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
export async function startTelegramBridge(
  db: Db,
  companyId: string,
  token: string,
): Promise<void> {
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
    const now = new Date().toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "short", timeStyle: "short" });
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
    .where(
      and(
        eq(messagingBridges.platform, "telegram"),
        isNotNull(messagingBridges.secretId),
      ),
    );

  for (const bridge of allBridges) {
    if (!bridge.secretId) continue;
    try {
      const token = await secretSvc.resolveSecretValue(
        bridge.companyId,
        bridge.secretId,
        "latest",
      );
      if (token) {
        await startTelegramBridge(db, bridge.companyId, token);
      }
    } catch (err) {
      logger.error({ err, companyId: bridge.companyId }, "[telegram-bridge] Failed to start bridge");
      await bridgeSvc.updateStatus(
        bridge.companyId,
        "telegram",
        "error",
        (err as Error).message,
      );
    }
  }
}
