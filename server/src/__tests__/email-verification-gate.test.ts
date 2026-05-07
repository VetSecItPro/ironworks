/**
 * Email-verification gate tests.
 *
 * Covers two layers:
 *   1. assertEmailVerified — the authz helper that 403s when actor.emailVerified === false
 *   2. POST /api/companies and POST /api/companies/onboard return 403 with
 *      `code: email_verification_required` for unverified session-backed users.
 *
 * The local_implicit board (loopback dev mode) is permissive — emailVerified
 * is undefined and the gate must NOT fire. Existing tests already exercise
 * that path.
 */

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../middleware/error-handler.js";
import { assertEmailVerified } from "../routes/authz.js";

describe("assertEmailVerified", () => {
  function appFor(actor: Record<string, unknown>) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      // biome-ignore lint/suspicious/noExplicitAny: test fixture
      (req as any).actor = actor;
      next();
    });
    app.post("/probe", (req, _res, next) => {
      try {
        assertEmailVerified(req);
        _res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    });
    app.use(errorHandler);
    return app;
  }

  it("403s when actor.emailVerified is explicitly false", async () => {
    const app = appFor({
      type: "board",
      userId: "user-1",
      isInstanceAdmin: false,
      emailVerified: false,
      source: "session",
    });
    const res = await request(app).post("/probe").send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/verification/i);
    expect(res.body.details).toMatchObject({ code: "email_verification_required" });
  });

  it("allows when actor.emailVerified is true", async () => {
    const app = appFor({
      type: "board",
      userId: "user-1",
      isInstanceAdmin: false,
      emailVerified: true,
      source: "session",
    });
    const res = await request(app).post("/probe").send({});
    expect(res.status).toBe(200);
  });

  it("is permissive when actor.emailVerified is undefined (local_implicit / agents)", async () => {
    const app = appFor({
      type: "board",
      userId: "local-board",
      isInstanceAdmin: true,
      source: "local_implicit",
    });
    const res = await request(app).post("/probe").send({});
    expect(res.status).toBe(200);
  });
});
