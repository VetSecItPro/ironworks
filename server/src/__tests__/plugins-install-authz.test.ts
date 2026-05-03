/**
 * SEC-PLUGIN-001 regression: POST /api/plugins/install must require
 * instance-admin, not just board membership. The previous gate
 * (`assertBoard`) let any authenticated tenant member stage arbitrary
 * npm packages onto the shared host filesystem and trigger code
 * execution inside a fork()'d worker. The fix is to upgrade the gate
 * to `assertInstanceAdmin`. These tests pin that contract so a future
 * refactor that downgrades the gate fails CI loudly.
 *
 * Also covers DELETE /api/plugins/:id and POST /api/plugins/:id/upgrade
 * which run the same host-mutation primitive (`npm install` / file
 * removal) and were hardened in the same change.
 */

import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { boardUser, buildTestApp } from "./helpers/route-app.js";

// We don't need a real DB or loader — the assertInstanceAdmin gate fires
// before any service call, so a stub with the minimal surface is enough.
// biome-ignore lint/suspicious/noExplicitAny: deliberate test stub
const stubLoader: any = {
  installPlugin: vi.fn(),
};

// biome-ignore lint/suspicious/noExplicitAny: deliberate test stub
const stubDb: any = {
  // pluginRoutes calls db.select(...).from(companies) for audit logging.
  // We never reach that path in 403 tests, but need select to exist so
  // the route module can import-load without throwing.
  select: () => ({ from: () => Promise.resolve([]) }),
};

describe("SEC-PLUGIN-001: privileged plugin routes require instance-admin", () => {
  async function makeApp(actor: ReturnType<typeof boardUser>) {
    const { pluginRoutes } = await import("../routes/plugins.js");
    return buildTestApp({
      router: pluginRoutes(stubDb, stubLoader),
      actor,
    });
  }

  it("rejects POST /plugins/install for non-instance-admin board member with 403", async () => {
    const app = await makeApp(boardUser("user-1", ["company-1"], { isInstanceAdmin: false }));
    const res = await request(app).post("/api/plugins/install").send({ packageName: "@example/plugin" });

    expect(res.status).toBe(403);
    expect(stubLoader.installPlugin).not.toHaveBeenCalled();
  });

  it("rejects POST /plugins/:id/upgrade for non-instance-admin board member with 403", async () => {
    const app = await makeApp(boardUser("user-1", ["company-1"], { isInstanceAdmin: false }));
    const res = await request(app).post("/api/plugins/some-id/upgrade").send({});

    expect(res.status).toBe(403);
  });

  it("rejects DELETE /plugins/:id for non-instance-admin board member with 403", async () => {
    const app = await makeApp(boardUser("user-1", ["company-1"], { isInstanceAdmin: false }));
    const res = await request(app).delete("/api/plugins/some-id");

    expect(res.status).toBe(403);
  });

  it("does NOT reject install for instance-admin board user (gate passes through)", async () => {
    // Instance-admin passes assertInstanceAdmin. The route then proceeds and
    // fails downstream (loader stub returns undefined → 500 path) — we don't
    // care about the downstream outcome; we just want to assert the auth
    // gate itself doesn't 403.
    const app = await makeApp(boardUser("admin", [], { isInstanceAdmin: true }));
    const res = await request(app).post("/api/plugins/install").send({ packageName: "@example/plugin" });

    expect(res.status).not.toBe(403);
  });
});
