import type { NextFunction, Request, Response } from "express";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../middleware/error-handler.js";

/**
 * SEC-LOG-001 regression: the error handler attaches reqBody/reqParams/reqQuery to
 * res.__errorContext for downstream loggers. Verify secret-ish keys are redacted
 * BEFORE attachment so logs never see plaintext credentials.
 */
describe("error-handler request redaction (SEC-LOG-001)", () => {
  function makeReqRes(reqBody: unknown, reqQuery: unknown = {}, reqParams: unknown = {}) {
    const req = {
      method: "POST",
      originalUrl: "/api/setup",
      body: reqBody,
      query: reqQuery,
      params: reqParams,
    } as unknown as Request;

    const res = {
      __errorContext: undefined as unknown,
      err: undefined as unknown,
      status: function status() {
        return this;
      },
      json: function json() {
        return this;
      },
    } as unknown as Response & { __errorContext?: unknown };

    return { req, res };
  }

  it("redacts password/token/secret/apiKey/authorization from req.body", () => {
    const { req, res } = makeReqRes({
      email: "user@example.com",
      password: "hunter2",
      apiKey: "sk_live_abc",
      access_token: "ey.j.w.t",
      authorization: "Bearer abc",
      nested: { secret: "s3cr3t", normal: "ok" },
    });

    errorHandler(new Error("boom"), req, res, (() => {}) as NextFunction);

    // biome-ignore lint/suspicious/noExplicitAny: test inspecting attached context
    const ctx = (res as any).__errorContext;
    expect(ctx).toBeDefined();
    expect(ctx.reqBody.email).toBe("user@example.com");
    expect(ctx.reqBody.password).toBe("***REDACTED***");
    expect(ctx.reqBody.apiKey).toBe("***REDACTED***");
    expect(ctx.reqBody.access_token).toBe("***REDACTED***");
    expect(ctx.reqBody.authorization).toBe("***REDACTED***");
    expect(ctx.reqBody.nested.secret).toBe("***REDACTED***");
    expect(ctx.reqBody.nested.normal).toBe("ok");
  });

  it("redacts secret-ish keys in req.query and req.params", () => {
    const { req, res } = makeReqRes({}, { token: "leak-me", page: "1" }, { secret: "leak", id: "abc" });
    errorHandler(new Error("boom"), req, res, (() => {}) as NextFunction);

    // biome-ignore lint/suspicious/noExplicitAny: test inspecting attached context
    const ctx = (res as any).__errorContext;
    expect(ctx.reqQuery.token).toBe("***REDACTED***");
    expect(ctx.reqQuery.page).toBe("1");
    expect(ctx.reqParams.secret).toBe("***REDACTED***");
    expect(ctx.reqParams.id).toBe("abc");
  });
});
