/**
 * Skill extraction service — PR 2/6 of the IronWorks self-improving skill loop.
 *
 * Fires after an issue is completed or cancelled. Calls an OpenRouter LLM with
 * the extraction prompt, sanitises the response, and writes a `skill_recipes`
 * row with status='proposed'. No side effects beyond those two things.
 *
 * Operator approval (PR #3), matcher + injection (PR #4), and evaluation
 * rollup (PR #5) are deliberately NOT in this file — each concern ships in its
 * own PR so the codebase is coherent at every merge point.
 *
 * @see MDMP §3.3 "Extraction trigger" for the architectural rationale.
 * @see MDMP §2.6 for the privacy / sanitisation rules driving `sanitiseSkillBody`.
 */

import type { Db } from "@ironworksai/db";
import { agents, companySecrets, heartbeatRunEvents, heartbeatRuns, issues, skillRecipes } from "@ironworksai/db";
import { and, desc, eq } from "drizzle-orm";
import { logger } from "../middleware/logger.js";
import { resolveProviderSecret } from "./provider-secret-resolver.js";
import { checkCostOverhead, isSkillLoopCostDisabled } from "./skill-circuit-breaker.js";
import { SKILL_EXTRACTION_PROMPT_V1 } from "./skill-prompts.js";

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Primary extraction model. Deep-tier model chosen for procedure generalisation
 * quality over speed. Free-tier only; keep calls infrequent (once per completed
 * issue) to stay inside daily request headroom.
 *
 * @see MDMP §3.3 "Model choices summary"
 */
const PRIMARY_MODEL = "openai/gpt-oss-120b:free" as const;

/**
 * Fallback model activated when the primary model returns a rate-limit error or
 * non-retryable failure. Confirmed to follow structured-JSON instructions well.
 */
const FALLBACK_MODEL = "nousresearch/hermes-3-llama-3.1-405b:free" as const;

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Approximate token budget for the transcript snippet injected into the
 * extraction prompt. 3 K input tokens keeps the extraction call well inside
 * free-tier daily headroom even for a busy 200-issue/week fleet.
 *
 * @see MDMP §2.3 "Per-heartbeat overhead"
 */
const MAX_TRANSCRIPT_CHARS = 6_000; // ~3 K tokens at avg 2 chars/token

/**
 * How many recent heartbeat run events to pull for the transcript snippet.
 * Older events don't improve recipe quality and inflate extraction cost.
 */
const MAX_TRANSCRIPT_EVENTS = 20;

// ── Atlas Ops dogfood gate ───────────────────────────────────────────────────

/**
 * The skill loop is on-by-default for the Atlas Ops dogfood company and
 * off-by-default for every other tenant. Per-company settings UI ships in PR #3
 * or PR #6; for now, gate via env or the known Atlas Ops company UUID.
 *
 * Decision locked in MDMP §6 decision #6.
 */
const ATLAS_OPS_COMPANY_ID = "ec7708b1-11c8-4117-a2ff-02b4aebe9c76" as const;

function isSkillLoopEnabled(companyId: string): boolean {
  // Explicit opt-in via env var (e.g. in tests or staging)
  if (process.env.SKILL_LOOP_ENABLED === "true") return true;
  // Atlas Ops dogfood instance is always enabled
  return companyId === ATLAS_OPS_COMPANY_ID;
}

// ── Sanitiser ────────────────────────────────────────────────────────────────

/**
 * Scrub PII and business-sensitive data from extracted skill procedure text.
 *
 * Rules are intentionally conservative: a false-positive replacement
 * (`{{AMOUNT}}` where no real amount existed) is far less harmful than leaking
 * a real dollar figure or phone number into a company-wide skill recipe.
 *
 * The `knownSecretNames` parameter allows substring-matching against any secret
 * names registered in `company_secrets` so that token values, credential names,
 * and API-key references are also redacted.
 *
 * @see MDMP §2.6 "Sanitisation rules in extractor prompt"
 */
export function sanitiseSkillBody(text: string, knownSecretNames: string[] = []): string {
  let out = text;

  // Dollar amounts > $1 000 (covers $1,500 / $1500 / $1.5K etc.)
  // Handles: $1,234.56 / $1234 / $1.2M / $1.5K — all above threshold
  out = out.replace(/\$\s*[\d,]+(?:\.\d+)?(?:\s*[KMB])?/gi, (match) => {
    // Parse numeric value to decide whether it exceeds $1 000
    const numeric = Number.parseFloat(
      match
        .replace(/[$,\s]/g, "")
        .replace(/K$/i, "e3")
        .replace(/M$/i, "e6")
        .replace(/B$/i, "e9"),
    );
    return numeric > 1000 ? "{{AMOUNT}}" : match;
  });

  // Account numbers — run BEFORE phone so a bare 10-digit string like
  // "1234567890" is caught here rather than partially consumed by the phone
  // regex. Lookbehind/lookahead guard prevents matching inside longer tokens.
  out = out.replace(/(?<!\d)\d{8,}(?!\d)/g, "{{ACCOUNT}}");

  // Phone numbers — common US/international formats
  // Runs after account replacement so it only matches formatted phone patterns
  // (with punctuation/spaces) that survived the account scrub above.
  out = out.replace(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, "{{PHONE}}");

  // Email addresses
  out = out.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "{{EMAIL}}");

  // ISO dates (2026-04-25, 2026/04/25)
  out = out.replace(/\b\d{4}[-/]\d{2}[-/]\d{2}\b/g, "{{DATE}}");

  // Written dates ("March 5 2026", "March 5, 2026", "5 March 2026")
  const MONTHS =
    "(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
  out = out.replace(new RegExp(`\\b${MONTHS}\\s+\\d{1,2},?\\s+\\d{4}\\b`, "gi"), "{{DATE}}");
  out = out.replace(new RegExp(`\\b\\d{1,2}\\s+${MONTHS}\\s+\\d{4}\\b`, "gi"), "{{DATE}}");

  // Redact any string that exactly matches a known company secret name.
  // Simple substring replacement — secret names tend to be short identifiers
  // like "STRIPE_KEY" or "NOTION_TOKEN" and should never appear in recipes.
  for (const secretName of knownSecretNames) {
    // Guard against undefined/null entries that could come from a DB row with
    // a missing name column — defensive check before calling string methods.
    if (!secretName || secretName.length < 3) continue; // skip trivially short names
    // Escape any regex-special chars in the secret name before inserting
    const escaped = secretName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "gi"), "{{SECRET}}");
  }

  return out;
}

// ── LLM call ─────────────────────────────────────────────────────────────────

interface ExtractionLlmResponse {
  reusable: boolean;
  title: string;
  trigger_pattern: string;
  applicable_roles: string[];
  procedure_markdown: string;
  rationale: string;
  confidence: number;
}

/**
 * Call the OpenRouter chat completions endpoint directly with a fetch.
 *
 * We bypass the heartbeat adapter orchestrator deliberately — the orchestrator
 * is designed for full agent runs (session state, run events, budget hooks) and
 * wiring a fake agent context for a 3 K-token extraction call would add more
 * moving parts than it removes. A direct fetch keeps this service self-contained
 * and easy to unit-test via fetch mocking.
 *
 * Returns the parsed response, or throws on network/parsing error. Callers are
 * responsible for the fallback-model retry.
 */
async function callExtractionLlm(apiKey: string, model: string, userContent: string): Promise<ExtractionLlmResponse> {
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ironworks.ai",
      "X-Title": "IronWorks Skill Extraction",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SKILL_EXTRACTION_PROMPT_V1 },
        { role: "user", content: userContent },
      ],
      temperature: 0.2, // Low temperature for consistent structured output
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenRouter ${model} returned HTTP ${response.status}: ${body}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = json.choices?.[0]?.message?.content ?? "";
  // Strip markdown code fences if the model wraps its JSON output
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`LLM response was not valid JSON: ${content.slice(0, 200)}`);
  }

  // Validate the shape we need — avoid `any` casts by narrowing manually
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("LLM response root is not an object");
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.reusable !== "boolean") {
    throw new Error(`LLM response missing 'reusable' boolean: ${cleaned.slice(0, 200)}`);
  }

  return {
    reusable: obj.reusable,
    title: typeof obj.title === "string" ? obj.title : "",
    trigger_pattern: typeof obj.trigger_pattern === "string" ? obj.trigger_pattern : "",
    applicable_roles: Array.isArray(obj.applicable_roles)
      ? (obj.applicable_roles as string[]).filter((r) => typeof r === "string")
      : [],
    procedure_markdown: typeof obj.procedure_markdown === "string" ? obj.procedure_markdown : "",
    rationale: typeof obj.rationale === "string" ? obj.rationale : "",
    confidence: typeof obj.confidence === "number" ? Math.min(100, Math.max(0, Math.round(obj.confidence))) : 50,
  };
}

// ── Context assembly ──────────────────────────────────────────────────────────

async function fetchIssueContext(
  db: Db,
  issueId: string,
  companyId: string,
): Promise<{ title: string; status: string; description: string | null } | null> {
  const rows = await db
    .select({ title: issues.title, status: issues.status, description: issues.description })
    .from(issues)
    .where(and(eq(issues.id, issueId), eq(issues.companyId, companyId)))
    .limit(1);
  return rows[0] ?? null;
}

async function fetchAgentContext(
  db: Db,
  agentId: string,
): Promise<{ name: string; role: string; title: string | null } | null> {
  const rows = await db
    .select({ name: agents.name, role: agents.role, title: agents.title })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Pull the last N run events tied to this issue so we have a transcript snippet.
 *
 * We look up the most recent heartbeat run whose contextSnapshot references this
 * issueId, then pull events from that run. This avoids scanning all events for
 * the company and stays within the MAX_TRANSCRIPT_CHARS budget.
 */
async function fetchTranscriptSnippet(db: Db, agentId: string, issueId: string): Promise<string> {
  // Find the most recent run for this agent + issue
  const runRows = await db
    .select({ id: heartbeatRuns.id })
    .from(heartbeatRuns)
    .where(
      and(
        eq(heartbeatRuns.agentId, agentId),
        // Context snapshot is JSONB; filter without loading all rows
        // The cast is safe — contextSnapshot is always a JSONB object in practice
      ),
    )
    .orderBy(desc(heartbeatRuns.startedAt))
    .limit(10); // Small scan; we just need the one that matches this issue

  // Find which run had this issueId in its context
  let targetRunId: string | null = null;
  for (const row of runRows) {
    const fullRun = await db
      .select({ contextSnapshot: heartbeatRuns.contextSnapshot })
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.id, row.id))
      .limit(1)
      .then((r) => r[0] ?? null);

    const ctx = fullRun?.contextSnapshot as Record<string, unknown> | null;
    if (ctx?.issueId === issueId) {
      targetRunId = row.id;
      break;
    }
  }

  if (!targetRunId) return "(no transcript available)";

  const events = await db
    .select({ message: heartbeatRunEvents.message, eventType: heartbeatRunEvents.eventType })
    .from(heartbeatRunEvents)
    .where(eq(heartbeatRunEvents.runId, targetRunId))
    .orderBy(desc(heartbeatRunEvents.seq))
    .limit(MAX_TRANSCRIPT_EVENTS);

  // Reverse to chronological order and join into a readable snippet
  const lines = events
    .reverse()
    .map((e) => (e.message ? `[${e.eventType}] ${e.message}` : `[${e.eventType}]`))
    .join("\n");

  return lines.length > MAX_TRANSCRIPT_CHARS ? lines.slice(-MAX_TRANSCRIPT_CHARS) : lines;
}

async function fetchCompanySecretNames(db: Db, companyId: string): Promise<string[]> {
  const rows = await db
    .select({ name: companySecrets.name })
    .from(companySecrets)
    .where(eq(companySecrets.companyId, companyId));
  return rows.map((r) => r.name);
}

// ── Cost telemetry ────────────────────────────────────────────────────────────

/**
 * Record an extraction call in cost_events so the daily-spend Telegram alert
 * (and cost-rollup job) can track skill_loop overhead independently of agent
 * work spend.
 *
 * The `billingCode` field is repurposed as a category discriminator. We use
 * 'skill_loop' so queries can filter with `WHERE billing_code = 'skill_loop'`
 * without schema changes.
 *
 * @see MDMP §2.3 "Budget approach" — skill_loop as a separate budget bucket.
 */
async function recordExtractionCost(
  db: Db,
  opts: {
    companyId: string;
    agentId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  },
): Promise<void> {
  const { costEvents } = await import("@ironworksai/db");

  // OpenRouter free-tier costs $0 but we still record token usage so the
  // cost-overhead circuit breaker (PR #6) can compare against agent_work spend.
  await db.insert(costEvents).values({
    companyId: opts.companyId,
    agentId: opts.agentId,
    provider: "openrouter_api",
    biller: "openrouter_api",
    billingType: "metered_api",
    billingCode: "skill_loop",
    model: opts.model,
    inputTokens: opts.inputTokens,
    cachedInputTokens: 0,
    outputTokens: opts.outputTokens,
    costCents: 0, // Free-tier extraction costs $0 in v1
    occurredAt: new Date(),
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ProposeSkillOpts {
  companyId: string;
  issueId: string;
  agentId: string;
  /** Optional: the heartbeat run that concluded with this issue completion. */
  runId?: string;
}

export type SkillRecipeRow = typeof skillRecipes.$inferSelect;

/**
 * Propose a new skill recipe from a completed or cancelled issue.
 *
 * Steps:
 *   1. Guard: check feature flag for this company.
 *   2. Fetch issue, agent, transcript context.
 *   3. Call OpenRouter extraction LLM (primary → fallback on error).
 *   4. If LLM says reusable=false, log and return null.
 *   5. Sanitise procedure_markdown.
 *   6. Insert skill_recipes row with status='proposed'.
 *   7. Record extraction cost in cost_events (billingCode='skill_loop').
 *
 * Returns the inserted recipe row, or null when the issue was judged non-reusable
 * or the feature is disabled for this company.
 *
 * Callers MUST fire-and-forget: wrap in `.catch()` and never await inside the
 * issue-completion HTTP response path so extraction latency is invisible to
 * the user.
 */
export async function proposeSkillFromCompletedIssue(db: Db, opts: ProposeSkillOpts): Promise<SkillRecipeRow | null> {
  const { companyId, issueId, agentId, runId } = opts;

  if (!isSkillLoopEnabled(companyId)) {
    logger.debug({ companyId }, "[skill-extraction] skill loop disabled for company");
    return null;
  }

  // Fast denylist check first (in-memory, no DB hit) before the heavier DB query
  if (isSkillLoopCostDisabled(companyId)) {
    logger.info({ companyId }, "[skill-extraction] skill loop disabled by cost circuit breaker, skipping");
    return null;
  }

  // Async cost overhead check — if we're over threshold, add to denylist and skip
  const costCheck = await checkCostOverhead(db, companyId).catch((err) => {
    // Cost check failure must not block extraction — log and continue
    logger.warn({ err, companyId }, "[skill-extraction] cost overhead check failed (non-fatal), proceeding");
    return null;
  });

  if (costCheck?.shouldDisable) {
    logger.info(
      { companyId, ratio: costCheck.ratio },
      "[skill-extraction] cost circuit breaker triggered, skipping extraction",
    );
    return null;
  }

  // Gather context in parallel to keep latency low
  const [issue, agent, transcriptSnippet, secretNames] = await Promise.all([
    fetchIssueContext(db, issueId, companyId),
    fetchAgentContext(db, agentId),
    fetchTranscriptSnippet(db, agentId, issueId),
    fetchCompanySecretNames(db, companyId),
  ]);

  if (!issue) {
    logger.warn({ issueId, companyId }, "[skill-extraction] issue not found, skipping");
    return null;
  }

  if (!agent) {
    logger.warn({ agentId }, "[skill-extraction] agent not found, skipping");
    return null;
  }

  // Resolve the company's OpenRouter API key through the standard precedence chain
  const secret = await resolveProviderSecret(db, companyId, "openrouter_api");
  if (!secret.apiKey) {
    logger.warn({ companyId }, "[skill-extraction] no openrouter_api key available, skipping");
    return null;
  }

  const userContent = buildUserContent(issue, agent, transcriptSnippet);

  // Primary model with fallback on any error (rate-limit, server error, parse failure)
  let llmResult: ExtractionLlmResponse;
  // Widened to string so the fallback assignment compiles cleanly
  let modelUsed: string = PRIMARY_MODEL;

  try {
    llmResult = await callExtractionLlm(secret.apiKey, PRIMARY_MODEL, userContent);
  } catch (primaryErr) {
    logger.warn({ err: primaryErr, companyId, issueId }, "[skill-extraction] primary model failed, trying fallback");
    try {
      modelUsed = FALLBACK_MODEL;
      llmResult = await callExtractionLlm(secret.apiKey, FALLBACK_MODEL, userContent);
    } catch (fallbackErr) {
      logger.error(
        { err: fallbackErr, companyId, issueId },
        "[skill-extraction] fallback model also failed, aborting extraction",
      );
      return null;
    }
  }

  if (!llmResult.reusable) {
    logger.info({ companyId, issueId, agentId }, "[skill-extraction] skill extraction returned reusable=false");
    return null;
  }

  // Sanitise procedure markdown and rationale before persisting
  const sanitisedProcedure = sanitiseSkillBody(llmResult.procedure_markdown, secretNames);
  const sanitisedRationale = sanitiseSkillBody(llmResult.rationale, secretNames);
  const sanitisedTrigger = sanitiseSkillBody(llmResult.trigger_pattern, secretNames);

  const [inserted] = await db
    .insert(skillRecipes)
    .values({
      companyId,
      proposedByAgentId: agentId,
      sourceIssueId: issueId,
      sourceRunId: runId ?? null,
      title: llmResult.title.slice(0, 200),
      triggerPattern: sanitisedTrigger,
      procedureMarkdown: sanitisedProcedure,
      rationale: sanitisedRationale || null,
      applicableRoleTitles: llmResult.applicable_roles,
      status: "proposed",
      confidence: llmResult.confidence,
      extractorModel: modelUsed,
      metadata: {},
    })
    .returning();

  if (!inserted) {
    logger.error({ companyId, issueId }, "[skill-extraction] insert returned no row");
    return null;
  }

  logger.info(
    { companyId, issueId, recipeId: inserted.id, model: modelUsed, confidence: llmResult.confidence },
    "[skill-extraction] proposed skill recipe",
  );

  // Record extraction cost asynchronously — failures here must not affect the
  // recipe row that was already written.
  recordExtractionCost(db, {
    companyId,
    agentId,
    model: modelUsed,
    // Approximate token counts from character lengths — actual counts not available
    // without streaming the response with usage reporting. Good enough for telemetry.
    inputTokens: Math.ceil(userContent.length / 4),
    outputTokens: Math.ceil(llmResult.procedure_markdown.length / 4),
  }).catch((err) => {
    logger.warn({ err, companyId, issueId }, "[skill-extraction] cost recording failed (non-fatal)");
  });

  return inserted;
}

// ── User content builder ──────────────────────────────────────────────────────

function buildUserContent(
  issue: { title: string; status: string; description: string | null },
  agent: { name: string; role: string; title: string | null },
  transcript: string,
): string {
  const agentLabel = [agent.title, agent.role, agent.name].filter(Boolean).join(" / ");
  const desc = issue.description ? `\n\nDescription:\n${issue.description.slice(0, 1000)}` : "";

  return [
    `Issue: ${issue.title}`,
    `Status: ${issue.status}`,
    `Agent role: ${agentLabel}`,
    desc,
    "",
    "Transcript (recent steps):",
    transcript,
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}
