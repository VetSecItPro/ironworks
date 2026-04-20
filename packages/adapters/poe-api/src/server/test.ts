/**
 * Poe API environment self-test.
 *
 * Probes GET /v1/models with the configured API key. Failure modes map to
 * typed check codes so the IronWorks UI can surface actionable hints.
 */

import type { AdapterEnvironmentCheck, AdapterEnvironmentTestResult } from "@ironworksai/adapter-utils";
import { HttpAdapterAuthError, HttpAdapterNetworkError } from "@ironworksai/adapter-utils/http/errors";
import type { Transport } from "@ironworksai/adapter-utils/http/transport";

const POE_MODELS_URL = "https://api.poe.com/v1/models";
const ADAPTER_TYPE = "poe_api";

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
      code: "poe_api_key_missing",
      level: "error",
      message: "Poe API key is not configured.",
      hint: "Set apiKey in adapter config or ADAPTER_POE_API_KEY environment variable.",
    });
    return {
      adapterType: ADAPTER_TYPE,
      status: summarizeStatus(checks),
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  checks.push({
    code: "poe_api_key_present",
    level: "info",
    message: "API key is configured.",
  });

  try {
    const result = await transport.sendJson({
      url: POE_MODELS_URL,
      apiKey,
      body: null,
    });

    const body = result.body as Record<string, unknown> | null;
    const models = Array.isArray(body?.data) ? (body.data as unknown[]) : [];
    const count = models.length;

    checks.push({
      code: "poe_api_models_ok",
      level: "info",
      message: `Poe API is reachable. ${count} model${count !== 1 ? "s" : ""} available.`,
    });
  } catch (err) {
    if (err instanceof HttpAdapterAuthError) {
      checks.push({
        code: "poe_api_auth_failed",
        level: "error",
        message: "Poe API authentication failed. The API key may be invalid or revoked.",
        hint: "Verify your Poe API key at poe.com/api_key.",
      });
    } else if (err instanceof HttpAdapterNetworkError) {
      checks.push({
        code: "poe_api_network_error",
        level: "error",
        message: `Poe API is not reachable: ${err instanceof Error ? err.message : String(err)}`,
        hint: "Verify network connectivity from the IronWorks server to api.poe.com.",
      });
    } else {
      checks.push({
        code: "poe_api_probe_failed",
        level: "error",
        message: `Poe API probe failed: ${err instanceof Error ? err.message : String(err)}`,
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
