import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Service mocks ───────────────────────────────────────────────────────────

vi.mock("../version.js", () => ({
  serverVersion: "1.2.3",
}));

vi.mock("../dev-server-status.js", () => ({
  readPersistedDevServerStatus: vi.fn().mockReturnValue(null),
  toDevServerHealthStatus: vi.fn(),
}));

vi.mock("../services/instance-settings.js", () => ({
  instanceSettingsService: () => ({
    get: vi.fn().mockResolvedValue(null),
    getExperimental: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock("../middleware/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../services/activity-log.js", () => ({
  logActivity: vi.fn(),
  setPluginEventBus: vi.fn(),
}));

// ── App builder ─────────────────────────────────────────────────────────────

async function createApp(db?: any, opts?: any) {
  const { healthRoutes } = await import("../routes/health.js");

  const app = express();
  app.use(express.json());
  app.use("/api/health", healthRoutes(db, opts));
  return app;
}

// ── Helper ──────────────────────────────────────────────────────────────────

function createFakeDbForHealth(adminCount: number) {
  const then = vi.fn().mockImplementation((cb: any) => Promise.resolve(cb([{ count: adminCount }])));
  const where = vi.fn().mockReturnValue({ then });
  const from = vi.fn().mockReturnValue({ where, then });
  const selectObj = vi.fn().mockReturnValue({ from });

  return { select: selectObj } as any;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("health routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/health", () => {
    it("returns ok status without db", async () => {
      const app = await createApp();
      const res = await request(app).get("/api/health");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.version).toBe("1.2.3");
    });

    it("returns version from package.json", async () => {
      const app = await createApp();
      const res = await request(app).get("/api/health");

      expect(res.body.version).toBe("1.2.3");
    });

    it("returns deployment mode when db is provided", async () => {
      const fakeDb = createFakeDbForHealth(1);
      const app = await createApp(fakeDb, {
        deploymentMode: "local_trusted",
        deploymentExposure: "private",
        authReady: true,
        companyDeletionEnabled: true,
      });
      const res = await request(app).get("/api/health");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.deploymentMode).toBe("local_trusted");
      expect(res.body.deploymentExposure).toBe("private");
    });

    it("returns authReady flag", async () => {
      const fakeDb = createFakeDbForHealth(1);
      const app = await createApp(fakeDb, {
        deploymentMode: "local_trusted",
        deploymentExposure: "private",
        authReady: false,
        companyDeletionEnabled: true,
      });
      const res = await request(app).get("/api/health");

      expect(res.body.authReady).toBe(false);
    });

    it("returns features.companyDeletionEnabled", async () => {
      const fakeDb = createFakeDbForHealth(1);
      const app = await createApp(fakeDb, {
        deploymentMode: "local_trusted",
        deploymentExposure: "private",
        authReady: true,
        companyDeletionEnabled: false,
      });
      const res = await request(app).get("/api/health");

      expect(res.body.features.companyDeletionEnabled).toBe(false);
    });

    it("returns bootstrapStatus ready when admin exists in authenticated mode", async () => {
      const fakeDb = createFakeDbForHealth(1);
      const app = await createApp(fakeDb, {
        deploymentMode: "authenticated",
        deploymentExposure: "public",
        authReady: true,
        companyDeletionEnabled: true,
      });
      const res = await request(app).get("/api/health");

      expect(res.body.bootstrapStatus).toBe("ready");
    });

    it("returns bootstrap_pending when no admin in authenticated mode", async () => {
      const fakeDb = createFakeDbForHealth(0);
      const app = await createApp(fakeDb, {
        deploymentMode: "authenticated",
        deploymentExposure: "public",
        authReady: true,
        companyDeletionEnabled: true,
      });
      const res = await request(app).get("/api/health");

      expect(res.body.bootstrapStatus).toBe("bootstrap_pending");
    });

    it("does not require authentication", async () => {
      const app = await createApp();
      const res = await request(app).get("/api/health");

      expect(res.status).toBe(200);
    });

    it("omits devServer when no persisted status", async () => {
      const fakeDb = createFakeDbForHealth(1);
      const app = await createApp(fakeDb, {
        deploymentMode: "local_trusted",
        deploymentExposure: "private",
        authReady: true,
        companyDeletionEnabled: true,
      });
      const res = await request(app).get("/api/health");

      expect(res.body.devServer).toBeUndefined();
    });

    it("returns correct response shape without db", async () => {
      const app = await createApp();
      const res = await request(app).get("/api/health");

      expect(Object.keys(res.body)).toEqual(["status", "version"]);
    });
  });
});
