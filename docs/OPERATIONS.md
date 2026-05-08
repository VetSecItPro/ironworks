# Operations Runbook

**Audience:** Operators running Ironworks in production.
**Status:** Living document — append a section when an incident teaches you something the rest of us would benefit from knowing.
**Last updated:** 2026-05-07

This runbook is a *map*, not the territory. It points at the existing detailed docs and fills the gaps where "what to do when X happens" is undocumented.

---

## Quick links

| If you need... | Read |
|---|---|
| Initial deploy | `docs/deploy/overview.md` → `docs/deploy/docker.md` or `docs/deploy/deployment-modes.md` |
| Environment variables | `docs/deploy/environment-variables.md` |
| Database (Postgres) | `docs/deploy/database.md` |
| Secrets handling | `docs/deploy/secrets.md` |
| Storage layout | `docs/deploy/storage.md` |
| Local dev | `docs/deploy/local-development.md` |
| HTTP adapters (LLM providers) | `docs/HTTP-ADAPTER-FAMILY.md` + `docs/adapters/provider-settings.md` |
| Agent runtime model | `docs/agents-runtime.md` |
| Deferred migrations roadmap | `docs/DEFERRED-MIGRATIONS.md` |
| CHANGELOG | `CHANGELOG.md` |

---

## 1. Deploy

The shipping path is automated:

1. PR merges to `master` → release workflow auto-publishes a Docker image to GHCR + npm package
2. VPS deploy fires via `ops` user + sudo (PR #155 retired root SSH); see `.github/workflows/deploy-vps.yml`
3. Post-deploy smoke test (`tests/release-smoke/`) auto-runs against the new container

**To force a redeploy** without code changes:
- Re-run the latest `release.yml` on the master branch via `gh workflow run release.yml --ref master`

**To roll back** a bad deploy:
- `pnpm release:rollback` reverts to the previous image tag and re-deploys
- See `scripts/rollback-latest.sh` for the implementation

---

## 2. Scaling agents (current ceiling: ~12)

Today's dogfood deploys top out around ~12 concurrently active agents per company. Beyond that you'll see:

- Heartbeat queue lag (>30s) — agents start "missing" their wake windows
- Database lock contention on `runs` and `agent_memory_entries`
- LLM provider rate-limits (especially for Claude direct API)

**To go higher:**

1. **Diversify providers** (`/companies/.../employment` cost matrix). Spread agents across `claude-local`, `anthropic-api`, `poe-api`, `openrouter-api`. Bottleneck shifts from one provider to several.
2. **Bump heartbeat interval** for non-critical roles. Set `IRONWORKS_HEARTBEAT_INTERVAL_SECONDS=60` (default 30) for departments where 60s latency is acceptable.
3. **Add a Postgres read replica** for read-heavy endpoints (`/agent-health`, `/quality-summary`, board briefing). Wire `DATABASE_URL_READONLY` once the replica exists; the server already routes reads to it when configured.
4. **Increase the runner heap.** Server is sized for ~512MB by default. Bump `NODE_OPTIONS=--max-old-space-size=2048` if you see GC pauses in heap-monitor snapshots.

If you're past 30 agents/company, file an issue — that scale is not yet validated and the architectural splits in `ironworks-backlog.md` (heartbeat.ts → 5 modules) become required to keep the dispatcher responsive.

---

## 3. Monitor

### 3.1 What's wired today

- **Heap monitor** (`server/src/observability/heap-monitor.ts`): auto-snapshots on heap-grow events; 7-day retention; chmod 0600 (snapshots may contain decrypted DEKs/JWT signing material). Default path is `/tmp/heap-snapshots` (in-container ephemeral) — override with `IRONWORKS_HEAP_SNAPSHOT_DIR`.
- **Release smoke** (`tests/release-smoke/`): Playwright spec runs post-deploy; checks docker-auth-onboarding flow. If it fails, the deploy stayed but the spec output goes to `release-smoke.yml` artifacts.
- **CI gates** (`/.github/workflows/pr.yml`): policy + verify (lint/typecheck/test/build/audit) + e2e on every PR. `pnpm audit --prod --audit-level high` (PR #162) blocks high+ CVEs in prod deps.

### 3.2 What's not wired (`ironworks-backlog.md` items #27–29)

- No /metrics endpoint (Prometheus). When wired, expect `request_duration_seconds`, `heartbeat_lag_seconds`, `llm_cost_usd_total{agent,provider}`, `queue_depth`.
- No error-rate alerting — read `pino` logs in the container, no off-box pipe yet.
- No per-agent token-cost breakdown in the UI — billing totals only.

For now, watch:
- `docker logs <container>` for `level=error` lines
- `/api/admin/stats` for live heartbeat queue depth
- Polar dashboard for billing anomalies (sustained 2x baseline = something looping)

### 3.3 What to do when ___

**Symptom:** Agents stop responding to channel messages.
- Likely cause: channel response router isn't built yet (backlog #21). Today, agents either don't respond or cascade. Check `server/src/services/channels.ts` for the wake logic.

**Symptom:** Heartbeat queue lag climbs and stays high.
- `SELECT count(*) FROM runs WHERE status='pending' AND created_at < now() - interval '2 minutes';`
- If >50: a provider is rate-limited. Check `/api/admin/provider-health` for the slow one. Disable it via `ADAPTER_DISABLE_<provider>=1` env var until cleared.
- If LLM-side healthy: a long-running job is hogging the worker. Find it: `SELECT id, agent_id, started_at FROM runs WHERE status='running' ORDER BY started_at LIMIT 5;` — anything running > 10min is stuck. Cancel it via the UI or `UPDATE runs SET status='cancelled' WHERE id=...`.

**Symptom:** Heap snapshots accumulating + memory climbing.
- Confirm: `ls -lh $IRONWORKS_HEAP_SNAPSHOT_DIR | head`
- Check the latest snapshot in Chrome DevTools Memory tab. Look for retained closures referencing run IDs (the historical leak — see PR #157 for fix context).
- Rotate the container: `systemctl restart ironworks` (or via your VPS deploy mechanism). Snapshots persist but live memory clears.

**Symptom:** Webhook (email/routine-trigger) returns 401 unexpectedly.
- For email: check `MAILGUN_WEBHOOK_SIGNING_KEY` / `SENDGRID_WEBHOOK_PUBLIC_KEY`. If set but provider rotated keys, signature verify fails. Verify the key in your provider dashboard matches what's deployed.
- For routine-trigger: the trigger has a secret and `signingMode: hmac_sha256` configured (see `routine_triggers` table). Caller must include `X-Ironworks-Signature` + `X-Ironworks-Timestamp` headers, signed against the secret stored in `companySecrets`. See `server/src/services/routines.ts:1119-1181`.

**Symptom:** CORS errors in the browser console.
- `IRONWORKS_ALLOWED_ORIGINS` must include the UI's exact origin (scheme + host + port). No wildcards. Comma-separated.
- Unset in production triggers reflective fallback + a startup warning in the server log. If you see "CORS allowlist not configured" in startup logs, that's why.

---

## 4. Failover

Ironworks is single-instance today (no clustering). Failover means: get a fresh container running and pointed at the same Postgres + storage volume.

**Checklist:**

1. **Database backup is current.** `pnpm db:backup` runs nightly via cron; verify timestamp on `/var/lib/ironworks/backups/`. If stale, restore from the most recent valid one (`scripts/backup-db.sh restore <file>`).
2. **Storage volume is intact.** Heap snapshots, agent worktrees, and uploaded files live in the volume. If the volume is gone, agents will recreate worktrees on next heartbeat — slow but recoverable.
3. **Secrets are reachable.** `IRONWORKS_SECRETS_KEK_B64` must be the same on the new instance — without it, `companySecrets` and provider keys can't decrypt. Restore from your secret manager (1Password, Vault, etc.). **NEVER commit this; never store on the host.**
4. **DNS / reverse proxy.** Repoint to the new instance. Tailscale-private deploys: see `docs/deploy/tailscale-private-access.md`.

If the database is gone and no recent backup: agents are stateless beyond their memory entries; you can rebuild a company from agent role assignments + project data via the wizard. Memory and run history are lost. Filing an incident report is the right move.

---

## 5. Secrets rotation

### 5.1 KEK rotation (`IRONWORKS_SECRETS_KEK_B64`)

This is the master key that unlocks `companySecrets` (provider API keys, webhook secrets, etc.). Rotate when:
- A team member with KEK access leaves
- Suspected compromise
- Compliance schedule (recommended every 90 days)

**Procedure** (uses `scripts/migrate-inline-env-secrets.ts` infrastructure):

1. Generate new KEK: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
2. Set BOTH on the running instance: `IRONWORKS_SECRETS_KEK_B64=<old>` and `IRONWORKS_SECRETS_KEK_B64_NEXT=<new>`
3. Restart container. Server reads with old, writes with new.
4. Run `pnpm secrets:migrate-inline-env --rewrap` (one-shot). All `companySecrets` rows get re-encrypted under the new KEK.
5. Set `IRONWORKS_SECRETS_KEK_B64=<new>`, drop `IRONWORKS_SECRETS_KEK_B64_NEXT`. Restart. Old KEK can be retired.

If `_NEXT` is unset and you swap the KEK alone: every existing secret becomes unreadable. **Don't.**

### 5.2 Provider API key rotation

Per-provider; see each adapter's README. General pattern:

1. Generate new key in provider dashboard (Anthropic, OpenAI, OpenRouter, Poe).
2. Update via Settings → Providers UI (preferred) or env var (`ANTHROPIC_API_KEY` etc.).
3. Old key continues to work until you revoke it in the provider dashboard. Wait 5min for active runs to drain before revoking.

### 5.3 Webhook signing keys

- `MAILGUN_WEBHOOK_SIGNING_KEY`: rotate via Mailgun dashboard → Sending → Domain settings → Webhooks. Update env. Server fails-closed when key set but signature mismatched.
- `SENDGRID_WEBHOOK_PUBLIC_KEY`: rotate via Twilio/SendGrid event-webhook settings. Update env.
- `IRONWORKS_EMAIL_WEBHOOK_SECRET` (legacy bearer-token fallback): rotate by setting new value + updating any callers. Provider-signature path takes precedence when set.

---

## 6. Provider migration

When you want to move a department off one LLM provider onto another (cost, capability, outage).

**Steps:**

1. Stage in dev: pick one role, change its `model_assignment` in the company config to the new provider. Run for a day. Compare quality scores in `/companies/.../nolan/quality-summary`.
2. If quality holds: roll out the same change in production via Settings → Roles → assign new model.
3. Watch for `quality_drift` flags in `/agent-health` for 48h. Drift means the new model is failing where the old one wasn't — roll back.

For provider-wide outages (e.g., Anthropic down for 30+ min):
- `ADAPTER_DISABLE_anthropic_api=1` env var disables the adapter entirely. Affected agents move to their fallback model (set in `model_assignment.fallback`).
- Restart container to pick up the env change.
- When provider recovers, drop the env var + restart. Agents resume on primary.

---

## 7. Common operator commands

```bash
# Show live heartbeat queue
psql $DATABASE_URL -c "SELECT count(*) FROM runs WHERE status='pending';"

# Show agents currently running
psql $DATABASE_URL -c "SELECT id, agent_id, started_at, now()-started_at AS age FROM runs WHERE status='running' ORDER BY started_at;"

# Cancel a stuck run
psql $DATABASE_URL -c "UPDATE runs SET status='cancelled', cancelled_at=now() WHERE id='<run-id>';"

# Tail server logs (docker)
docker logs -f --tail 200 ironworks

# Force a heap snapshot
docker exec ironworks node -e "require('v8').writeHeapSnapshot('/tmp/heap-snapshots/manual-' + Date.now() + '.heapsnapshot')"

# Run release smoke locally against prod
pnpm test:release-smoke -- --base-url https://your-prod-host

# Cycle the deploy
./scripts/release.sh stable
```

---

## 8. Known limits + planned fixes

See `ironworks-backlog.md` for the live list. Highlights:

- **Channel chat infinite-loop bug** (#21): agents cascade on channel posts. Today's mitigation: keep agent count low, avoid putting many agents in the same channel. Fix is the rule-based response router in `agent-chat-plan.md`.
- **No /metrics endpoint** (#27): observability is log-based only.
- **MCP context injection** (#1, deferred): only Claude/Codex/Gemini adapters get MCP context today. CLI-less HTTP adapters need a sidecar proxy (architectural design pending).
- **No email verification on signup** (#23): wizard accepts any email. Bad-actor mitigation: rate-limit on the signup endpoint.

When in doubt: check `CHANGELOG.md` (what shipped recently) before assuming something is broken — it might just be new.

---

## 8a. Embeddings pipeline

### Configuration

The async embeddings pipeline writes pgvector embeddings for agent memory entries (1536d) and knowledge page chunks (768d). Provider is selected per env:

- `IRONWORKS_MEMORY_EMBEDDING_PROVIDER` — `openai` (default model: text-embedding-3-small) | `ollama` | `noop`. Default: `noop` (disabled).
- `IRONWORKS_CHUNK_EMBEDDING_PROVIDER` — same values. Default: `ollama` (preserves existing knowledge_chunks behavior).
- Set `=noop` on either to disable that pipeline without redeploy. The kill switch is the env var, not a feature flag in code.

If a provider is configured but the API key is missing, the factory degrades to NoOp with a warn-once log entry.

### Operating the queue

Pending and failed counts:

```sql
SELECT status, count(*) FROM embedding_jobs GROUP BY status;
SELECT status, count(*) FROM chunking_jobs GROUP BY status;
```

Failed jobs (terminal - exhausted retries or non-retryable error):

```sql
SELECT id, target_type, target_id, attempts, last_error, completed_at
FROM embedding_jobs
WHERE status = 'failed'
ORDER BY completed_at DESC
LIMIT 50;
```

Re-queue a failed job:

```sql
UPDATE embedding_jobs
SET status = 'pending', attempts = 0, last_error = NULL, claimed_at = NULL
WHERE id = '<job-id>';
```

### Prometheus metrics

- `ironworks_embedding_jobs_pending{status, target_type}` - gauge of queue depth
- `ironworks_embedding_jobs_failed_total{target_type}` - counter of terminal failures
- `ironworks_embedding_provider_latency_seconds{provider, model, operation}` - histogram of provider call latency
- `ironworks_embedding_provider_errors_total{provider, model, error_class}` - counter of provider errors (rate_limit / server_error / client_error / timeout / dim_mismatch / other)

### Backfill

After enabling a provider on an existing deploy, run the backfill script to populate embeddings on existing rows:

```bash
pnpm tsx scripts/backfill-embeddings.ts --target=both
```

Or by target: `--target=memory` or `--target=chunks`. Add `--batch-size=N` (default 50) and `--dry-run` for safety.

The backfill is idempotent - rows with embeddings already present are skipped at the SELECT level. Safe to re-run.

### Scaling

Multiple worker processes are safe via `FOR UPDATE SKIP LOCKED`. To scale out: deploy more app instances; each runs its own scheduler tick. No coordination required.

A worker that crashes mid-tick has its claimed jobs reclaimed automatically after 5 minutes (configurable in `queue.ts:DEFAULT_STALE_MS`).

---

## Knowledge link graph

### Backfill

After deploying P1 (link graph), backfill existing pages once:

```bash
pnpm tsx scripts/backfill-knowledge-links.ts
```

This iterates every `knowledge_pages` row, parses `[[wikilinks]]` in the body, and populates `knowledge_page_links` rows. Idempotent - safe to re-run.

### Investigating broken links

Find every unresolved link in a company:

```sql
SELECT kpl.unresolved_slug, kp.slug AS source_page, kp.title
FROM knowledge_page_links kpl
JOIN knowledge_pages kp ON kp.id = kpl.from_id
WHERE kpl.company_id = '<company-id>' AND kpl.to_id IS NULL
ORDER BY kpl.created_at DESC;
```

Broken links auto-resolve when a page is created with the matching slug or alias.

### Pages with most inbound links

```sql
SELECT kp.slug, kp.title, count(*) AS inbound
FROM knowledge_page_links kpl
JOIN knowledge_pages kp ON kp.id = kpl.to_id
WHERE kpl.company_id = '<company-id>'
GROUP BY kp.id, kp.slug, kp.title
ORDER BY inbound DESC
LIMIT 20;
```

---

## 9. Filing an incident

When something genuinely breaks in prod:

1. Capture: server log slice (start ~5 min before symptom), heap snapshot if memory-related, recent CHANGELOG entries that touched the affected subsystem.
2. Triage with `/incident` skill — produces structured root-cause + postmortem.
3. Add a "Symptom + fix" entry to **section 3.3** above so the next operator (often you, six months later) finds the answer fast.
