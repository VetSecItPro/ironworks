/**
 * Embedding worker scheduler - boots a single-flight polling timer.
 *
 * Pattern:
 *   - One timer per process (`startEmbeddingsScheduler` is idempotent).
 *   - Single-flight: a tick that runs longer than the interval is NOT
 *     overlapped - the next tick simply skips while `inFlight` is set.
 *     This protects DB connections + provider rate budget from amplification.
 *   - `unref()` so the timer doesn't hold the event loop open during
 *     graceful shutdown.
 *   - `stopEmbeddingsScheduler` clears the timer and awaits any in-flight
 *     tick so callers can rely on "no DB writes after this resolves".
 *
 * Tick interval is env-tunable via IRONWORKS_EMBEDDINGS_TICK_INTERVAL_MS
 * (default 5000ms).
 */

import type { Db } from "@ironworksai/db";
import { logger } from "../../middleware/logger.js";
import {
  embeddingJobsPending,
} from "../../observability/metrics.js";
import { getChunkingJobStats, getEmbeddingJobStats } from "./queue.js";
import { tickEmbeddingWorker } from "./worker.js";

const DEFAULT_TICK_INTERVAL_MS = 5_000;

interface SchedulerState {
  intervalId: NodeJS.Timeout | null;
  stopping: boolean;
  inFlight: Promise<void> | null;
}

const state: SchedulerState = {
  intervalId: null,
  stopping: false,
  inFlight: null,
};

function resolveTickIntervalMs(): number {
  const raw = process.env.IRONWORKS_EMBEDDINGS_TICK_INTERVAL_MS;
  if (!raw) return DEFAULT_TICK_INTERVAL_MS;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 250) return DEFAULT_TICK_INTERVAL_MS;
  return parsed;
}

/**
 * Start the embeddings scheduler. Idempotent - calling twice is a no-op.
 * The boot caller should invoke this once after the DB is ready.
 */
export function startEmbeddingsScheduler(db: Db): void {
  if (state.intervalId) return;
  state.stopping = false;

  const tickIntervalMs = resolveTickIntervalMs();
  logger.info({ tickIntervalMs }, "embeddings scheduler starting");

  const tickFn = (): void => {
    if (state.stopping) return;
    if (state.inFlight) return; // single-flight

    state.inFlight = (async () => {
      try {
        const result = await tickEmbeddingWorker(db);
        if (result.memoryDone + result.chunkDone + result.memoryFailed + result.chunkFailed > 0) {
          logger.debug(result, "embeddings tick");
        }
        await refreshPendingGauge(db);
      } catch (err) {
        logger.error({ err }, "embeddings tick crashed");
      } finally {
        state.inFlight = null;
      }
    })();
  };

  const interval = setInterval(tickFn, tickIntervalMs);
  // Don't keep the event loop alive on shutdown.
  interval.unref?.();
  state.intervalId = interval;
}

/**
 * Stop the scheduler. Clears the timer + awaits any in-flight tick to drain.
 * Safe to call when the scheduler was never started.
 */
export async function stopEmbeddingsScheduler(): Promise<void> {
  state.stopping = true;
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
  if (state.inFlight) {
    try {
      await state.inFlight;
    } catch {
      // Already logged in tickFn.
    }
  }
  state.inFlight = null;
  logger.info("embeddings scheduler stopped");
}

/** Test-only: introspection of internal state. */
export function __getEmbeddingsSchedulerState(): {
  running: boolean;
  inFlight: boolean;
} {
  return {
    running: state.intervalId !== null,
    inFlight: state.inFlight !== null,
  };
}

async function refreshPendingGauge(db: Db): Promise<void> {
  try {
    const memStats = await getEmbeddingJobStats(db);
    const chunkStats = await getChunkingJobStats(db);
    const statuses = ["pending", "claimed", "failed", "done"] as const;
    for (const status of statuses) {
      embeddingJobsPending.set({ status, target_type: "memory" }, memStats[status] ?? 0);
      embeddingJobsPending.set({ status, target_type: "page" }, chunkStats[status] ?? 0);
    }
  } catch (err) {
    logger.debug({ err }, "embeddings scheduler: failed to refresh pending gauge");
  }
}
