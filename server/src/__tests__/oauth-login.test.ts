import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { _cleanupSessionForTest, _sessionsForTest, oauthLoginRoutes } from "../routes/oauth-login.js";
import { boardUser, buildTestApp } from "./helpers/route-app.js";

// ── URL pattern tests ─────────────────────────────────────────────────────────

// These regexes are duplicated from the route so we can unit-test them in
// isolation without spawning real CLIs. The patterns must stay in sync with
// PROVIDER_CONFIGS in oauth-login.ts.
const PATTERNS: Record<string, RegExp> = {
  anthropic: /(https?:\/\/[^\s'"`<>()[\]{};,!?]*(?:anthropic|claude\.ai|auth)[^\s'"`<>()[\]{};,!?]*)/i,
  openai: /(https?:\/\/[^\s'"`<>()[\]{};,!?]*(?:openai\.com|auth0\.com)[^\s'"`<>()[\]{};,!?]*)/i,
  google: /(https?:\/\/accounts\.google\.com\/[^\s'"`<>()[\]{};,!?]*)/i,
};

describe("URL extraction patterns", () => {
  describe("anthropic", () => {
    it("matches a claude.ai auth URL", () => {
      const line = "Please open this URL to authenticate: https://claude.ai/oauth/authorize?code=abc123";
      expect(PATTERNS.anthropic.test(line)).toBe(true);
    });

    it("matches an anthropic.com URL", () => {
      const line = "Visit https://auth.anthropic.com/login?token=xyz to continue";
      expect(PATTERNS.anthropic.test(line)).toBe(true);
    });

    it("does not match an unrelated URL", () => {
      const line = "See https://example.com for details";
      expect(PATTERNS.anthropic.test(line)).toBe(false);
    });
  });

  describe("openai", () => {
    it("matches a chat.openai.com auth URL", () => {
      const line = "Open: https://chat.openai.com/auth/authorize?state=foo&redirect_uri=bar";
      expect(PATTERNS.openai.test(line)).toBe(true);
    });

    it("matches an auth0.com URL (OpenAI uses Auth0)", () => {
      const line = "Login at https://auth0.com/authorize?client_id=codex&response_type=code";
      expect(PATTERNS.openai.test(line)).toBe(true);
    });

    it("does not match an anthropic URL", () => {
      const line = "https://auth.anthropic.com/login";
      expect(PATTERNS.openai.test(line)).toBe(false);
    });
  });

  describe("google", () => {
    it("matches a Google OAuth2 URL", () => {
      const line =
        "Please visit https://accounts.google.com/o/oauth2/auth?client_id=gemini&scope=email to authenticate";
      expect(PATTERNS.google.test(line)).toBe(true);
    });

    it("does not match a non-accounts.google.com URL", () => {
      const line = "See https://www.google.com/search?q=gemini for info";
      expect(PATTERNS.google.test(line)).toBe(false);
    });
  });
});

// ── Route tests ───────────────────────────────────────────────────────────────

const USER_ID = randomUUID();

function makeApp() {
  return buildTestApp({
    router: oauthLoginRoutes(),
    actor: boardUser(USER_ID, [], { isInstanceAdmin: true }),
  });
}

function makeAnonApp() {
  return buildTestApp({
    router: oauthLoginRoutes(),
    actor: { type: "none" },
  });
}

// Clean up any sessions lingering from previous tests
afterEach(() => {
  for (const id of _sessionsForTest.keys()) {
    _cleanupSessionForTest(id);
  }
});

describe("GET /api/oauth-login/:provider/check", () => {
  it("returns 400 for unknown provider", async () => {
    const app = makeApp();
    const res = await request(app).get("/api/oauth-login/unknown/check?sessionId=abc");
    expect(res.status).toBe(400);
  });

  it("returns 400 when sessionId is missing", async () => {
    const app = makeApp();
    const res = await request(app).get("/api/oauth-login/anthropic/check");
    expect(res.status).toBe(400);
  });

  it("returns timeout for a non-existent session", async () => {
    const app = makeApp();
    const res = await request(app).get("/api/oauth-login/anthropic/check?sessionId=does-not-exist");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("timeout");
  });

  it("returns 403 for unauthenticated requests", async () => {
    const app = makeAnonApp();
    const res = await request(app).get("/api/oauth-login/anthropic/check?sessionId=any");
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/oauth-login/:provider/sessions/:id", () => {
  it("returns 404 for a non-existent session", async () => {
    const app = makeApp();
    const res = await request(app).delete("/api/oauth-login/anthropic/sessions/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("returns 403 for unauthenticated requests", async () => {
    const app = makeAnonApp();
    const res = await request(app).delete("/api/oauth-login/anthropic/sessions/any");
    expect(res.status).toBe(403);
  });
});

describe("POST /api/oauth-login/:provider/start", () => {
  it("returns 400 for unknown provider", async () => {
    const app = makeApp();
    const res = await request(app).post("/api/oauth-login/unknown/start").send({});
    expect(res.status).toBe(400);
  });

  it("returns 403 for unauthenticated requests", async () => {
    const app = makeAnonApp();
    const res = await request(app).post("/api/oauth-login/anthropic/start").send({});
    expect(res.status).toBe(403);
  });
});
