/**
 * Shared types for the Providers API contract.
 * The server-side Secrets subagent builds the endpoints; we define the shape here
 * so both sides can evolve toward the same contract.
 *
 * If the Secrets subagent diverges, see TODO flags below.
 */

/** The four HTTP adapter provider types. */
export type HttpAdapterProviderType = "poe" | "anthropic" | "openai" | "openrouter";

/**
 * Status response from GET /api/providers/{provider}/status.
 * TODO(contract): confirm `keyLastFour` field name with Secrets subagent.
 */
export interface ProviderStatusResponse {
  configured: boolean;
  lastTestedAt: string | null;
  /** "pass" | "fail" | "pending" | null when never tested */
  lastTestStatus: "pass" | "fail" | "pending" | null;
  /** Last four chars of the stored key — undefined when not configured */
  keyLastFour?: string;
}

/** Response from POST /api/providers/{provider}/test */
export interface ProviderTestResponse {
  ok: boolean;
  /** Human-readable message, e.g. "Connection successful" */
  message: string;
  testedAt: string;
}

/** PUT body for storing a key — value is never returned by the server */
export interface ProviderKeyPutBody {
  key: string;
}
