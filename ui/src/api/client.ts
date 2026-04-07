const BASE = "/api";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/* ── Rate limit queue ── */

let rateLimitToastFn: ((msg: string) => void) | null = null;

/** Register a toast function so the API client can show "Slow down" messages. */
export function registerRateLimitToast(fn: (msg: string) => void) {
  rateLimitToastFn = fn;
}

/* ── Retry with exponential backoff ── */

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithRetry<T>(path: string, init?: RequestInit): Promise<T> {
  let lastError: ApiError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await requestOnce<T>(path, init);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;

      // Rate limit (429) - show toast and retry after the specified delay
      if (err.status === 429) {
        rateLimitToastFn?.("Slow down - too many requests. Retrying shortly.");
        const retryAfter = parseRetryAfter(err);
        await sleep(retryAfter);
        lastError = err;
        continue;
      }

      // Server error (5xx) - retry with exponential backoff
      if (err.status >= 500 && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await sleep(delay);
        lastError = err;
        continue;
      }

      // Expired session (401) - redirect to auth with return URL
      if (err.status === 401) {
        const currentUrl = window.location.pathname + window.location.search;
        const params = new URLSearchParams({ next: currentUrl, reason: "session_expired" });
        window.location.href = `/auth?${params.toString()}`;
        return new Promise<T>(() => {});
      }

      // Non-retryable error
      throw err;
    }
  }

  // All retries exhausted
  throw lastError ?? new Error("Request failed after retries");
}

function parseRetryAfter(err: ApiError): number {
  const body = err.body as Record<string, unknown> | null;
  if (body && typeof body === "object") {
    const retryAfter = body.retryAfter ?? body.retry_after;
    if (typeof retryAfter === "number") return retryAfter * 1000;
  }
  return 2000;
}

async function requestOnce<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? undefined);
  const body = init?.body;
  if (!(body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${BASE}${path}`, {
    headers,
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new ApiError(
      (errorBody as { error?: string } | null)?.error ?? `Request failed: ${res.status}`,
      res.status,
      errorBody,
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => requestWithRetry<T>(path),
  post: <T>(path: string, body: unknown) =>
    requestWithRetry<T>(path, { method: "POST", body: JSON.stringify(body) }),
  postForm: <T>(path: string, body: FormData) =>
    requestWithRetry<T>(path, { method: "POST", body }),
  put: <T>(path: string, body: unknown) =>
    requestWithRetry<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    requestWithRetry<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => requestWithRetry<T>(path, { method: "DELETE" }),
};
