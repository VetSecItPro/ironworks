/**
 * Anthropic API environment self-test.
 *
 * Probes POST /v1/messages with a minimal single-token payload using the configured
 * API key. This exercises the full auth path without triggering significant cost
 * (1-token response using claude-haiku-4-5 as the probe model).
 *
 * Using POST /v1/messages rather than a GET probe because Anthropic has no public
 * model-list endpoint that accepts an API key for auth verification.
 */

import type { AdapterEnvironmentCheck, AdapterEnvironmentTestResult } from "@ironworksai/adapter-utils";
import { HttpAdapterAuthError, HttpAdapterNetworkError } from "@ironworksai/adapter-utils/http/errors";
import type { Transport } from "@ironworksai/adapter-utils/http/transport";

const ADAPTER_TYPE = "anthropic_api";

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

  const apiKey = resolveApiKey(ctx.config);
  if (!apiKey) {
    checks.push({
      code: "anthropic_api_key_missing",
      level: "error",
      message: "Anthropic API key is not configured.",
      hint: "Set apiKey in adapter config or ADAPTER_ANTHROPIC_API_KEY environment variable.",
    });
    return {
      adapterType: ADAPTER_TYPE,
      status: summarizeStatus(checks),
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  checks.push({
    code: "anthropic_api_key_present",
    level: "info",
    message: "API key is configured.",
  });

  // Probe: minimal /v1/messages call to verify auth and connectivity
  const probeBody = {
    model: "claude-haiku-4-5",
    max_tokens: 1,
    system: [{ type: "text", text: "Reply with: ok" }],
    messages: [{ role: "user", content: "ok" }],
  };

  try {
    await transport.sendJson({
      url: "https://api.anthropic.com/v1/messages",
      apiKey,
      body: probeBody,
    });

    checks.push({
      code: "anthropic_api_probe_ok",
      level: "info",
      message: "Anthropic API is reachable and authentication succeeded.",
    });
  } catch (err) {
    if (err instanceof HttpAdapterAuthError) {
      checks.push({
        code: "anthropic_api_auth_failed",
        level: "error",
        message: "Anthropic API authentication failed. The API key may be invalid or revoked.",
        hint: "Verify your API key at https://console.anthropic.com/settings/keys.",
      });
    } else if (err instanceof HttpAdapterNetworkError) {
      checks.push({
        code: "anthropic_api_network_error",
        level: "error",
        message: `Anthropic API is not reachable: ${err instanceof Error ? err.message : String(err)}`,
        hint: "Verify network connectivity from the IronWorks server to api.anthropic.com.",
      });
    } else {
      checks.push({
        code: "anthropic_api_probe_failed",
        level: "error",
        message: `Anthropic API probe failed: ${err instanceof Error ? err.message : String(err)}`,
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
