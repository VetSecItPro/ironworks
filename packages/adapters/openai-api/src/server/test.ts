/**
 * OpenAI API environment self-test.
 *
 * Probes GET /v1/models with the configured API key. OpenAI's model list endpoint
 * is the standard auth-verification path — it's cheap (no token generation) and
 * confirms both connectivity and key validity in one call.
 */

import type { AdapterEnvironmentCheck, AdapterEnvironmentTestResult } from "@ironworksai/adapter-utils";
import { HttpAdapterAuthError, HttpAdapterNetworkError } from "@ironworksai/adapter-utils/http/errors";
import type { Transport } from "@ironworksai/adapter-utils/http/transport";
import { isAdapterDisabled } from "./kill-switch.js";

const ADAPTER_TYPE = "openai_api";
// We probe using a minimal chat completions request rather than GET /v1/models
// because the transport substrate only supports POST. A single-token request
// against gpt-5-mini is the cheapest possible auth probe (~$0.000001).
const PROBE_URL = "https://api.openai.com/v1/chat/completions";

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

  // Kill-switch: ADAPTER_DISABLE_OPENAI_API=1 → report as unavailable without probing
  if (isAdapterDisabled()) {
    checks.push({
      code: "openai_api_disabled",
      level: "error",
      message: "adapter disabled by ADAPTER_DISABLE_OPENAI_API env",
      hint: "Unset ADAPTER_DISABLE_OPENAI_API to re-enable this adapter.",
    });
    return {
      adapterType: ADAPTER_TYPE,
      status: summarizeStatus(checks),
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  const apiKey = resolveApiKey(ctx.config) ?? process.env.ADAPTER_OPENAI_API_KEY ?? null;
  if (!apiKey) {
    checks.push({
      code: "openai_api_key_missing",
      level: "error",
      message: "OpenAI API key is not configured.",
      hint: "Set apiKey in adapter config or ADAPTER_OPENAI_API_KEY environment variable.",
    });
    return {
      adapterType: ADAPTER_TYPE,
      status: summarizeStatus(checks),
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  checks.push({
    code: "openai_api_key_present",
    level: "info",
    message: "API key is configured.",
  });

  // Probe: minimal chat completions request to verify auth and connectivity.
  // max_tokens: 1 minimizes cost (~$0.000001 on gpt-5-mini). Non-streaming so
  // the response is a single JSON object rather than an SSE stream.
  const probeBody = {
    model: "gpt-5-mini",
    max_tokens: 1,
    messages: [{ role: "user", content: "ok" }],
  };

  try {
    await transport.sendJson({
      url: PROBE_URL,
      apiKey,
      body: probeBody,
    });

    checks.push({
      code: "openai_api_probe_ok",
      level: "info",
      message: "OpenAI API is reachable and authentication succeeded.",
    });
  } catch (err) {
    if (err instanceof HttpAdapterAuthError) {
      checks.push({
        code: "openai_api_auth_failed",
        level: "error",
        message: "OpenAI API authentication failed. The API key may be invalid or revoked.",
        hint: "Verify your API key at https://platform.openai.com/api-keys.",
      });
    } else if (err instanceof HttpAdapterNetworkError) {
      checks.push({
        code: "openai_api_network_error",
        level: "error",
        message: `OpenAI API is not reachable: ${err instanceof Error ? err.message : String(err)}`,
        hint: "Verify network connectivity from the IronWorks server to api.openai.com.",
      });
    } else {
      checks.push({
        code: "openai_api_probe_failed",
        level: "error",
        message: `OpenAI API probe failed: ${err instanceof Error ? err.message : String(err)}`,
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
