/**
 * Diagnose + repair the Telegram bridge.
 *
 * Usage:
 *   pnpm tsx scripts/diagnose-telegram-bot.ts [--company-id=<uuid>] [--fix]
 *
 * Without --fix: read-only diagnosis (token validity, webhook state, polling state).
 * With --fix: also calls deleteWebhook to clear any stale webhook so polling can resume.
 *
 * If --company-id is omitted: iterates every company that has a TELEGRAM_BOT_TOKEN secret.
 *
 * After running with --fix, restart the server (or wait for the supervisor) so the bot
 * polling loop can pick up the cleared state.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { companies, companySecrets } from "@ironworksai/db";
import { secretService } from "../server/src/services/secrets.js";

const TELEGRAM_API = "https://api.telegram.org";

interface ParsedArgs {
  companyId: string | null;
  fix: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  let companyId: string | null = null;
  let fix = false;
  for (const arg of argv) {
    if (arg.startsWith("--company-id=")) {
      companyId = arg.slice("--company-id=".length);
    } else if (arg === "--fix") {
      fix = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: pnpm tsx scripts/diagnose-telegram-bot.ts [--company-id=<uuid>] [--fix]\n" +
          "  --company-id  Diagnose a single company (default: all companies with a TELEGRAM_BOT_TOKEN)\n" +
          "  --fix         Call deleteWebhook on bots with stale webhooks\n",
      );
      process.exit(0);
    }
  }
  return { companyId, fix };
}

async function tg(token: string, method: string, body: object = {}): Promise<unknown> {
  const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

interface DiagnosisRow {
  companyId: string;
  companyName: string;
  tokenValid: boolean | null;
  botUsername: string | null;
  webhookUrl: string | null;
  webhookCleared: boolean;
  notes: string[];
}

async function diagnose(db: ReturnType<typeof drizzle>, companyId: string, fix: boolean): Promise<DiagnosisRow> {
  const notes: string[] = [];
  const company = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  if (company.length === 0) {
    return {
      companyId,
      companyName: "<not found>",
      tokenValid: null,
      botUsername: null,
      webhookUrl: null,
      webhookCleared: false,
      notes: ["company not found"],
    };
  }
  const companyName = company[0].name;

  const svc = secretService(db);
  const secret = await svc.getByName(companyId, "TELEGRAM_BOT_TOKEN");
  if (!secret) {
    return {
      companyId,
      companyName,
      tokenValid: null,
      botUsername: null,
      webhookUrl: null,
      webhookCleared: false,
      notes: ["no TELEGRAM_BOT_TOKEN secret configured"],
    };
  }

  const token = await svc.resolveSecretValue(companyId, secret.id, "latest");
  if (!token) {
    return {
      companyId,
      companyName,
      tokenValid: null,
      botUsername: null,
      webhookUrl: null,
      webhookCleared: false,
      notes: ["secret exists but value cannot be resolved"],
    };
  }

  const me = (await tg(token, "getMe")) as { ok: boolean; result?: { username?: string }; description?: string };
  const tokenValid = me.ok === true;
  const botUsername = me.result?.username ?? null;
  if (!tokenValid) {
    notes.push(`getMe failed: ${me.description ?? "unknown"}`);
    return { companyId, companyName, tokenValid, botUsername, webhookUrl: null, webhookCleared: false, notes };
  }

  const wh = (await tg(token, "getWebhookInfo")) as { ok: boolean; result?: { url?: string } };
  const webhookUrl = wh.result?.url || null;
  let webhookCleared = false;

  if (webhookUrl) {
    notes.push(`stale webhook detected: ${webhookUrl}`);
    if (fix) {
      const del = (await tg(token, "deleteWebhook", { drop_pending_updates: false })) as { ok: boolean };
      webhookCleared = del.ok === true;
      notes.push(webhookCleared ? "deleteWebhook OK" : "deleteWebhook FAILED");
    } else {
      notes.push("re-run with --fix to delete the webhook");
    }
  }

  return { companyId, companyName, tokenValid, botUsername, webhookUrl, webhookCleared, notes };
}

async function main(): Promise<void> {
  const { companyId, fix } = parseArgs(process.argv.slice(2));

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql);

  let companyIds: string[];
  if (companyId) {
    companyIds = [companyId];
  } else {
    const rows = await db
      .select({ companyId: companySecrets.companyId })
      .from(companySecrets)
      .where(eq(companySecrets.name, "TELEGRAM_BOT_TOKEN"));
    companyIds = Array.from(new Set(rows.map((r) => r.companyId)));
  }

  if (companyIds.length === 0) {
    console.log("No companies with a TELEGRAM_BOT_TOKEN secret found.");
    await sql.end();
    return;
  }

  console.log(`Diagnosing ${companyIds.length} bot(s)... (fix=${fix})\n`);

  for (const id of companyIds) {
    const row = await diagnose(db, id, fix);
    console.log(`Company: ${row.companyName} (${row.companyId})`);
    console.log(`  Token valid: ${row.tokenValid === null ? "N/A" : row.tokenValid}`);
    if (row.botUsername) console.log(`  Bot: @${row.botUsername}`);
    console.log(`  Webhook URL: ${row.webhookUrl ?? "(none - polling can run)"}`);
    if (row.webhookCleared) console.log("  Webhook cleared: yes");
    for (const note of row.notes) console.log(`  ${note}`);
    console.log("");
  }

  console.log("Done. If --fix was applied, restart the server so the polling loop picks up the cleared state.");

  await sql.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
