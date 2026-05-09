/**
 * P3.2 settings-extension tests: PATCH/GET round-trip for the new
 * `vaultSnapshot` section, default materialization when absent, and
 * partial-patch nested-merge semantics. Mirrors the `notes` section
 * pattern from P2.
 */
import { randomUUID } from "node:crypto";
import { createDb, instanceSettings } from "@ironworksai/db";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../../__tests__/helpers/embedded-postgres.js";
import { instanceSettingsService } from "../instance-settings.js";

const support = await getEmbeddedPostgresTestSupport();
const describeIfSupported = support.supported ? describe : describe.skip;

if (!support.supported) {
  console.warn(
    `Skipping instance-settings vault-snapshot tests on this host: ${support.reason ?? "unsupported environment"}`,
  );
}

describeIfSupported("instanceSettingsService — vaultSnapshot section", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("ironworks-instance-settings-vs-");
    db = createDb(tempDb.connectionString);
  }, 120_000);

  afterEach(async () => {
    await db.delete(instanceSettings);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("populates default vaultSnapshot when the persisted blob is absent", async () => {
    const svc = instanceSettingsService(db);
    const general = await svc.getGeneral();
    expect(general.vaultSnapshot).toEqual({
      enabled: false,
      bucketName: undefined,
      endpoint: undefined,
      accessKeyIdSecretId: undefined,
      secretAccessKeySecretId: undefined,
      keyPrefix: "",
      cadence: "off",
    });
  });

  it("PATCH then GET round-trips the vaultSnapshot section", async () => {
    const svc = instanceSettingsService(db);
    const akId = randomUUID();
    const skId = randomUUID();
    await svc.updateGeneral({
      vaultSnapshot: {
        enabled: true,
        bucketName: "ironworks-vaults",
        endpoint: "https://acct.r2.cloudflarestorage.com",
        accessKeyIdSecretId: akId,
        secretAccessKeySecretId: skId,
        keyPrefix: "snapshots",
        cadence: "daily",
      },
    });

    const after = await svc.getGeneral();
    expect(after.vaultSnapshot).toEqual({
      enabled: true,
      bucketName: "ironworks-vaults",
      endpoint: "https://acct.r2.cloudflarestorage.com",
      accessKeyIdSecretId: akId,
      secretAccessKeySecretId: skId,
      keyPrefix: "snapshots",
      cadence: "daily",
    });
  });

  it("partial PATCH preserves previously-set keys", async () => {
    const svc = instanceSettingsService(db);
    const akId = randomUUID();
    const skId = randomUUID();
    // Seed full config.
    await svc.updateGeneral({
      vaultSnapshot: {
        enabled: true,
        bucketName: "bucket-1",
        endpoint: "https://x.r2.cloudflarestorage.com",
        accessKeyIdSecretId: akId,
        secretAccessKeySecretId: skId,
        keyPrefix: "p1",
        cadence: "daily",
      },
    });
    // Patch only the cadence — every other field must stay intact.
    await svc.updateGeneral({
      vaultSnapshot: { cadence: "weekly" },
    });

    const after = await svc.getGeneral();
    expect(after.vaultSnapshot).toEqual({
      enabled: true,
      bucketName: "bucket-1",
      endpoint: "https://x.r2.cloudflarestorage.com",
      accessKeyIdSecretId: akId,
      secretAccessKeySecretId: skId,
      keyPrefix: "p1",
      cadence: "weekly",
    });
  });

  it("notes + vaultSnapshot can be patched independently without clobbering each other", async () => {
    const svc = instanceSettingsService(db);
    await svc.updateGeneral({
      notes: { persistRunNotes: true },
      vaultSnapshot: {
        enabled: true,
        bucketName: "b",
        endpoint: "https://e.example",
        accessKeyIdSecretId: randomUUID(),
        secretAccessKeySecretId: randomUUID(),
        cadence: "daily",
      },
    });
    // Patch only notes — vaultSnapshot must persist unchanged.
    await svc.updateGeneral({ notes: { persistDecisionNotes: false } });

    const after = await svc.getGeneral();
    expect(after.notes).toEqual({ persistRunNotes: true, persistDecisionNotes: false });
    expect(after.vaultSnapshot?.enabled).toBe(true);
    expect(after.vaultSnapshot?.bucketName).toBe("b");
    expect(after.vaultSnapshot?.cadence).toBe("daily");
  });
});
