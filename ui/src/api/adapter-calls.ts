import type { AdapterCallDetail, AdapterCallListQuery, AdapterCallListResponse } from "../types/adapter-calls";
import { ApiError, api } from "./client";

const BASE = "/api";

function buildListQuery(query?: AdapterCallListQuery): string {
  if (!query) return "";
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

export const adapterCallsApi = {
  list: (companyId: string, query?: AdapterCallListQuery) =>
    api.get<AdapterCallListResponse>(`/companies/${companyId}/adapter-calls${buildListQuery(query)}`),

  detail: (companyId: string, callId: string) =>
    api.get<AdapterCallDetail>(`/companies/${companyId}/adapter-calls/${callId}`),

  /**
   * Streams SSE replay of a recorded adapter call. Returns the raw Response so
   * the caller can read `chunk` frames from the body — EventSource is GET-only,
   * so we POST and parse SSE manually. Mirrors the api client's BASE + cookie
   * conventions so retry/auth behavior stays consistent.
   */
  replayStream: async (companyId: string, callId: string): Promise<Response> => {
    const res = await fetch(`${BASE}/companies/${companyId}/adapter-calls/${callId}/replay`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const errorBody = await res.json().catch(() => null);
      throw new ApiError(
        (errorBody as { error?: string } | null)?.error ?? `Replay failed: ${res.status}`,
        res.status,
        errorBody,
      );
    }
    return res;
  },
};
