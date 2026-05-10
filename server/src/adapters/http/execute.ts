import { PROMPT_MAX_LENGTHS, redactSecrets, sanitizeForPrompt } from "../../lib/prompt-security.js";
import { assertNoSsrf } from "../../lib/ssrf-guard.js";
import type { AdapterExecutionContext, AdapterExecutionResult } from "../types.js";
import { asNumber, asString, parseObject } from "../utils.js";

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { config, runId, agent, context } = ctx;
  const url = asString(config.url, "");
  if (!url) throw new Error("HTTP adapter missing url");
  // SEC-TAINT-003 + SEC-SSRF-HIGH-003 (2026-05-09): proper IP-after-DNS check.
  // Replaces the prior regex-only block which had bypasses for decimal/hex/octal
  // IPv4, IPv6-mapped IPv4, IPv6 unique-local + link-local, internal hostname
  // suffixes (.svc.cluster.local, .internal), and cloud-metadata hostnames.
  // See server/src/lib/ssrf-guard.ts for the full guard + ranges blocked.
  await assertNoSsrf(url);

  const method = asString(config.method, "POST");
  const timeoutMs = asNumber(config.timeoutMs, 0);
  const headers = parseObject(config.headers) as Record<string, string>;
  const payloadTemplate = parseObject(config.payloadTemplate);

  // LLM01-A: Sanitize user-controllable context fields before sending to external webhook.
  // Clone context so we don't mutate the shared object, then sanitize in place.
  const sanitizedContext: Record<string, unknown> =
    context && typeof context === "object" ? { ...(context as Record<string, unknown>) } : {};
  const strField = (v: unknown) => (typeof v === "string" ? v : "");
  if (strField(sanitizedContext.taskContext)) {
    sanitizedContext.taskContext = sanitizeForPrompt(
      redactSecrets(strField(sanitizedContext.taskContext)),
      PROMPT_MAX_LENGTHS.taskContext,
    );
  }
  if (strField(sanitizedContext.latestComment)) {
    sanitizedContext.latestComment = sanitizeForPrompt(
      redactSecrets(strField(sanitizedContext.latestComment)),
      PROMPT_MAX_LENGTHS.comment,
    );
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
