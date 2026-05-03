import { chmod, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { writeHeapSnapshot } from "node:v8";

import { logger } from "../middleware/logger.js";

// SEC-HEAP-001: V8 heap snapshots contain the entire process memory by
// definition — including decrypted workspaceProviderSecrets, JWT signing
// material, telegram bot tokens, and OAuth credentials. Treat every
// .heapsnapshot file as a sensitive secret artifact: chmod 0600 to block
// other host users, and sweep files older than the retention horizon on
// each new write so they don't accumulate on disk indefinitely.

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

// Retention: drop snapshots older than this on each new write. Seven days
// gives operators a week-long window to grab a snapshot for a leak
// investigation; anything older is stale and not worth the disk footprint
// (or the secret-exposure risk if the volume is mounted elsewhere).
const SNAPSHOT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
// File mode for written snapshots: owner read+write only. Defense in depth —
// the snapshot dir should already be operator-only, but a 0600 file mode
// blocks any other UID inside the container or on the host volume from
// reading them if the dir mode regresses.
const SNAPSHOT_FILE_MODE = 0o600;

// Auto-snapshot triggers — close the gap that manual SIGUSR2 leaves open
// (operator asleep at 03:00 when leak crosses threshold = lost evidence).
//
// Two strategies:
// 1. Uptime markers — single snapshots at fixed wall-clock ages so we always
//    have a baseline (4h, before leak typically manifests) and a leak-window
//    sample (10h, when V8 old-space typically fills) that can be diffed.
// 2. Growth detector — fires when heapUsed grows monotonically across a
//    rolling window of samples (5 samples × 5min = 25min of strict growth).
//    Catches leaks that hit earlier or later than the uptime markers expect.
//
// Cooldown prevents snapshot spam: once a growth-trigger fires, suppress
// further auto-snapshots for COOLDOWN_MS so a runaway leak doesn't fill disk.
const UPTIME_SNAPSHOT_MARKERS_MS = [4, 10].map((h) => h * 60 * 60 * 1000);
const GROWTH_WINDOW_SAMPLES = 5;
const GROWTH_THRESHOLD_BYTES = 50 * 1024 * 1024; // 50 MB monotonic growth
const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes between auto-snapshots

function fmtMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function logMemorySample(): NodeJS.MemoryUsage {
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
  return mem;
}

async function sweepOldSnapshots(snapshotDir: string): Promise<void> {
  // SEC-HEAP-001: cap retention so secret-bearing snapshots don't accumulate.
  // Failure here must not stop the new snapshot from being written — log and
  // continue. The sweep is best-effort.
  try {
    const entries = await readdir(snapshotDir);
    const now = Date.now();
    for (const name of entries) {
      if (!name.endsWith(".heapsnapshot")) continue;
      const full = join(snapshotDir, name);
      try {
        const st = await stat(full);
        if (now - st.mtimeMs > SNAPSHOT_RETENTION_MS) {
          await unlink(full);
          logger.info({ path: full, ageMs: now - st.mtimeMs }, "heap-snapshot expired and removed");
        }
      } catch (err) {
        logger.warn({ err, path: full }, "heap-snapshot retention sweep skipped a file");
      }
    }
  } catch (err) {
    logger.warn({ err, snapshotDir }, "heap-snapshot retention sweep failed");
  }
}

function takeHeapSnapshot(snapshotDir: string) {
  // Run async-detached so the SIGUSR2 handler returns immediately.
  // writeHeapSnapshot itself is synchronous from Node's POV but the V8
  // heap is paused only briefly while the structure is walked; large
  // heaps can take 1-2s. Acceptable for a manual diagnostic action.
  setImmediate(async () => {
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const path = join(snapshotDir, `heap-${ts}.heapsnapshot`);
      const written = writeHeapSnapshot(path);
      // SEC-HEAP-001: tighten file mode immediately after V8 closes the fd.
      // writeHeapSnapshot honours the process umask, which on most container
      // images leaves files at 0644 — readable by any other UID with shell
      // access to the volume. chmod 0600 closes that.
      try {
        await chmod(written, SNAPSHOT_FILE_MODE);
      } catch (chmodErr) {
        logger.warn({ err: chmodErr, path: written }, "heap-snapshot chmod failed");
      }
      const mem = process.memoryUsage();
      logger.warn({ path: written, rss: mem.rss, heapUsed: mem.heapUsed }, "heap-snapshot written");
      // Sweep AFTER the new snapshot is on disk so a sweep failure can never
      // leave the operator with zero snapshots when they need one.
      await sweepOldSnapshots(snapshotDir);
    } catch (err) {
      logger.error({ err }, "heap-snapshot failed");
    }
  });
}

/**
 * Install the heap-monitor side effects:
 *  - 5-minute memory logging
 *  - SIGUSR2 → manual heap snapshot
 *  - Auto-snapshot at 4h + 10h uptime markers (always-on baseline)
 *  - Auto-snapshot when heapUsed grows monotonically across 5 samples (25min)
 *    by ≥ 50 MB (rate-of-change leak detector)
 *
 * The cooldown gates auto-snapshots to one every 30 min so a fast-growing
 * leak doesn't fill the snapshot directory. Manual SIGUSR2 ignores cooldown.
 *
 * Idempotent — calling twice is harmless but registers duplicate handlers.
 * Only call from process startup. Returns a disposer for test mount/unmount.
 */
export function installHeapMonitor(opts?: { snapshotDir?: string }): () => void {
  if (process.env.IRONWORKS_DISABLE_HEAP_MONITOR === "true") {
    return () => undefined;
  }

  // SEC-HEAP-001: allow operators to redirect snapshots to a non-persisted
  // volume (e.g. a tmpfs) so they don't survive container restart. Explicit
  // opts.snapshotDir wins over env so tests stay deterministic.
  const snapshotDir = opts?.snapshotDir ?? process.env.IRONWORKS_HEAP_SNAPSHOT_DIR?.trim() ?? SNAPSHOT_DIR_DEFAULT;
  const startedAt = Date.now();
  const heapHistory: number[] = []; // last GROWTH_WINDOW_SAMPLES heapUsed values
  let lastAutoSnapshotAt = 0;
  const firedUptimeMarkers = new Set<number>();

  function maybeAutoSnapshot(reason: string) {
    if (Date.now() - lastAutoSnapshotAt < COOLDOWN_MS) return;
    lastAutoSnapshotAt = Date.now();
    logger.warn({ reason }, "heap-monitor auto-snapshot triggered");
    takeHeapSnapshot(snapshotDir);
  }

  function tick() {
    const mem = logMemorySample();
    const uptimeMs = Date.now() - startedAt;

    // Uptime-marker triggers — always-on baseline + leak-window samples.
    for (const marker of UPTIME_SNAPSHOT_MARKERS_MS) {
      if (!firedUptimeMarkers.has(marker) && uptimeMs >= marker) {
        firedUptimeMarkers.add(marker);
        maybeAutoSnapshot(`uptime-marker-${(marker / 3600000).toFixed(0)}h`);
      }
    }

    // Growth detector — push current sample onto rolling window, fire when
    // every sample is strictly higher than the prior AND total growth
    // across the window exceeds the byte threshold.
    heapHistory.push(mem.heapUsed);
    if (heapHistory.length > GROWTH_WINDOW_SAMPLES) heapHistory.shift();
    if (heapHistory.length === GROWTH_WINDOW_SAMPLES) {
      let monotonic = true;
      for (let i = 1; i < heapHistory.length; i++) {
        if (heapHistory[i]! <= heapHistory[i - 1]!) {
          monotonic = false;
          break;
        }
      }
      const growth = heapHistory[heapHistory.length - 1]! - heapHistory[0]!;
      if (monotonic && growth >= GROWTH_THRESHOLD_BYTES) {
        maybeAutoSnapshot(`growth-${fmtMB(growth)}-over-${GROWTH_WINDOW_SAMPLES}-samples`);
      }
    }
  }

  // Sample once at startup so the first data point lands in the log
  // without waiting 5 minutes — useful for confirming the monitor armed.
  tick();

  const timer = setInterval(tick, SAMPLE_INTERVAL_MS);
  // Don't keep the event loop alive just for the sampler.
  if (typeof timer.unref === "function") timer.unref();

  const onSigusr2 = () => takeHeapSnapshot(snapshotDir);
  process.on("SIGUSR2", onSigusr2);

  logger.info(
    {
      snapshotDir,
      sampleIntervalMs: SAMPLE_INTERVAL_MS,
      uptimeMarkers: UPTIME_SNAPSHOT_MARKERS_MS,
      growthWindow: GROWTH_WINDOW_SAMPLES,
      growthThresholdBytes: GROWTH_THRESHOLD_BYTES,
    },
    "heap-monitor armed (memory-sample every 5min, SIGUSR2 + uptime markers + growth detector)",
  );

  return () => {
    clearInterval(timer);
    process.off("SIGUSR2", onSigusr2);
  };
}
