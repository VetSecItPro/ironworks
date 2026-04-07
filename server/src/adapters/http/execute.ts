import type { AdapterExecutionContext, AdapterExecutionResult } from "../types.js";
import { asString, asNumber, parseObject } from "../utils.js";
import { sanitizeForPrompt, redactSecrets, PROMPT_MAX_LENGTHS } from "../../lib/prompt-security.js";

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { config, runId, agent, context } = ctx;
  const url = asString(config.url, "");
  if (!url) throw new Error("HTTP adapter missing url");
  // SEC-TAINT-003: Block SSRF — reject private/reserved IP targets
  try {
    const hostname = new URL(url).hostname;
    if (/^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|0\.|169\.254\.|localhost|::1|\[::1\])/.test(hostname)) {
      throw new Error("HTTP adapter URL resolves to a private or reserved address");
    }
  } catch (e) {
    if ((e as Error).message.includes("private or reserved")) throw e;
    throw new Error(`HTTP adapter URL is invalid: ${url}`);
  }

  const method = asString(config.method, "POST");
  const timeoutMs = asNumber(config.timeoutMs, 0);
  const headers = parseObject(config.headers) as Record<string, string>;
  const payloadTemplate = parseObject(config.payloadTemplate);

  // LLM01-A: Sanitize user-controllable context fields before sending to external webhook.
  // Clone context so we don't mutate the shared object, then sanitize in place.
  const sanitizedContext: Record<string, unknown> = context && typeof context === "object"
    ? { ...(context as Record<string, unknown>) }
    : {};
  const strField = (v: unknown) => (typeof v === "string" ? v : "");
  if (strField(sanitizedContext.taskContext)) {
    sanitizedContext.taskContext = sanitizeForPrompt(redactSecrets(strField(sanitizedContext.taskContext)), PROMPT_MAX_LENGTHS.taskContext);
  }
  if (strField(sanitizedContext.latestComment)) {
    sanitizedContext.latestComment = sanitizeForPrompt(redactSecrets(strField(sanitizedContext.latestComment)), PROMPT_MAX_LENGTHS.comment);
  }
  if (strField(sanitizedContext.ironworksMorningBriefing)) {
    sanitizedContext.ironworksMorningBriefing = redactSecrets(strField(sanitizedContext.ironworksMorningBriefing));
  }
  if (strField(sanitizedContext.ironworksOnboardingContext)) {
    sanitizedContext.ironworksOnboardingContext = redactSecrets(strField(sanitizedContext.ironworksOnboardingContext));
  }
  if (strField(sanitizedContext.ironworksRecentDocuments)) {
    sanitizedContext.ironworksRecentDocuments = redactSecrets(strField(sanitizedContext.ironworksRecentDocuments));
  }
  const body = { ...payloadTemplate, agentId: agent.id, runId, context: sanitizedContext };

  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      ...(timer ? { signal: controller.signal } : {}),
    });

    if (!res.ok) {
      throw new Error(`HTTP invoke failed with status ${res.status}`);
    }

    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      summary: `HTTP ${method} ${url}`,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
