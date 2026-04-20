/**
 * Client-side types for the G.25 adapter-call audit log (Request/Response Explorer).
 * Mirrors server-side Drizzle select types; kept separate to avoid bundling DB deps.
 */

export type AdapterCallSource = "agent" | "playground" | "replay" | "unknown";
export type AdapterCallStatus = "success" | "error";

/** Shape returned by the list endpoint (no promptPayload / responsePayload). */
export interface AdapterCallListItem {
  id: string;
  companyId: string;
  agentId: string | null;
  adapterType: string;
  model: string;
  status: AdapterCallStatus;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsdCents: number | null;
  source: AdapterCallSource;
  replayOf: string | null;
  errorCode: string | null;
  promptPreview: string | null;
  responsePreview: string | null;
  adapterConfigSnapshot: Record<string, unknown> | null;
  requestId: string | null;
  occurredAt: string;
  createdAt: string;
}

/** Shape returned by the detail endpoint (includes full payloads). */
export interface AdapterCallDetail extends AdapterCallListItem {
  promptPayload: unknown;
  responsePayload: unknown;
}

export interface AdapterCallListResponse {
  items: AdapterCallListItem[];
  nextCursor: string | null;
}

export interface AdapterCallListQuery {
  agent_id?: string;
  adapter_type?: string;
  status?: AdapterCallStatus;
  source?: AdapterCallSource;
  cursor?: string;
  limit?: number;
}

/** SSE event shapes from the replay endpoint. */
export type ReplaySseEvent =
  | { type: "delta"; chunk: string }
  | { type: "meta"; data: Record<string, unknown> }
  | { type: "error"; message: string }
  | { type: "done"; replayId: string; latencyMs: number; status: AdapterCallStatus };
