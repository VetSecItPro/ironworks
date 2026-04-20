/**
 * Shared types for the Providers API contract — mirrors server/src/routes/providers.ts.
 *
 * Endpoints:
 *   GET    /companies/:companyId/providers/:provider/status
 *   PUT    /companies/:companyId/providers/:provider/secret   (body: { apiKey })
 *   POST   /companies/:companyId/providers/:provider/test
 *   DELETE /companies/:companyId/providers/:provider/secret
 */

/** The four HTTP adapter provider types. Matches AGENT_ADAPTER_TYPES on the server. */
export type HttpAdapterProviderType = "poe_api" | "anthropic_api" | "openai_api" | "openrouter_api";

/** GET /.../providers/:provider/status */
export interface ProviderStatusResponse {
  configured: boolean;
  source: "workspace" | "env" | "none";
  /** Last four chars of the stored key — present when configured */
  keyLastFour?: string;
  lastTestedAt?: string;
  lastTestStatus?: "pass" | "fail" | "pending";
}

/** POST /.../providers/:provider/test */
export interface ProviderTestResponse {
  passed: boolean;
  error?: string;
  testedAt: string;
}

/** PUT body — value is never returned by the server */
export interface ProviderSecretPutBody {
  apiKey: string;
}
