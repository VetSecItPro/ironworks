/**
 * OpenRouter API environment self-test.
 *
 * Probes POST /api/v1/chat/completions with a minimal request (1 token).
 * This is the cheapest possible auth verification — the model list endpoint
 * is not used because the transport substrate only supports POST, and a
 * minimal chat request confirms both connectivity and key validity in one call.
 */

import type { AdapterEnvironmentCheck, AdapterEnvironmentTestResult } from "@ironworksai/adapter-utils";
import { HttpAdapterAuthError, HttpAdapterNetworkError } from "@ironworksai/adapter-utils/http/errors";
import type { Transport } from "@ironworksai/adapter-utils/http/transport";
import { isAdapterDisabled } from "./kill-switch.js";

const ADAPTER_TYPE = "openrouter_api";
const PROBE_URL = "https://openrouter.ai/api/v1/chat/completions";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((c) => c.level === "error")) return "fail";
  if (checks.some((c) => c.level === "warn")) return "warn";
  return "pass";
}

function resolveApiKey(config: Record<string, unknown>): string | null {
  const raw = config.apiKey;
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const trimmed = raw.trim();
  const envRef = trimmed.match(/^\$\{([^}]+)\}$/);
  if (envRef) return process.env[envRef[1]] ?? null;
  return trimmed;
}

export type TestEnvironmentContext = {
  adapterType: string;
  config: Record<string, unknown>;
};

export async function testEnvironment(
  ctx: TestEnvironmentContext,
  transport: Transport,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];

  // Kill-switch: ADAPTER_DISABLE_OPENROUTER_API=1 → report as unavailable without probing
  if (isAdapterDisabled()) {
    checks.push({
      code: "openrouter_api_disabled",
      level: "error",
      message: "adapter disabled by ADAPTER_DISABLE_OPENROUTER_API env",
      hint: "Unset ADAPTER_DISABLE_OPENROUTER_API to re-enable this adapter.",
    });
    return {
      adapterType: ADAPTER_TYPE,
      status: summarizeStatus(checks),
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  const apiKey = resolveApiKey(ctx.config) ?? process.env.ADAPTER_OPENROUTER_API_KEY ?? null;
  if (!apiKey) {
    checks.push({
      code: "openrouter_api_key_missing",
      level: "error",
      message: "OpenRouter API key is not configured.",
      hint: "Set apiKey in adapter config or ADAPTER_OPENROUTER_API_KEY environment variable.",
    });
    return {
      adapterType: ADAPTER_TYPE,
      status: summarizeStatus(checks),
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  checks.push({
    code: "openrouter_api_key_present",
    level: "info",
    message: "API key is configured.",
  });

  // Probe: minimal chat completions request to verify auth and connectivity.
  // max_tokens: 1 minimizes cost. Non-streaming so the response is a single JSON object.
  const probeBody = {
    model: "openai/gpt-oss-120b:free",
    max_tokens: 1,
    messages: [{ role: "user", content: "ok" }],
  };

  // Use configured HTTP-Referer/X-Title or defaults so the probe is
  // attributed correctly in the OpenRouter dashboard.
  const httpReferer =
    typeof ctx.config.httpReferer === "string" && ctx.config.httpReferer.trim().length > 0
      ? ctx.config.httpReferer.trim()
      : "https://command.useapex.io";

  const xTitle =
    typeof ctx.config.xTitle === "string" && ctx.config.xTitle.trim().length > 0
      ? ctx.config.xTitle.trim()
      : "IronWorks";

  try {
    await transport.sendJson({
      url: PROBE_URL,
      apiKey,
      body: probeBody,
      extraHeaders: {
        "HTTP-Referer": httpReferer,
        "X-Title": xTitle,
      },
    });

    checks.push({
      code: "openrouter_api_probe_ok",
      level: "info",
      message: "OpenRouter API is reachable and authentication succeeded.",
    });
  } catch (err) {
    if (err instanceof HttpAdapterAuthError) {
      checks.push({
        code: "openrouter_api_auth_failed",
        level: "error",
        message: "OpenRouter API authentication failed. The API key may be invalid or revoked.",
        hint: "Verify your API key at https://openrouter.ai/keys.",
      });
    } else if (err instanceof HttpAdapterNetworkError) {
      checks.push({
        code: "openrouter_api_network_error",
        level: "error",
        message: `OpenRouter API is not reachable: ${err instanceof Error ? err.message : String(err)}`,
        hint: "Verify network connectivity from the IronWorks server to openrouter.ai.",
      });
    } else {
      checks.push({
        code: "openrouter_api_probe_failed",
        level: "error",
        message: `OpenRouter API probe failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return {
    adapterType: ADAPTER_TYPE,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
