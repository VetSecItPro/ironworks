import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { HttpAdapterProviderType, ProviderStatusResponse } from "../types/providers";

/**
 * Fetches provider key status from GET /api/providers/{provider}/status.
 * Stale after 30s — long enough to avoid hammering but short enough to reflect
 * a freshly-saved key without a manual refresh.
 */
export function useProviderStatus(provider: HttpAdapterProviderType): {
  status: ProviderStatusResponse | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["providers", provider, "status"],
    queryFn: () => api.get<ProviderStatusResponse>(`/providers/${provider}/status`),
    staleTime: 30_000,
    retry: false,
  });

  return {
    status: data,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
