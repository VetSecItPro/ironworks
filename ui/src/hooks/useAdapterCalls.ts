/**
 * React Query hooks for the G.25 adapter-call audit log.
 *
 * List hook: 30s staleTime — explorer is refreshed manually or on filter change,
 * not on every focus. Detail hook: 60s staleTime — detail rarely changes once
 * a call is written (immutable audit record).
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { AdapterCallDetail, AdapterCallListQuery, AdapterCallListResponse } from "../types/adapter-calls";

export function useAdapterCallList(companyId: string | null | undefined, query: AdapterCallListQuery = {}) {
  return useQuery({
    queryKey: ["adapter-calls", companyId, query],
    enabled: !!companyId,
    queryFn: () => {
      const params = new URLSearchParams();
      if (query.agent_id) params.set("agent_id", query.agent_id);
      if (query.adapter_type) params.set("adapter_type", query.adapter_type);
      if (query.status) params.set("status", query.status);
      if (query.source) params.set("source", query.source);
      if (query.cursor) params.set("cursor", query.cursor);
      if (query.limit != null) params.set("limit", String(query.limit));
      const qs = params.toString();
      return api.get<AdapterCallListResponse>(`/companies/${companyId}/adapter-calls${qs ? `?${qs}` : ""}`);
    },
    staleTime: 30_000,
    retry: false,
  });
}

export function useAdapterCallDetail(companyId: string | null | undefined, callId: string | null | undefined) {
  return useQuery({
    queryKey: ["adapter-calls", companyId, callId, "detail"],
    // Only fetch when both IDs are present — avoids 400 on partial renders
    enabled: !!companyId && !!callId,
    queryFn: () => api.get<AdapterCallDetail>(`/companies/${companyId}/adapter-calls/${callId}`),
    staleTime: 60_000,
    retry: false,
  });
}
