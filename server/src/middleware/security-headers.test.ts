// Unit tests for the security headers middleware extracted from app.ts.
// We mount it on a tiny Express app and assert the headers are present
// on a sample response. The CSP carries a deliberately-pinned script SHA;
// regression-test that string here so an accidental change breaks the
// build before it ships.

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { PRODUCTION_CSP, securityHeadersMiddleware } from "./security-headers.js";

function buildApp(opts?: Parameters<typeof securityHeadersMiddleware>[0]) {
  const app = express();
  app.use(securityHeadersMiddleware(opts));
  app.get("/anything", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

describe("securityHeadersMiddleware", () => {
  it("sets the standard hardening headers on every response", async () => {
    const res = await request(buildApp()).get("/anything");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(res.headers["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
  });

  it("emits the production CSP by default", async () => {
    const res = await request(buildApp()).get("/anything");
    expect(res.headers["content-security-policy"]).toBe(PRODUCTION_CSP);
  });

  it("omits CSP when skipCsp=true (vite-dev path)", async () => {
    const res = await request(buildApp({ skipCsp: true })).get("/anything");
    expect(res.headers["content-security-policy"]).toBeUndefined();
    // Other hardening headers must still be present in dev.
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("CSP pins the inline-script SHA-256 (SEC-HDR-001 regression guard)", () => {
    // Pinning this string here means an accidental edit to the CSP string
    // — or the inline ui/index.html theme snippet — will break this test
    // and force the engineer to recompute the hash deliberately.
    expect(PRODUCTION_CSP).toContain("'sha256-6vvXBpbC3dPDRTfAkvCMzs3MZCffSXiteXHKnMn1oCs='");
    expect(PRODUCTION_CSP).toContain("frame-src 'none'");
    expect(PRODUCTION_CSP).toContain("object-src 'none'");
    expect(PRODUCTION_CSP).toContain("base-uri 'self'");
  });
});
