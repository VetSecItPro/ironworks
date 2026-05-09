/**
 * Scheduled R2 vault-snapshot service (P3.2).
 *
 * `runVaultSnapshotCron(db, { cadence })` is invoked by two cron timers
 * registered in `periodic-notes/cron.ts` (daily 03:00 CT, weekly Sun 03:30 CT).
 * For each company in the deployment, when the instance-wide
 * `vaultSnapshot` settings are enabled and the configured cadence matches
 * the cron tick, we:
 *   1. Resolve the R2 access-key + secret-access-key via `secretService`
 *      (looked up by the secret-IDs persisted in instance settings).
 *   2. Generate the company's vault zip in-memory by reusing
 *      `streamVaultExport` from P3.1 - a `PassThrough` stream stands in
 *      for the Express `res`, with chunks collected into a Buffer.
 *   3. PUT the bytes to R2 via `uploadVaultToR2`.
 *
 * Failure isolation: every step is wrapped in per-company try/catch so a
 * single upload failure (bad creds, R2 5xx, vault composer error) doesn't
 * abort the rest of the batch. Counts are returned via `CronResult`.
 *
 * Settings architecture note: `instanceSettings.general.vaultSnapshot` is
 * a *singleton* (instance-wide), but the cron iterates *per-company*. This
 * is intentional - current Ironworks deployments are single-operator,
 * multi-company; one R2 config covers every company in the instance, with
 * the per-company `companyName` slug differentiating snapshot keys.
 * Per-company override settings are deferred until a real multi-tenant
 * customer configuration emerges.
 */
import { PassThrough } from "node:stream";
import type { Db } from "@ironworksai/db";
import { companies } from "@ironworksai/db";
import type { InstanceVaultSnapshotSettings } from "@ironworksai/shared";
import type { Response } from "express";
import { logger } from "../../middleware/logger.js";
import { vaultSnapshotsTotal } from "../../observability/metrics.js";
import { instanceSettingsService } from "../instance-settings.js";
import { secretService } from "../secrets.js";
import { streamVaultExport } from "../vault-export/index.js";
import { uploadVaultToR2 } from "./uploader.js";

export interface SnapshotCronOpts {
  cadence: "daily" | "weekly";
  /** Override the wall clock - tests pin this for deterministic key paths. */
  now?: Date;
}

export interface CronResult {
  /** Number of companies the cron tried to upload (i.e. cadence + enabled matched). */
  attempted: number;
  /** Companies that successfully uploaded. */
  succeeded: number;
  /** Companies that hit an error (composer throw, upload reject, etc.). */
  failed: number;
  /**
   * Companies skipped without an attempt: cadence mismatch, disabled, or
   * missing required configuration (bucketName / endpoint / credential refs).
   */
  skipped: number;
}

interface CompanyRow {
  id: string;
  name: string;
}

/**
 * Slugify a company name for the snapshot key. Mirrors the pattern in
 * `vault-export/index.ts#sanitizeFilenameBase` (lowercase + collapse
 * non-alphanumerics to hyphens) so customers see consistent naming
 * between on-demand downloads and scheduled snapshots. Empty result
 * falls back to "company" so the key is always well-formed.
 */
function slugifyCompanyName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "company";
}

/**
 * Compose the S3 object key. Format: `[<keyPrefix>/]<YYYY-MM-DD>/<slug>-vault.zip`.
 * The leading prefix segment is omitted entirely when `keyPrefix` is empty
 * so the key doesn't start with a stray `/` (R2 accepts it but it confuses
 * `aws s3 ls` output).
 */
function buildSnapshotKey(args: { keyPrefix: string; date: Date; companyName: string }): string {
  const yyyyMmDd = args.date.toISOString().slice(0, 10);
  const slug = slugifyCompanyName(args.companyName);
  const filename = `${yyyyMmDd}/${slug}-vault.zip`;
  return args.keyPrefix.length > 0 ? `${args.keyPrefix}/${filename}` : filename;
}

/**
 * Buffer a `streamVaultExport` invocation into a single Buffer. The
 * exporter expects an Express `Response` but only ever calls
 * `setHeader` / `pipe-target` semantics on it - a PassThrough stream
 * with an added `setHeader` function satisfies the contract. Headers are
 * captured to a local Map and discarded (the PUT to R2 sets its own
 * Content-Type), which mirrors the integration test fixture in
 * `vault-export/__tests__/integration.test.ts#makeFakeResponse`.
 *
 * Resolves with the concatenated bytes once the stream emits `end`.
 * Rejects if the stream errors or `streamVaultExport` throws.
 */
async function bufferVaultExport(db: Db, companyId: string, companyName: string, now: Date): Promise<Buffer> {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on("data", (chunk: Buffer) => chunks.push(chunk));

  const collected = new Promise<Buffer>((resolve, reject) => {
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });

  // Minimal Response shim: archiver pipes into the PassThrough; the only
  // non-stream method `streamVaultExport` calls is `setHeader`, which we
  // capture to a discarded Map. Cast at the seam - a single `unknown`
  // hop is acceptable here because the real Response type is huge but
  // we provably only touch two methods (verified by the P3.1 integration
  // test, which uses the same shape).
  const headers = new Map<string, string>();
  const setHeader = (name: string, value: number | string | readonly string[]): unknown => {
    headers.set(name, Array.isArray(value) ? value.join(", ") : String(value));
    return undefined;
  };
  const fakeRes = Object.assign(stream, { setHeader }) as unknown as Response;

  await streamVaultExport(
    { db },
    {
      companyId,
      companyName,
      res: fakeRes,
      now: () => now,
    },
  );

  return collected;
}

export async function runVaultSnapshotCron(db: Db, opts: SnapshotCronOpts): Promise<CronResult> {
  const result: CronResult = { attempted: 0, succeeded: 0, failed: 0, skipped: 0 };
  const now = opts.now ?? new Date();

  const settingsService = instanceSettingsService(db);
  const general = await settingsService.getGeneral();
  const vs: InstanceVaultSnapshotSettings | undefined = general.vaultSnapshot;

  // Top-level guards: settings absent, disabled, or cadence mismatch → skip
  // the entire tick. We don't enumerate companies in these cases because
  // there's nothing to do and surfacing a per-company "skipped" count would
  // misleadingly imply the cron evaluated each company.
  if (!vs || !vs.enabled) {
    return result;
  }
  if (vs.cadence !== opts.cadence) {
    return result;
  }
  if (!vs.bucketName || !vs.endpoint || !vs.accessKeyIdSecretId || !vs.secretAccessKeySecretId) {
    logger.warn(
      { cadence: opts.cadence, hasBucket: !!vs.bucketName, hasEndpoint: !!vs.endpoint },
      "[vault-snapshot] enabled but config incomplete - skipping cron tick",
    );
    return result;
  }

  const companyRows: CompanyRow[] = await db.select({ id: companies.id, name: companies.name }).from(companies);

  const secrets = secretService(db);

  for (const company of companyRows) {
    try {
      // Per-company credential resolution. Secrets are per-company in the
      // schema, so a single set of secret-IDs in the instance settings
      // means each company looks up *its own* secrets at those IDs. If a
      // company doesn't have those secret rows, resolve throws → caught
      // below as a skip with a warning (NOT a failure - a missing
      // credential is operator misconfiguration, not a transient error).
      let accessKeyId: string;
      let secretAccessKey: string;
      try {
        accessKeyId = await secrets.resolveSecretValue(company.id, vs.accessKeyIdSecretId, "latest");
        secretAccessKey = await secrets.resolveSecretValue(company.id, vs.secretAccessKeySecretId, "latest");
      } catch (err) {
        logger.warn(
          { err, companyId: company.id, companyName: company.name },
          "[vault-snapshot] missing R2 credentials for company - skipping",
        );
        result.skipped += 1;
        vaultSnapshotsTotal.inc({ cadence: opts.cadence, status: "skipped" });
        continue;
      }

      result.attempted += 1;
      const body = await bufferVaultExport(db, company.id, company.name, now);
      const key = buildSnapshotKey({ keyPrefix: vs.keyPrefix, date: now, companyName: company.name });
      const upload = await uploadVaultToR2({
        bucketName: vs.bucketName,
        endpoint: vs.endpoint,
        accessKeyId,
        secretAccessKey,
        key,
        body,
      });
      logger.info(
        {
          companyId: company.id,
          cadence: opts.cadence,
          key,
          sizeBytes: upload.sizeBytes,
          etag: upload.etag,
        },
        "[vault-snapshot] uploaded",
      );
      result.succeeded += 1;
      vaultSnapshotsTotal.inc({ cadence: opts.cadence, status: "succeeded" });
    } catch (err) {
      // Per-company isolation: log + count + continue. A bad-creds failure
      // for company A must not prevent company B from snapshotting.
      logger.error({ err, companyId: company.id, cadence: opts.cadence }, "[vault-snapshot] upload failed");
      result.failed += 1;
      vaultSnapshotsTotal.inc({ cadence: opts.cadence, status: "failed" });
    }
  }

  return result;
}
