/**
 * Tests for the Prometheus /metrics endpoint and supporting helpers.
 *
 * Coverage:
 *   - BasicAuth gating: 404 when env unset, 401 on bad creds, 200 on good creds
 *   - HTTP middleware increments httpRequestsCounter with bounded labels
 *   - runsCounter and llmCostCounter accumulate as expected
 */

import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetMetricsForTests,
  getRegistry,
  httpRequestsCounter,
  httpRequestsMiddleware,
  llmCostCounter,
  metricsHandler,
  runsCounter,
} from "./metrics.js";

const ENV_KEY = "IRONWORKS_METRICS_BASIC_AUTH";

// Minimal in-memory Db stub: the metrics handler only needs db.select(...).from(...).where(...)
// to resolve to an array of rows. We expose a configurable rows-per-call queue so each test
// can stage the pending + active gauge samples (sampleGauges issues two queries in order).
function makeFakeDb(queuedCount: number, activeCount: number) {
  const responses = [[{ c: queuedCount }], [{ c: activeCount }]];
  return {
    select() {
      return {
        from() {
          return {
            where() {
              return Promise.resolve(responses.shift() ?? [{ c: 0 }]);
            },
          };
        },
      };
    },
  };
}

describe("metrics module", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env[ENV_KEY];
    delete process.env[ENV_KEY];
    __resetMetricsForTests();
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  describe("metricsHandler — BasicAuth gating", () => {
    it("returns 404 when IRONWORKS_METRICS_BASIC_AUTH is unset", async () => {
      const app = express();
      // biome-ignore lint/suspicious/noExplicitAny: fake db stub for unit test
      app.get("/metrics", metricsHandler(makeFakeDb(0, 0) as any));

      const res = await request(app).get("/metrics");
      expect(res.status).toBe(404);
    });

    it("returns 401 when env set but no credentials supplied", async () => {
      process.env[ENV_KEY] = "ops:s3cret";
      const app = express();
      // biome-ignore lint/suspicious/noExplicitAny: fake db stub for unit test
      app.get("/metrics", metricsHandler(makeFakeDb(0, 0) as any));

      const res = await request(app).get("/metrics");
      expect(res.status).toBe(401);
      expect(res.headers["www-authenticate"]).toContain("Basic");
    });

    it("returns 401 when credentials are wrong", async () => {
      process.env[ENV_KEY] = "ops:s3cret";
      const app = express();
      // biome-ignore lint/suspicious/noExplicitAny: fake db stub for unit test
      app.get("/metrics", metricsHandler(makeFakeDb(0, 0) as any));

      const res = await request(app).get("/metrics").auth("ops", "wrong");
      expect(res.status).toBe(401);
    });

    it("returns 200 with Prometheus text-format when credentials match", async () => {
      process.env[ENV_KEY] = "ops:s3cret";
      const app = express();
      // biome-ignore lint/suspicious/noExplicitAny: fake db stub for unit test
      app.get("/metrics", metricsHandler(makeFakeDb(3, 5) as any));

      const res = await request(app).get("/metrics").auth("ops", "s3cret");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/plain/);
      // Default Node metrics should be present.
      expect(res.text).toContain("process_cpu_user_seconds_total");
      expect(res.text).toContain("nodejs_eventloop_lag_seconds");
      // Sampled gauges from the fake db should appear with the staged values.
      expect(res.text).toMatch(/ironworks_run_queue_depth\s+3/);
      expect(res.text).toMatch(/ironworks_active_runs\s+5/);
    });
  });

  describe("httpRequestsCounter middleware", () => {
    it("increments the counter with method/route/status_class labels", async () => {
      const app = express();
      app.use(httpRequestsMiddleware);
      app.get("/api/issues/:id", (_req, res) => res.status(200).json({ ok: true }));
      app.get("/api/boom", (_req, res) => res.status(500).json({ error: "boom" }));

      await request(app).get("/api/issues/abc-123");
      await request(app).get("/api/issues/xyz-999");
      await request(app).get("/api/boom");

      const value = await httpRequestsCounter.get();
      const issuesRow = value.values.find(
        (v) => v.labels.route === "/api/issues/:id" && v.labels.status_class === "2xx",
      );
      const boomRow = value.values.find((v) => v.labels.route === "/api/boom" && v.labels.status_class === "5xx");
      expect(issuesRow?.value).toBe(2);
      expect(boomRow?.value).toBe(1);

      // Cardinality discipline: the route label is the matched pattern, not the raw path.
      // No row should carry a UUID-shaped path.
      for (const v of value.values) {
        expect(v.labels.route).not.toMatch(/abc-123|xyz-999/);
      }
    });
  });

  describe("runsCounter", () => {
    it("increments per terminal status", async () => {
      runsCounter.inc({ status: "succeeded" });
      runsCounter.inc({ status: "succeeded" });
      runsCounter.inc({ status: "failed" });

      const value = await runsCounter.get();
      const succeeded = value.values.find((v) => v.labels.status === "succeeded");
      const failed = value.values.find((v) => v.labels.status === "failed");
      expect(succeeded?.value).toBe(2);
      expect(failed?.value).toBe(1);
    });
  });

  describe("llmCostCounter", () => {
    it("sums spend across multiple calls per provider+model", async () => {
      llmCostCounter.inc({ provider: "anthropic", model: "claude-3-5-sonnet" }, 0.12);
      llmCostCounter.inc({ provider: "anthropic", model: "claude-3-5-sonnet" }, 0.08);
      llmCostCounter.inc({ provider: "openai", model: "gpt-4o" }, 0.5);

      const value = await llmCostCounter.get();
      const anthropic = value.values.find(
        (v) => v.labels.provider === "anthropic" && v.labels.model === "claude-3-5-sonnet",
      );
      const openai = value.values.find((v) => v.labels.provider === "openai" && v.labels.model === "gpt-4o");
      expect(anthropic?.value).toBeCloseTo(0.2, 5);
      expect(openai?.value).toBeCloseTo(0.5, 5);
    });
  });

  describe("getRegistry", () => {
    it("returns the same singleton across calls", () => {
      const a = getRegistry();
      const b = getRegistry();
      expect(a).toBe(b);
    });
  });
});
