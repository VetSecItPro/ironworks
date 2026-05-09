# Design Spec: Memory Upgrade Phase 3.2 — Scheduled R2 Vault Snapshot Cron

**Date:** 2026-05-08
**Approach:** Reuse `streamVaultExport` from P3.1 + S3-compatible client against R2 endpoint + cron registration in periodic-notes scheduler
**Status:** APPROVED

---

## Problem

P3.1 (PR #186) shipped on-demand vault export via `GET /api/companies/:companyId/vault-export.zip`. Customers can pull. P3.2 closes the loop: scheduled push of the vault to a customer-owned Cloudflare R2 bucket, so the vault is durably backed up offsite without operator intervention.

R2 is S3-API-compatible — same `@aws-sdk/client-s3` already in deps, just point at R2's endpoint URL.

## Goal

After P3.2:

- Per-company opt-in via new `instanceGeneralSettings.vaultSnapshot` section: `{ enabled, bucketName, endpoint, accessKeyId, secretAccessKey, keyPrefix?, cadence: "daily"|"weekly" }` (credentials stored as company secrets, not raw in settings).
- New cron: daily 03:00 CT and weekly Sunday 03:30 CT (offset from cost-rollup crons to avoid load spikes).
- Cron iterates every company with `vaultSnapshot.enabled = true` and matching cadence, generates the vault zip in-memory (or temp file), uploads to `s3://<bucketName>/<keyPrefix>/<YYYY-MM-DD>/<companyName>-vault.zip` via S3-compatible PUT.
- Idempotent on key (overwrite). Logs success/failure per company.
- New metric: `ironworks_vault_snapshots_total{company,cadence,status}`.
- Failures are non-fatal — one failing company doesn't break the cron for others.

## Non-Goals

- ❌ NOT building UI for configuring R2 credentials (settings PATCH suffices for now)
- ❌ NOT supporting non-S3-compatible buckets (Backblaze, Wasabi work too — same S3 API; document but don't test)
- ❌ NOT supporting multiple buckets per company
- ❌ NOT a delta/incremental snapshot (full vault every time; trade simplicity for storage cost)
- ❌ NOT auto-cleanup of old snapshots in R2 (customer manages bucket lifecycle policies themselves)

## Approach

### High-level architecture

```
Cron (daily 03:00 CT + weekly Sun 03:30 CT)
       │
       ▼
For each company with vaultSnapshot.enabled = true and cadence match:
       │
       ├─ resolveSnapshotCreds(db, companyId) → { bucket, endpoint, accessKey, secretKey, prefix }
       ├─ streamVaultExport(deps, { companyId, companyName, res: stream })
       │    (reuse from P3.1; pipe to a passthrough stream that buffers
       │     for upload OR pipe directly to multipart upload)
       ├─ s3.send(new PutObjectCommand({ Bucket, Key, Body: streamOrBuffer }))
       └─ logger.info({ company, cadence, key, sizeBytes }, "[vault-snapshot] uploaded")

Errors per company → log + emit metric + continue to next company
```

### Why reuse `streamVaultExport`

P3.1 already wrote a streaming composer that produces a valid Obsidian vault zip. P3.2 just needs the bytes — same `streamVaultExport` function works against any writable stream, not just `res`. We pipe it into a passthrough → buffer → `PutObjectCommand.Body`. (Or use S3 multipart upload for very large vaults — but for v1, buffer-then-upload is simpler and works for typical KB sizes.)

### Why settings-based credentials, not env vars

Multi-tenant: each company configures their own bucket. Env vars are operator-tier; settings are company-tier. Credentials get stored as `company_secrets` (already encrypted, per existing pattern) and the settings field references the secret IDs.

### Why cron at 03:00/03:30 CT

- Cost rollup crons run at 00:30 CT (Sunday) and 00:30 CT (1st of month). Spacing the snapshot cron by 2.5+ hours avoids load contention.
- 03:00 CT = 09:00 UTC = lowest-traffic global window.
- Weekly variant runs at 03:30 CT to stagger from daily (which fires every day including Sunday).

## Architecture

### Components to Create

| Component | Path | Purpose |
|---|---|---|
| Snapshot service | `server/src/services/vault-snapshot/index.ts` | `runVaultSnapshotCron(db, opts)` — iterate companies + run snapshots |
| S3-compatible uploader | `server/src/services/vault-snapshot/uploader.ts` | `uploadVaultToR2(args)` — PUT zip bytes to bucket |
| Settings types | extend `packages/shared/src/validators/instance.ts` | `vaultSnapshotSettingsSchema` |
| Tests | `server/src/services/vault-snapshot/__tests__/*.test.ts` (3 files) | Unit + integration |

### Components to Modify

| File | What Changes | Why |
|---|---|---|
| `packages/shared/src/validators/instance.ts` | Add `vaultSnapshot` section to `instanceGeneralSettingsSchema` | Operator config |
| `packages/shared/src/types/instance.ts` | Re-export new type | Type surface |
| `server/src/services/instance-settings.ts` | Normalize new section through read/patch | Settings round-trip |
| `server/src/services/periodic-notes/cron.ts` | Register two new timers (daily 03:00 CT, weekly Sun 03:30 CT) calling `runVaultSnapshotCron(db, { cadence })` | Cron lifecycle |
| `server/src/observability/metrics.ts` | Add `ironworks_vault_snapshots_total` counter (labels: company, cadence, status) | Ops visibility |
| `CHANGELOG.md` `[Unreleased]` | Document feature | Release trail |
| `docs/OPERATIONS.md` | Add P3.2 section: configuring R2 + ops queries | Runbook |

### Settings shape

```typescript
// packages/shared/src/validators/instance.ts
const vaultSnapshotSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  bucketName: z.string().min(1).optional(),
  endpoint: z.string().url().optional(),               // R2: https://<account>.r2.cloudflarestorage.com
  accessKeyIdSecretId: z.string().uuid().optional(),    // FK to company_secrets
  secretAccessKeySecretId: z.string().uuid().optional(),// FK to company_secrets
  keyPrefix: z.string().default(""),                    // optional prefix inside bucket
  cadence: z.enum(["daily", "weekly", "off"]).default("off"),
}).optional();

// extends instanceGeneralSettingsSchema:
notes: ...,
vaultSnapshot: vaultSnapshotSettingsSchema,
```

When `enabled=true` but credentials are unset → cron logs warning + skips.

### Uploader

```typescript
// server/src/services/vault-snapshot/uploader.ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export interface UploadArgs {
  bucketName: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  key: string;          // full S3 key including prefix
  body: Buffer;          // for v1, buffered upload; multipart deferred
}

export async function uploadVaultToR2(args: UploadArgs): Promise<{ etag: string | undefined; sizeBytes: number }> {
  const client = new S3Client({
    region: "auto",                      // R2 ignores region
    endpoint: args.endpoint,
    credentials: { accessKeyId: args.accessKeyId, secretAccessKey: args.secretAccessKey },
    forcePathStyle: true,                // R2 supports both, path-style is more portable
  });
  const result = await client.send(new PutObjectCommand({
    Bucket: args.bucketName,
    Key: args.key,
    Body: args.body,
    ContentType: "application/zip",
  }));
  return { etag: result.ETag, sizeBytes: args.body.length };
}
```

### Snapshot service

```typescript
// server/src/services/vault-snapshot/index.ts
import { PassThrough } from "node:stream";
import { streamVaultExport } from "../vault-export/index.js";
import { uploadVaultToR2 } from "./uploader.js";

export interface SnapshotCronOpts {
  cadence: "daily" | "weekly";
  now?: Date;
}

export interface CronResult {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export async function runVaultSnapshotCron(db: Db, opts: SnapshotCronOpts): Promise<CronResult>;
```

For each company with matching cadence + enabled:
1. Read settings — credentials by secret-id refs
2. Create a `PassThrough` stream + buffer collector
3. Call `streamVaultExport` with the passthrough as `res`
4. Once stream ends: combine collected chunks into a single `Buffer`
5. Compute key: `<keyPrefix>/<YYYY-MM-DD>/<companyName-slugified>-vault.zip`
6. `uploadVaultToR2(...)`
7. Log success + emit metric
8. On error: log + emit metric (failed) + continue to next company

### Cron registration

`periodic-notes/cron.ts` already has `startPeriodicNotesScheduler`. Add two more timers:

```typescript
function scheduleNextDailyVaultSnapshot(db: Db) {
  // 03:00 CT every day
  const ms = msUntilNextDailyVaultFire();
  dailyVaultTimer = setTimeout(async () => {
    if (stopping) return;
    inFlightDailyVault = (async () => {
      try {
        await runVaultSnapshotCron(db, { cadence: "daily" });
      } catch (err) {
        logger.error({ err }, "[vault-snapshot] daily cron failed");
      }
    })();
    await inFlightDailyVault;
    inFlightDailyVault = null;
    if (!stopping) scheduleNextDailyVaultSnapshot(db);
  }, ms);
  dailyVaultTimer.unref?.();
}

// (mirror for weekly)
```

`msUntilNextDailyVaultFire(now=new Date())` computes ms-until-next-03:00-CT. Reuse the CT-conversion pattern from the existing weekly/monthly cost-rollup helpers.

### Mocking the streaming export for tests

The integration test seeds a small company → calls `runVaultSnapshotCron(db, { cadence: "daily" })` with a mock `S3Client` (or `vi.mock("@aws-sdk/client-s3")`) → asserts upload was called with expected key + non-empty body.

Reusing the real `streamVaultExport` is fine — it's already tested in P3.1. The new tests focus on:
- Iteration logic (skip companies without enabled settings)
- Credential resolution from secrets
- Cadence filter (daily run skips weekly-only companies, etc.)
- Error isolation (one company fails → others still run)
- Metric emission

## User Flow

1. Operator/customer goes to Settings → General.
2. Configures `vaultSnapshot`:
   - Sets `bucketName`, `endpoint` (R2 URL like `https://<acc>.r2.cloudflarestorage.com`)
   - Stores R2 access key + secret as company_secrets, references them by ID
   - Sets `cadence: "daily"`
3. From now on, daily at 03:00 CT, the cron picks them up:
   - Generates the full vault zip
   - Uploads to `s3://<bucket>/<prefix>/<YYYY-MM-DD>/<companyName>-vault.zip`
4. Customer can list/restore/inspect via R2 dashboard or `aws s3 cp` against the R2 endpoint.
5. Failures appear in `ironworks_vault_snapshots_total{status=failed}` metric.

## Edge Cases

| Case | Behavior |
|---|---|
| Settings unset for company | Skipped silently (no log noise) |
| `enabled=true` but credentials missing | Logged warning, counted as skipped, cron continues |
| R2 returns 403 (bad credentials) | Logged error, counted as failed, cron continues |
| R2 returns 5xx (transient) | Logged error, counted as failed; next cron run retries |
| Vault export throws mid-stream | Logged error, counted as failed; partial upload not committed |
| Very large vault (>500MB) | Buffered in memory for v1. Documented limit; multipart deferred. |
| Bucket doesn't exist | 404 from R2; counted as failed; operator action |
| Two app instances running cron | Both upload; second overwrites first (PutObject is last-write-wins on same key). Not ideal but not destructive. Future: distributed lock. |
| Customer cancels enabled mid-cron-tick | Tick completes; next tick honors new setting |
| Cron skipped due to downtime | No backfill; operator can manually trigger via `pnpm tsx scripts/run-vault-snapshot.ts --company=<id>` (future helper, out of scope here) |
| Cadence "off" | Cron skips company entirely |
| Daily + weekly both enabled accidentally | Daily setting wins (cadence is single-value enum, schema enforces) |

## Constraints

- Reuse `streamVaultExport` from P3.1 — no duplication of vault rendering
- Buffered upload only for v1 (multipart deferred)
- Credentials as company_secrets, not raw settings
- Cron timers in CT timezone per CLAUDE.md
- Single-flight per cron timer
- Tests: ~10-12 new (uploader unit, snapshot iteration, cron lifecycle, settings round-trip)
- No `as any`

## Testing Strategy

- **Uploader unit:** mock `S3Client.send`, verify `PutObjectCommand` constructed with correct args
- **Snapshot service integration:** seed 3 companies (1 enabled daily, 1 enabled weekly, 1 disabled) → `runVaultSnapshotCron({ cadence: "daily" })` → assert 1 upload (daily one only); verify cadence filter
- **Error isolation:** mock first company's upload to throw → assert second company still uploads
- **Credential resolution:** missing secret refs → company skipped with warning
- **Cron lifecycle:** new timers start + stop correctly; no leak
- **Settings round-trip:** PATCH then GET preserves vaultSnapshot section + defaults
- **Metric emission:** counter incremented with correct labels per outcome

## Rollout

1. Schema/types + settings extension (no behavior change yet)
2. Uploader + snapshot service + tests
3. Cron registration (no impact when no companies have settings enabled)
4. Customer enables via settings → snapshots start landing
5. Monitor `ironworks_vault_snapshots_total` for failures

## Out of Scope (Revisit Later)

- **Multipart upload** for vaults >500MB
- **Lifecycle / retention** management (operator handles via R2 dashboard)
- **Distributed lock** to prevent multi-instance double-upload
- **UI** for configuring R2 settings
- **One-shot manual trigger script** (`scripts/run-vault-snapshot.ts`)
- **Restore tooling** (operator can restore via `aws s3 cp` against R2 endpoint)
- **Versioning / append** strategy (current: overwrite on same key)
- **Non-S3-compatible** providers (Box, GCS native, etc.)

## Open Questions

None.

---

## Implementation Handoff

Ready for `/subagent-dev`.

Task decomposition:

1. **Settings schema extension** (`vaultSnapshotSettingsSchema` + types + service normalization) + tests
2. **R2 uploader** (`uploadVaultToR2`) + unit tests with mocked S3Client
3. **Snapshot service** (`runVaultSnapshotCron`) + integration tests (mock S3 + reuse real streamVaultExport)
4. **Cron registration** in `periodic-notes/cron.ts` (daily + weekly) + lifecycle tests
5. **Metrics** addition + observability test
6. **CHANGELOG + OPERATIONS.md** entries

Total: 6 tasks. Projected ~1-2 days.
