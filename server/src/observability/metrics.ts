/**
 * metrics.ts — Prometheus metrics endpoint and middleware.
 *
 * Default OFF: when IRONWORKS_METRICS_BASIC_AUTH is unset, the /metrics handler
 * returns 404. Operators opt in by setting IRONWORKS_METRICS_BASIC_AUTH=user:password.
 *
 * Cardinality discipline: HTTP labels use the matched Express route pattern
 * (req.route?.path), never raw req.path — UUID-ridden paths would explode the
 * counter into thousands of distinct series.
 */

import { Buffer } from "node:buffer";
import type { Db } from "@ironworksai/db";
import { heartbeatRuns } from "@ironworksai/db";
import { eq, sql } from "drizzle-orm";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Counter, collectDefaultMetrics, Gauge, Histogram, Registry } from "prom-client";

let registry: Registry | null = null;
let httpRequestsCounter: Counter<"method" | "route" | "status_class">;
let runsCounter: Counter<"status">;
let activeRunsGauge: Gauge<string>;
let llmCostCounter: Counter<"provider" | "model">;
let runQueueDepthGauge: Gauge<string>;
let embeddingJobsPending: Gauge<"status" | "target_type">;
let embeddingJobsFailedTotal: Counter<"target_type">;
let embeddingProviderLatency: Histogram<"provider" | "model" | "operation">;
let embeddingProviderErrorsTotal: Counter<"provider" | "model" | "error_class">;

function buildRegistry(): Registry {
  const reg = new Registry();
  collectDefaultMetrics({ register: reg });

  httpRequestsCounter = new Counter({
    name: "http_requests_total",
    help: "Total HTTP requests, labeled by method, matched Express route, and status class (2xx/3xx/4xx/5xx).",
    labelNames: ["method", "route", "status_class"],
    registers: [reg],
  });

  runsCounter = new Counter({
    name: "ironworks_runs_total",
    help: "Total heartbeat runs that reached a terminal state, labeled by status.",
    labelNames: ["status"],
    registers: [reg],
  });

  activeRunsGauge = new Gauge({
    name: "ironworks_active_runs",
    help: "Heartbeat runs currently in a non-terminal state (queued or running). Sampled per scrape.",
    registers: [reg],
  });

  llmCostCounter = new Counter({
    name: "ironworks_llm_cost_usd_total",
    help: "Cumulative LLM spend in USD, labeled by provider and model.",
    labelNames: ["provider", "model"],
    registers: [reg],
  });

  runQueueDepthGauge = new Gauge({
    name: "ironworks_run_queue_depth",
    help: "Heartbeat runs in 'queued' status. Sampled per scrape.",
    registers: [reg],
  });

  // ── Embeddings worker (P0 memory upgrade) ────────────────────────────────
  // These metrics track the embedding_jobs + chunking_jobs queues drained by
  // the worker in services/embeddings. Cardinality is deliberately small:
  // status × target_type (~12 series), provider × model × operation (~6),
  // provider × model × error_class (~30).
  embeddingJobsPending = new Gauge({
    name: "ironworks_embedding_jobs_pending",
    help: "Number of embedding/chunking jobs by status and target type. Sampled per worker tick.",
    labelNames: ["status", "target_type"] as const,
    registers: [reg],
  });

  embeddingJobsFailedTotal = new Counter({
    name: "ironworks_embedding_jobs_failed_total",
    help: "Embedding/chunking jobs parked in terminal 'failed' status (exceeded retries).",
    labelNames: ["target_type"] as const,
    registers: [reg],
  });

  embeddingProviderLatency = new Histogram({
    name: "ironworks_embedding_provider_latency_seconds",
    help: "Embedding-provider call latency in seconds, labeled by provider/model/operation.",
    labelNames: ["provider", "model", "operation"] as const,
    buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
    registers: [reg],
  });

  embeddingProviderErrorsTotal = new Counter({
    name: "ironworks_embedding_provider_errors_total",
    help: "Embedding-provider errors classified into a coarse error_class.",
    labelNames: ["provider", "model", "error_class"] as const,
    registers: [reg],
  });

  return reg;
}

export function getRegistry(): Registry {
  if (!registry) {
    registry = buildRegistry();
  }
  return registry;
}

// Force initialization so module-level exports below are never undefined.
getRegistry();

export {
  activeRunsGauge,
  embeddingJobsFailedTotal,
  embeddingJobsPending,
  embeddingProviderErrorsTotal,
  embeddingProviderLatency,
  httpRequestsCounter,
  llmCostCounter,
  runQueueDepthGauge,
  runsCounter,
};

/**
 * Express middleware: counts every request after response-finish.
 * Uses req.route?.path so cardinality stays bounded by the route table,
 * not by the universe of UUIDs that ride through it.
 */
export const httpRequestsMiddleware: RequestHandler = (req, res, next) => {
  res.once("finish", () => {
    const route = req.route?.path ?? "unmatched";
    const code = res.statusCode;
    const cls = code >= 500 ? "5xx" : code >= 400 ? "4xx" : code >= 300 ? "3xx" : code >= 200 ? "2xx" : "1xx";
    httpRequestsCounter.inc({
      method: req.method,
      route: typeof route === "string" ? route : String(route),
      status_class: cls,
    });
  });
  next();
};

interface BasicAuthCreds {
  user: string;
  password: string;
}

function parseBasicAuthEnv(value: string | undefined): BasicAuthCreds | null {
  if (!value) return null;
  const idx = value.indexOf(":");
  if (idx <= 0 || idx === value.length - 1) return null;
  return { user: value.slice(0, idx), password: value.slice(idx + 1) };
}

function checkBasicAuth(header: string | undefined, expected: BasicAuthCreds): boolean {
  if (!header || !header.toLowerCase().startsWith("basic ")) return false;
  const decoded = (() => {
    try {
      return Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
    } catch {
      return null;
    }
  })();
  if (!decoded) return false;
  const idx = decoded.indexOf(":");
  if (idx < 0) return false;
  const user = decoded.slice(0, idx);
  const password = decoded.slice(idx + 1);
  return user === expected.user && password === expected.password;
}

/**
 * Per-scrape sampler: refresh gauges that reflect current DB state.
 * Counters are NOT sampled — they accumulate via the existing run-status
 * and cost-recording paths.
 */
export async function sampleGauges(db: Db): Promise<void> {
  // Queue depth: pending runs.
  const queued = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(heartbeatRuns)
    .where(eq(heartbeatRuns.status, "queued"));
  runQueueDepthGauge.set(Number(queued[0]?.c ?? 0));

  // Active runs: running + queued (anything not yet terminal).
  const active = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(heartbeatRuns)
    .where(sql`${heartbeatRuns.status} in ('queued','running')`);
  activeRunsGauge.set(Number(active[0]?.c ?? 0));
}

export function metricsHandler(db: Db): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const expected = parseBasicAuthEnv(process.env.IRONWORKS_METRICS_BASIC_AUTH);
    if (!expected) {
      // Default off: don't leak the existence of the endpoint.
      res.status(404).json({ error: "Not found" });
      return;
    }

    if (!checkBasicAuth(req.headers.authorization, expected)) {
      res.setHeader("WWW-Authenticate", 'Basic realm="ironworks-metrics", charset="UTF-8"');
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      await sampleGauges(db);
      const reg = getRegistry();
      const body = await reg.metrics();
      res.setHeader("Content-Type", reg.contentType);
      res.status(200).send(body);
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Test-only: rebuilds the registry so counters/gauges start at zero.
 * Production code should never call this.
 */
export function __resetMetricsForTests(): void {
  registry = buildRegistry();
}
