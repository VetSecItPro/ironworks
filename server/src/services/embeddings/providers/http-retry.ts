/**
 * Shared retry/timeout helper for HTTP-based embedding providers.
 *
 * Policy (matches spec §"OpenAI Provider" / §"Ollama Provider"):
 *  - 3 attempts total
 *  - Standard backoff: 1s, 2s, 4s (exponential)
 *  - 429 backoff: 10s, 30s, 60s (longer to respect rate-limit signal)
 *  - 5xx → retry on the standard schedule
 *  - 4xx (not 429) → throw immediately, no retry (it's a client bug)
 *  - Each attempt timed out after `timeoutMs` via AbortController
 *
 * The helper does NOT parse response bodies - it only decides which attempts
 * are retriable. Callers parse + validate the successful response themselves.
 */

export interface RetryOptions {
  /** Per-attempt timeout. Default 30s. */
  timeoutMs?: number;
  /** Sleep function (override-able for tests using fake timers). */
  sleep?: (ms: number) => Promise<void>;
  /** Provider name, used only for error messages. */
  providerName: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const STANDARD_BACKOFF_MS = [1_000, 2_000, 4_000];
const RATE_LIMIT_BACKOFF_MS = [10_000, 30_000, 60_000];
const MAX_ATTEMPTS = 3;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run an HTTP request with the embedding-provider retry policy. Returns the
 * `Response` on success (caller parses body); throws if all retries are
 * exhausted or the failure is non-retriable.
 */
export async function fetchWithRetry(url: string, init: RequestInit, opts: RetryOptions): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sleep = opts.sleep ?? defaultSleep;

  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) return res;

      // Drain body so callers logging the error get useful text.
      const errText = await res.text().catch(() => "");

      if (res.status === 429) {
        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(RATE_LIMIT_BACKOFF_MS[attempt] ?? 60_000);
          lastErr = new Error(`${opts.providerName} 429 rate-limited (attempt ${attempt + 1}): ${errText}`);
          continue;
        }
        throw new Error(`${opts.providerName} 429 rate-limited after ${MAX_ATTEMPTS} attempts: ${errText}`);
      }

      if (res.status >= 500) {
        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(STANDARD_BACKOFF_MS[attempt] ?? 4_000);
          lastErr = new Error(`${opts.providerName} ${res.status} (attempt ${attempt + 1}): ${errText}`);
          continue;
        }
        throw new Error(`${opts.providerName} ${res.status} after ${MAX_ATTEMPTS} attempts: ${errText}`);
      }

      // 4xx (not 429) - client error, no retry.
      throw new Error(`${opts.providerName} ${res.status}: ${errText}`);
    } catch (err) {
      clearTimeout(timer);
      const isAbort = (err as Error)?.name === "AbortError";
      if (isAbort) {
        // Timeout - treat like 5xx and retry.
        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(STANDARD_BACKOFF_MS[attempt] ?? 4_000);
          lastErr = new Error(`${opts.providerName} request timed out after ${timeoutMs}ms (attempt ${attempt + 1})`);
          continue;
        }
        throw new Error(`${opts.providerName} request timed out after ${MAX_ATTEMPTS} attempts (${timeoutMs}ms each)`);
      }
      // Non-retriable thrown error (e.g. 4xx synth above) - bubble.
      throw err;
    }
  }
  // Unreachable in practice, but TS needs it.
  throw lastErr instanceof Error ? lastErr : new Error(`${opts.providerName}: exhausted retries`);
}
