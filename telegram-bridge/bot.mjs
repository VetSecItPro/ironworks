#!/usr/bin/env node
/**
 * Ironworks Telegram Bridge
 *
 * Routes Telegram messages to the Ironworks CEO agent via the issues API.
 * Each Telegram conversation becomes an Ironworks issue thread.
 * CEO responses (comments) are relayed back to Telegram.
 */

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const IRONWORKS_API_KEY = process.env.IRONWORKS_API_KEY;
const IRONWORKS_URL = process.env.IRONWORKS_URL || 'http://127.0.0.1:3100';
const COMPANY_ID = process.env.IRONWORKS_COMPANY_ID;
const CEO_AGENT_ID = process.env.IRONWORKS_CEO_AGENT_ID;
const ALLOWED_CHAT_IDS = (process.env.ALLOWED_CHAT_IDS || '').split(',').filter(Boolean);
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '10000', 10);

if (!TELEGRAM_TOKEN || !IRONWORKS_API_KEY || !COMPANY_ID || !CEO_AGENT_ID) {
  console.error('Missing required env vars: TELEGRAM_TOKEN, IRONWORKS_API_KEY, IRONWORKS_COMPANY_ID, IRONWORKS_CEO_AGENT_ID');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${IRONWORKS_API_KEY}`,
  'Content-Type': 'application/json',
};

// Track active conversation threads: chatId -> issueId
const activeThreads = new Map();
// Track last seen comment per issue to avoid duplicates
const lastSeenComment = new Map();

// --- Telegram API helpers ---

async function tgApi(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) console.error(`Telegram ${method} error:`, data.description);
  return data;
}

async function sendTelegram(chatId, text) {
  // Telegram has a 4096 char limit per message
  const chunks = [];
  for (let i = 0; i < text.length; i += 4000) {
    chunks.push(text.slice(i, i + 4000));
  }
  for (const chunk of chunks) {
    await tgApi('sendMessage', { chat_id: chatId, text: chunk, parse_mode: 'Markdown' });
  }
}

// --- Ironworks API helpers ---

async function createIssue(title, description) {
  const res = await fetch(`${IRONWORKS_URL}/api/companies/${COMPANY_ID}/issues`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: title.slice(0, 200),
      description,
      assigneeAgentId: CEO_AGENT_ID,
      status: 'todo',
    }),
  });
  return res.json();
}

async function addComment(issueId, body) {
  const res = await fetch(`${IRONWORKS_URL}/api/companies/${COMPANY_ID}/issues/${issueId}/comments`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ body }),
  });
  return res.json();
}

async function getComments(issueId) {
  const res = await fetch(`${IRONWORKS_URL}/api/companies/${COMPANY_ID}/issues/${issueId}/comments`, {
    method: 'GET',
    headers,
  });
  return res.json();
}

// --- Telegram polling ---

let lastUpdateId = 0;

async function pollTelegram() {
  try {
    const data = await tgApi('getUpdates', {
      offset: lastUpdateId + 1,
      timeout: 30,
      allowed_updates: ['message'],
    });

    if (!data.ok || !data.result?.length) return;

    for (const update of data.result) {
      lastUpdateId = update.update_id;
      const msg = update.message;
      if (!msg?.text) continue;

      const chatId = String(msg.chat.id);

      // Only allow messages from configured chat IDs
      if (ALLOWED_CHAT_IDS.length > 0 && !ALLOWED_CHAT_IDS.includes(chatId)) {
        console.log(`Ignoring message from unauthorized chat: ${chatId}`);
        await sendTelegram(chatId, '⛔ Unauthorized. Your chat ID is not in the allowlist.');
        continue;
      }

      const text = msg.text.trim();

      // Handle /start
      if (text === '/start') {
        await sendTelegram(chatId, '🏭 *Ironworks Bridge*\n\nYour messages go directly to the CEO agent.\n\nCommands:\n/new — Start a new conversation thread\n/status — Check CEO response status\n/cost — View agent budget overview');
        continue;
      }

      // Handle /new — close current thread, start fresh
      if (text === '/new') {
        activeThreads.delete(chatId);
        await sendTelegram(chatId, '🆕 New thread. Send your message and it will create a new task for the CEO.');
        continue;
      }

      // Handle /cost
      if (text === '/cost') {
        await handleCostCommand(chatId);
        continue;
      }

      // Handle /status
      if (text === '/status') {
        const issueId = activeThreads.get(chatId);
        if (!issueId) {
          await sendTelegram(chatId, 'No active thread. Send a message to start one.');
          continue;
        }
        await sendTelegram(chatId, `📋 Active thread: ${issueId}\nWaiting for CEO response...`);
        continue;
      }

      // Regular message — route to Ironworks
      const issueId = activeThreads.get(chatId);

      if (!issueId) {
        // No active thread — create a new issue
        console.log(`New conversation from ${chatId}: "${text.slice(0, 50)}..."`);
        await sendTelegram(chatId, '📨 Creating task for CEO...');

        const issue = await createIssue(
          `[Telegram] ${text.slice(0, 150)}`,
          `Message from Telegram (chat ${chatId}):\n\n${text}`
        );

        if (issue.error) {
          await sendTelegram(chatId, `❌ Error creating task: ${issue.error}`);
          continue;
        }

        const newIssueId = issue.id || issue.issueId;
        activeThreads.set(chatId, newIssueId);
        lastSeenComment.set(newIssueId, Date.now());
        await sendTelegram(chatId, `✅ Task created (${issue.identifier || newIssueId}). CEO will be notified on next heartbeat.\n\nI'll relay the CEO's response here.`);
      } else {
        // Active thread — add comment
        console.log(`Follow-up from ${chatId} on ${issueId}: "${text.slice(0, 50)}..."`);
        const comment = await addComment(issueId, `[Board via Telegram]: ${text}`);
        if (comment.error) {
          await sendTelegram(chatId, `❌ Error: ${comment.error}`);
        }
      }
    }
  } catch (err) {
    console.error('Telegram poll error:', err.message);
  }
}

// --- Ironworks comment polling (for CEO responses) ---

// Track when we last saw a heartbeat run to avoid polling when CEO hasn't run
let lastKnownRunTimestamp = 0;

async function checkForNewRuns() {
  try {
    const res = await fetch(
      `${IRONWORKS_URL}/api/companies/${COMPANY_ID}/agents/${CEO_AGENT_ID}/heartbeat-runs?limit=1`,
      { method: 'GET', headers }
    );
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const runTs = new Date(data[0].completedAt || data[0].createdAt || data[0].created_at).getTime();
      if (runTs > lastKnownRunTimestamp) {
        lastKnownRunTimestamp = runTs;
        return true; // New run detected
      }
    }
    return false;
  } catch {
    // If we can't check runs, poll anyway (safe fallback)
    return true;
  }
}

async function pollIronworksResponses() {
  if (activeThreads.size === 0) return;

  // Only poll comments if CEO has had a new run since last check
  const hasNewRun = await checkForNewRuns();
  if (!hasNewRun) return;

  for (const [chatId, issueId] of activeThreads.entries()) {
    try {
      const comments = await getComments(issueId);
      if (!Array.isArray(comments)) continue;

      const lastSeen = lastSeenComment.get(issueId) || 0;
      const newComments = comments.filter(c => {
        const createdAt = new Date(c.createdAt || c.created_at || c.updatedAt || c.updated_at).getTime();
        // Only show agent comments (not board/user comments we sent)
        const isAgent = c.authorAgentId || c.author_agent_id || c.authorType === 'agent';
        const isUser = c.authorUserId || c.author_user_id;
        return createdAt > lastSeen && isAgent && !isUser;
      });

      for (const c of newComments) {
        const body = c.body || c.content || '';
        if (body.trim()) {
          console.log(`CEO response on ${issueId}: "${body.slice(0, 50)}..."`);
          await sendTelegram(chatId, `🤖 *CEO:*\n${body}`);
        }
        const ts = new Date(c.createdAt || c.created_at || c.updatedAt || c.updated_at).getTime();
        if (ts > lastSeen) lastSeenComment.set(issueId, ts);
      }
    } catch (err) {
      console.error(`Error polling comments for ${issueId}:`, err.message);
    }
  }
}

// --- Telegram commands ---

// /cost command — check agent spend
async function handleCostCommand(chatId) {
  try {
    const res = await fetch(`${IRONWORKS_URL}/api/companies/${COMPANY_ID}/budgets/overview`, {
      method: 'GET', headers
    });
    const data = await res.json();
    if (data.error) {
      await sendTelegram(chatId, `❌ ${data.error}`);
      return;
    }
    const summary = JSON.stringify(data, null, 2).slice(0, 3500);
    await sendTelegram(chatId, `💰 *Budget Overview*\n\`\`\`\n${summary}\n\`\`\``);
  } catch (err) {
    await sendTelegram(chatId, `❌ Error fetching costs: ${err.message}`);
  }
}

// --- Main loop ---

console.log('🏭 Ironworks Telegram Bridge starting...');
console.log(`   Ironworks: ${IRONWORKS_URL}`);
console.log(`   Company: ${COMPANY_ID}`);
console.log(`   CEO Agent: ${CEO_AGENT_ID}`);
console.log(`   Allowed chats: ${ALLOWED_CHAT_IDS.length ? ALLOWED_CHAT_IDS.join(', ') : 'ALL (no restriction)'}`);
console.log(`   Poll interval: ${POLL_INTERVAL_MS}ms`);

// Telegram long-polling loop
async function telegramLoop() {
  while (true) {
    await pollTelegram();
  }
}

// Ironworks response polling loop
async function ironworksLoop() {
  while (true) {
    await pollIronworksResponses();
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
}

telegramLoop();
ironworksLoop();
