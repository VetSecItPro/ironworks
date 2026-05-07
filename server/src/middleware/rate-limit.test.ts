// Unit tests for the in-memory rate limiter extracted from app.ts.
// We mount it on a tiny Express app and drive it with supertest so we
// exercise the real Express request shape (req.ip, req.socket, req.path).

import express, { type Request } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { rateLimitMiddleware } from "./rate-limit.js";

function buildApp(opts: Parameters<typeof rateLimitMiddleware>[0] = {}, overrideIp?: string) {
  const app = express();
  // Express 5 makes req.ip read-only on real connections; for deterministic
  // per-IP counter tests we install a tiny shim that surfaces the desired ip.
  if (overrideIp !== undefined) {
    app.use((req, _res, next) => {
      Object.defineProperty(req, "ip", { value: overrideIp, configurable: true });
      next();
    });
  }
  app.use(rateLimitMiddleware(opts));
  app.get("/api/ping", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.get("/api/agents/agent-1/heartbeat", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.get("/static/file", (_req, res) => {
    res.status(200).send("ok");
  });
  app.options("/api/ping", (_req, res) => {
    res.status(204).end();
  });
  return app;
}

describe("rateLimitMiddleware", () => {
  it("allows the first N requests under the limit", async () => {
    const app = buildApp({ limit: 3, windowMs: 60_000 }, "10.0.0.1");
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get("/api/ping");
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 once the limit is exceeded", async () => {
    const app = buildApp({ limit: 2, windowMs: 60_000 }, "10.0.0.2");
    expect((await request(app).get("/api/ping")).status).toBe(200);
    expect((await request(app).get("/api/ping")).status).toBe(200);
    const blocked = await request(app).get("/api/ping");
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: "Too many requests. Try again later." });
  });

  it("isolates counters across distinct IPs", async () => {
    // Two separate apps each pinning a different ip — distinct buckets.
    const appA = buildApp({ limit: 1, windowMs: 60_000 }, "10.0.0.10");
    const appB = buildApp({ limit: 1, windowMs: 60_000 }, "10.0.0.11");

    expect((await request(appA).get("/api/ping")).status).toBe(200);
    expect((await request(appA).get("/api/ping")).status).toBe(429);
    // Different "ip" → its own bucket → still allowed once.
    expect((await request(appB).get("/api/ping")).status).toBe(200);
  });

  it("resets the bucket after the window elapses", async () => {
    let fakeNow = 1_000_000;
    const app = buildApp({ limit: 1, windowMs: 1_000, now: () => fakeNow }, "10.0.0.3");

    expect((await request(app).get("/api/ping")).status).toBe(200);
    expect((await request(app).get("/api/ping")).status).toBe(429);

    // Advance past the window — bucket should reset.
    fakeNow += 2_000;
    expect((await request(app).get("/api/ping")).status).toBe(200);
  });

  it("does not rate-limit non-/api routes", async () => {
    const app = buildApp({ limit: 1, windowMs: 60_000 }, "10.0.0.4");
    expect((await request(app).get("/static/file")).status).toBe(200);
    expect((await request(app).get("/static/file")).status).toBe(200);
    expect((await request(app).get("/static/file")).status).toBe(200);
  });

  it("does not rate-limit /api/health (exempt)", async () => {
    const app = buildApp({ limit: 1, windowMs: 60_000 }, "10.0.0.5");
    expect((await request(app).get("/api/health")).status).toBe(200);
    expect((await request(app).get("/api/health")).status).toBe(200);
    expect((await request(app).get("/api/health")).status).toBe(200);
  });

  it("does not rate-limit heartbeat routes (exempt)", async () => {
    const app = buildApp({ limit: 1, windowMs: 60_000 }, "10.0.0.6");
    expect((await request(app).get("/api/agents/agent-1/heartbeat")).status).toBe(200);
    expect((await request(app).get("/api/agents/agent-1/heartbeat")).status).toBe(200);
  });

  it("skips OPTIONS preflight even on /api routes", async () => {
    const app = buildApp({ limit: 1, windowMs: 60_000 }, "10.0.0.7");
    // Burn the limit with a regular request first, then preflights still pass.
    expect((await request(app).get("/api/ping")).status).toBe(200);
    expect((await request(app).options("/api/ping")).status).toBe(204);
    expect((await request(app).options("/api/ping")).status).toBe(204);
  });

  it("uses 'unknown' as the bucket key when no ip can be resolved", async () => {
    // Without an ip override, supertest connects over loopback so req.ip is set.
    // To exercise the "unknown" fallback, install middleware that strips it.
    const app = express();
    app.use((req, _res, next) => {
      Object.defineProperty(req, "ip", { value: undefined, configurable: true });
      Object.defineProperty(req, "socket", { value: { remoteAddress: undefined }, configurable: true });
      next();
    });
    app.use(rateLimitMiddleware({ limit: 1, windowMs: 60_000 }));
    app.get("/api/ping", (_req: Request, res) => {
      res.status(200).json({ ok: true });
    });
    expect((await request(app).get("/api/ping")).status).toBe(200);
    expect((await request(app).get("/api/ping")).status).toBe(429);
  });
});
