import { writeHeapSnapshot } from "node:v8";
import { join } from "node:path";

import { logger } from "../middleware/logger.js";

/**
 * Heap-monitor wires up two pieces of observability we need to actually
 * diagnose the SteelMotion OOM at ~10h uptime (V8 hit the default ~2GB
 * old-space cap, GC couldn't recover, container SIGSEGV'd).
 *
 * 1. Periodic memory.usage logging at 5-minute intervals. The leak rate
 *    we're hunting is order-of-100MB/hour — visible in heap_used and rss
 *    after a few samples but invisible in single-shot logs. Sampling
 *    every 5 min gives 120 data points across a 10h run, enough to plot
 *    a clear growth curve and confirm whether the leak is steady, bursty,
 *    or correlated with heartbeat ticks.
 *
 * 2. SIGUSR2 → heap snapshot. Node's writeHeapSnapshot dumps the entire
 *    V8 heap to a .heapsnapshot file; Chrome DevTools loads it and shows
 *    every retained object grouped by constructor. Two snapshots taken
 *    hours apart and diffed in DevTools surface the leak retainer.
 *    Sending SIGUSR2 is non-disruptive (the process keeps serving while
 *    the snapshot is being written).
 *
 * Operator usage:
 *   docker exec ironworks-server-1 sh -c 'kill -USR2 1'
 *   # writes /ironworks/heap-snapshots/heap-2026-04-30T...heapsnapshot
 *   docker cp ironworks-server-1:/ironworks/heap-snapshots/. ./heaps/
 *   # Open in Chrome DevTools → Memory tab → Load profile.
 *
 * Both pieces are no-ops in tests (skipped when IRONWORKS_DISABLE_HEAP_MONITOR=true)
 * to avoid log noise + filesystem writes during vitest runs.
 */

const SAMPLE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SNAPSHOT_DIR_DEFAULT = "/ironworks/heap-snapshots";

function fmtMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function logMemorySample() {
  const mem = process.memoryUsage();
  // Compact one-line log — easy to grep and to extract via journalctl
  // for plotting. Keys mirror process.memoryUsage() so a consumer can
  // pull them without parsing free-form text.
  logger.info(
    {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
      // Pretty-printed redundant pair makes log scanning faster.
      pretty: `rss=${fmtMB(mem.rss)} heap=${fmtMB(mem.heapUsed)}/${fmtMB(mem.heapTotal)} ext=${fmtMB(mem.external)}`,
    },
    "memory-sample",
  );
}

function takeHeapSnapshot(snapshotDir: string) {
  // Run async-detached so the SIGUSR2 handler returns immediately.
  // writeHeapSnapshot itself is synchronous from Node's POV but the V8
  // heap is paused only briefly while the structure is walked; large
  // heaps can take 1-2s. Acceptable for a manual diagnostic action.
  setImmediate(() => {
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const path = join(snapshotDir, `heap-${ts}.heapsnapshot`);
      const written = writeHeapSnapshot(path);
      const mem = process.memoryUsage();
      logger.warn(
        { path: written, rss: mem.rss, heapUsed: mem.heapUsed },
        "heap-snapshot written",
      );
    } catch (err) {
      logger.error({ err }, "heap-snapshot failed");
    }
  });
}

/**
 * Install the heap-monitor side effects: 5-minute memory logging +
 * SIGUSR2 → heap snapshot. Idempotent — calling twice is harmless but
 * just registers duplicate handlers; only call from process startup.
 *
 * Returns a disposer that clears the interval and removes the signal
 * handler. Useful for tests that mount/unmount the server.
 */
export function installHeapMonitor(opts?: { snapshotDir?: string }): () => void {
  if (process.env.IRONWORKS_DISABLE_HEAP_MONITOR === "true") {
    return () => undefined;
  }

  const snapshotDir = opts?.snapshotDir ?? SNAPSHOT_DIR_DEFAULT;

  // Sample once at startup so the first data point lands in the log
  // without waiting 5 minutes — useful for confirming the monitor armed.
  logMemorySample();

  const timer = setInterval(logMemorySample, SAMPLE_INTERVAL_MS);
  // Don't keep the event loop alive just for the sampler.
  if (typeof timer.unref === "function") timer.unref();

  const onSigusr2 = () => takeHeapSnapshot(snapshotDir);
  process.on("SIGUSR2", onSigusr2);

  logger.info(
    { snapshotDir, sampleIntervalMs: SAMPLE_INTERVAL_MS },
    "heap-monitor armed (memory-sample every 5min, SIGUSR2 → heap snapshot)",
  );

  return () => {
    clearInterval(timer);
    process.off("SIGUSR2", onSigusr2);
  };
}
