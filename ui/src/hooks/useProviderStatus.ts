import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { HttpAdapterProviderType, ProviderStatusResponse } from "../types/providers";

/**
 * Fetches provider key status from GET /companies/{companyId}/providers/{provider}/status.
 * Stale after 30s — long enough to avoid hammering but short enough to reflect
 * a freshly-saved key without a manual refresh.
 *
 * `companyId` must be a real UUID, not the URL-prefix slug. Callers thread this
 * down from the resolved company in page-level scope.
 */
export function useProviderStatus(
  companyId: string | null | undefined,
  provider: HttpAdapterProviderType,
): {
  status: ProviderStatusResponse | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["providers", companyId, provider, "status"],
    enabled: !!companyId,
    queryFn: () =>
      api.get<ProviderStatusResponse>(`/companies/${companyId}/providers/${provider}/status`),
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
