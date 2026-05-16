# Changelog

All notable changes to IronWorks are documented in this file.

## [Unreleased]

### Security

- **Local-process adapters gated to self-host deployments.** In `authenticated` (hosted, multi-tenant) deployments, agents may no longer be created or updated onto a local-process adapter (`process`, `claude_local`, `codex_local`, `opencode_local`, `pi_local`, `cursor`, `hermes_local`). Those adapters spawn a CLI tool as a child process inside the shared server container, where it would inherit the filesystem, environment, and `DATABASE_URL` of every other tenant - `company_id` request scoping does not contain a spawned process. Hosted deployments now permit only network adapters (`anthropic_api`, `openai_api`, `openrouter_api`, `poe_api`, `http`, `openclaw_gateway`, `ollama_cloud`); the `http` adapter remains available as bring-your-own execution. Local-process adapters are unchanged in `local_trusted` (single-operator self-host) deployments, which are single-tenant. Enforced at the `agentService` create/update chokepoint (covers REST create, `agent-hires`, company onboard, YAML import) plus a defense-in-depth runtime guard in the heartbeat scheduler. New `@ironworksai/shared` exports: `LOCAL_PROCESS_ADAPTER_TYPES`, `CLOUD_ADAPTER_TYPES`, `isLocalProcessAdapterType`. See `docs/adr/2026-05-16-hosted-adapter-policy.md`.

### Added

- **Scheduled R2 vault snapshot cron (P3.2).** Per-company opt-in via `instanceGeneralSettings.vaultSnapshot` section. Daily (03:00 CT) and weekly (Sunday 03:30 CT) crons iterate enabled companies, generate the vault zip via the P3.1 export pipeline, and PUT to a customer-configured Cloudflare R2 bucket (S3-compatible API, uses existing `@aws-sdk/client-s3`). Idempotent on object key (overwrite). New metric `ironworks_vault_snapshots_total{cadence,status}` for ops visibility. Per-company failures are isolated - one company's snapshot failure doesn't break the batch.
- **Vault export endpoint (P3).** `GET /api/companies/:companyId/vault-export.zip` streams an Obsidian-compatible folder-tree zip with all knowledge pages (P0+P1+P2 outputs already shaped right), agent profiles, issues with comments, skills, and a minimal `.obsidian/app.json` config. Reuses canonical Frontmatter types throughout. `[[wikilinks]]` work in Obsidian without modification. Uses streaming (archiver) so 10K+ page KBs export without buffering in memory.
- **Periodic notes + cost rollups (P2).** Agent run completions optionally emit knowledge pages at `agents/<slug>/runs/<YYYY-MM-DD>/<run-id>.md` (opt-in via `instanceGeneralSettings.notes.persistRunNotes`). Decisions logged via `logDecisions` auto-emit `decisions/<decision-id>.md` pages with `[[wikilinks]]` to source issue/agent/project (default on, toggle via `notes.persistDecisionNotes`). Weekly + monthly cost rollup pages emit at `finance/cost-rollups/{weekly,monthly}/<period>.md` via cron (Sunday 00:30 CT and 1st 00:30 CT). All notes use canonical Frontmatter types with new `CostRollupFrontmatter`. Periodic-notes scheduler boots in `app.ts` next to embeddings scheduler.
- **Cross-doc link graph (P1).** `[[slug]]` and `[[slug#anchor]]` wikilink syntax in knowledge pages now parsed on save and stored as graph edges in `knowledge_page_links`. Frontmatter `aliases: []` lets renamed pages keep accepting incoming links. Unresolved slugs persist as broken-link placeholders that auto-rebind when the target page is created. New endpoints: `GET /api/knowledge-pages/:id/backlinks` and `GET /api/knowledge-pages/:id/graph?hops=1|2`. UI: backlinks sidebar + 1-2 hop force-directed graph view (`@xyflow/react`) on `KnowledgePageViewer`. Backfill script: `scripts/backfill-knowledge-links.ts`.
- **Memory + Knowledge embeddings pipeline (P0).** Async queue (`embedding_jobs`, `chunking_jobs`) drained by in-process `EmbeddingsWorker` writes pgvector embeddings on every memory entry create/update and knowledge_pages chunk on save. Polymorphic `EmbeddingProvider` abstraction (OpenAI default for memory at 1536d, Ollama default for chunks at 768d, NoOp for tests/missing-config). Tier-3 cosine-similarity retrieval activated in `getContextualMemories` and `findRelevantMemories` — agents now find semantically-related context. Backfill: `scripts/backfill-embeddings.ts --target=memory|chunks|both`. New Prometheus metrics: `ironworks_embedding_jobs_pending`, `ironworks_embedding_jobs_failed_total`, `ironworks_embedding_provider_latency_seconds`, `ironworks_embedding_provider_errors_total`.
- **Canonical Frontmatter types module** at `packages/shared/src/types/frontmatter/` — 7 entity-typed shapes (knowledge, decision, skill, agent, project, issue, run) + render/parse helpers. Reachable via `@ironworksai/shared` and re-exported through `company-portability-shared.ts` for future vault export.
- **Provider env vars:** `IRONWORKS_MEMORY_EMBEDDING_PROVIDER`, `IRONWORKS_MEMORY_EMBEDDING_MODEL`, `IRONWORKS_CHUNK_EMBEDDING_PROVIDER`, `IRONWORKS_CHUNK_EMBEDDING_MODEL`, `IRONWORKS_EMBEDDINGS_TICK_INTERVAL_MS`. Provider env IS the kill switch — `=noop` disables embeddings without redeploy.

- **Channel router safeguards: per-agent cooldown + hourly circuit breaker**
  (`server/src/services/channel-router.ts`,
  `packages/db/src/schema/channel_response_state.ts`,
  `packages/db/src/migrations/0095_channel_response_state_safeguards.sql`).
  Closes the remaining Layer 3 loop-prevention rules from `agent-chat-plan.md`
  that the original router shipped without: (1) a per-agent 5-min cooldown
  filter so a chatty agent cannot monopolize a channel via repeated
  re-wakeups - applied to both the @mention path and the relevance-scoring
  path, explicit mentions do not override; (2) a hard 20-responses-per-channel
  hourly circuit breaker that fires before @mention extraction and is
  independent of human activity (the existing 10-min soft cap is reset by
  human messages; this hard ceiling is not). Migration 0095 adds three
  columns to `channel_response_state` via `ADD COLUMN IF NOT EXISTS`
  (idempotent, forward-only, defaults backfill existing rows):
  `hourly_agent_response_count`, `hourly_window_start`,
  `agent_last_responded_at` (jsonb agentId -> ISO timestamp map, pruned to
  last 60 min on every write to keep payload bounded). `recordAgentResponse`
  now requires an `agentId` parameter; the single caller in `channels.ts`
  passes `opts.authorAgentId`. Adds 19 unit + integration tests in
  `server/src/services/channel-router.test.ts` (per-agent filter,
  circuit-breaker hit/recover, mentioned-agent override blocked, counter
  increment / reset / prune, 21-message integration that proves the hard
  cap fires at exactly 20 wakeups). All existing 9 channel route tests stay
  green. Closes tasks #21 and #22 from the agent-chat backlog.
- **E2E Playwright specs for top user flows** (`tests/e2e/issue-lifecycle.spec.ts`,
  `tests/e2e/approvals.spec.ts`, `tests/e2e/agent-chat.spec.ts`). Adds the
  three top-flow specs called for by the audit on top of the existing
  onboarding + docker-auth-onboarding coverage. `issue-lifecycle` drives an
  issue from backlog -> in_progress -> done with a comment and verifies the
  IssueDetail page renders; `approvals` creates two synthetic `quality_gate`
  approvals and drives one through approve and the other through reject,
  asserting the list reflects both transitions and the Approvals page
  renders; `agent-chat` posts a human message into the auto-created
  `#company` channel and reads it back from both the API feed and the
  ChannelView UI. All specs run in `IRONWORKS_E2E_SKIP_LLM=true` mode (no
  LLM API keys required) and complete inside the existing 60s per-test
  budget. Specs follow the onboarding.spec.ts pattern: API-first state
  drive, UI-last sanity assertion, unique IDs via `Date.now()`,
  `expect(...).toBeVisible({ timeout: 15_000+ })` for slow renders.
  Playwright now lists 4 specs across 4 files (was 1 spec across 1 file
  for the top-flows; the docker-auth spec already existed).
- **Middleware unit tests for rate limiter + security headers**
  (`server/src/middleware/rate-limit.test.ts`,
  `server/src/middleware/security-headers.test.ts`). The in-memory rate limiter
  and the hand-rolled security-headers middleware were previously inline in
  `app.ts` with no isolated coverage. Both are now extracted into their own
  modules (`middleware/rate-limit.ts` + `middleware/security-headers.ts`) with
  identical runtime behavior, mounted on a tiny supertest harness, and covered
  by 13 new tests: rate-limit allows up-to-N, returns 429 over-limit, isolates
  per-IP buckets, resets after window expiry, exempts `/api/health` and
  heartbeat routes, skips OPTIONS preflights, and handles the unknown-IP
  fallback; security-headers emits the four standard hardening headers on
  every response, gates CSP on the vite-dev flag, and pins the SEC-HDR-001
  inline-script SHA-256 as a regression guard. Existing `actorMiddleware`
  coverage in `auth.test.ts` (34 tests) is preserved. Total middleware suite
  is now 47 tests across 3 files.
- **Adapter startup smoke tests for codex-local, cursor-local, gemini-local**
  (`packages/adapters/{codex,cursor,gemini}-local/src/server/*.test.ts`).
  These three CLI process adapters previously had zero unit-test coverage. Each
  package now ships its own `vitest.config.ts` (registered in the root
  `vitest.config.ts` `projects[]` array, alongside pi-local which had a config
  but wasn't wired into the root project list either). New tests cover: module
  imports without throwing, JSONL stream parser happy/error/malformed paths,
  unknown-session-error matchers, sessionCodec round-trips, and pure helpers
  (`resolveSharedCodexHomeDir` / `resolveManagedCodexHomeDir` for codex,
  `firstNonEmptyLine` + `isGeminiTurnLimitResult` for gemini). 39 new tests
  total across 8 files. Adapters do NOT spawn the underlying CLI binary —
  these are protocol/parser smoke tests, not integration tests, so they run in
  under a second with no env dependencies.
- **Webhook alerter for observability events** (`server/src/observability/alerter.ts`).
  Heap-monitor auto-snapshot triggers and uncaught exceptions/rejections now
  POST to an operator-configurable incoming webhook (Slack-compatible by
  default, Discord and most generic endpoints accept the same shape). Without
  this, operators had to tail container logs to notice a heap-grow trigger or
  a fatal error - off-box visibility is now opt-in via env vars. New env vars:
  `IRONWORKS_ALERT_WEBHOOK_URL` (when unset, alerter is a no-op; when set,
  every alert posts here) and `IRONWORKS_ALERT_FORMAT=raw` (optional; skips
  the Slack `{text}` wrapper and posts the AlertEvent JSON directly for
  custom collectors). Alerter is rate-limited at 1 alert per (source,
  severity) per 5 minutes to prevent loop-storms drowning the channel, and
  uses Node 24's built-in fetch + `AbortSignal.timeout(5000)` - no new deps.
  Wired into `heap-monitor.ts` (auto-snapshot path) and
  `lib/error-tracking.ts` (`uncaughtException` + `unhandledRejection`
  handlers). +9 tests in `alerter.test.ts`.
- **Prometheus `/metrics` endpoint** (`server/src/observability/metrics.ts`).
  BasicAuth-gated Prometheus text-format endpoint for operator dashboards.
  Default OFF: returns 404 unless `IRONWORKS_METRICS_BASIC_AUTH=user:password`
  is set in the environment. Emits:
  - **Process**: `nodejs_heap_size_bytes`, `nodejs_external_memory_bytes`,
    `nodejs_eventloop_lag_seconds`, `process_cpu_user_seconds_total`,
    `process_cpu_system_seconds_total`, `process_uptime_seconds` (default Node
    metrics from `prom-client`).
  - **HTTP**: `http_requests_total{method,route,status_class}` — counter labeled
    by the matched Express route pattern (e.g. `/api/issues/:id`), not the raw
    path, so cardinality stays bounded by the route table.
  - **Heartbeat**: `ironworks_runs_total{status}` (counter, incremented in
    `setRunStatus` on terminal transitions: succeeded/failed/cancelled/timed_out)
    and `ironworks_active_runs` (gauge, sampled per scrape).
  - **LLM cost**: `ironworks_llm_cost_usd_total{provider,model}` (counter,
    incremented in `updateRuntimeState` from the existing `result.costUsd`
    telemetry).
  - **Queue depth**: `ironworks_run_queue_depth` (gauge, sampled per scrape via
    `SELECT count(*) FROM heartbeat_runs WHERE status='queued'`).

  New env var: `IRONWORKS_METRICS_BASIC_AUTH=<user>:<password>`. Adds
  `prom-client` server dependency. 8 unit tests cover BasicAuth gating,
  HTTP-counter cardinality discipline, and counter accumulation.
- **Anthropic context compaction in claude-local** (`packages/adapters/claude-local/src/server/execute.ts`).
  The Claude CLI's `--betas <name>` flag (v2.1.132+) now passes through `compact-2026-01-12`
  to the Anthropic API for API-key authenticated runs (`ANTHROPIC_API_KEY` set).
  Subscription/OAuth runs are unchanged — Anthropic restricts beta-header passthrough
  to API-key auth, so subscription users continue to rely on the CLI's internal
  session management. Wired via new pure helper `buildCompactionArgs(enabled, billingType)`
  with 8 unit tests in `execute.test.ts`. Prompt-cache breakpoints (line-69 TODO) are
  still blocked — Claude CLI doesn't yet expose a `--cache-control` / `--cache-breakpoints`
  flag.
- **MCP tool catalog injection for process adapters** (claude-local, codex-local,
  gemini-local, cursor-local, opencode-local, pi-local). The MCP tools discovered
  by `injectMcpTools()` in heartbeat-context now reach process adapters via the
  prompt itself (advisory section), where previously only HTTP adapters consumed
  `ironworksMcpTools`. Process-adapter agents now see the full namespaced tool
  catalog (`mcp__<server>__<tool>`) with descriptions and can reference tools in
  their planning. Dispatch is NOT yet bidirectional for process adapters — the
  CLIs they shell out to drive their own tool loops, which we don't control.
  Full dispatch (sidecar proxy or stdout-marker bridge) is tracked as follow-up.
  Implemented via shared `appendMcpToolsAdvisory()` helper in
  `@ironworksai/adapter-utils/server-utils` so all six adapters use identical
  injection semantics. (+8 unit tests covering the helper.)

### Changed

- `instanceGeneralSettingsSchema` extended with `vaultSnapshot` section: `{ enabled, bucketName, endpoint, accessKeyIdSecretId, secretAccessKeySecretId, keyPrefix, cadence: daily|weekly|off }`. Credentials stored as company secrets, referenced by id.
- Periodic-notes scheduler now manages 4 timers (weekly + monthly cost rollup, daily + weekly vault snapshot).
- `instanceGeneralSettingsSchema` extended with `notes: { persistRunNotes (default false), persistDecisionNotes (default true) }` section.
- `EntityType` union and `AnyFrontmatter` discriminated union extended with `cost_rollup` entity type.
- `KnowledgePageInput` allows optional explicit `slug` for emitters that need deterministic structured slugs (e.g. cost rollups, decisions, runs).
- `knowledge_pages` now has an `aliases text[]` column (default `'{}'`) for fast slug-alias resolution.
- `knowledge.create/update/revertToRevision` now run wikilink extraction + sync inside the page write transaction; the rebind janitor also runs after create and on slug/aliases changes.
- `agent-memory.ts` write paths (`extractMemoriesFromIssue`, `consolidateMemories`) and `knowledge.ts` write paths (`create`, `update`) now enqueue async embedding jobs after each successful insert/content-change. Tier-3 vector retrieval replaces prior log-and-bail placeholder.

- **Refactored `server/src/services/knowledge-seeds.ts`** — split the
  3,256-LOC pure-data file into 8 domain-grouped modules
  (`knowledge-seeds-operating.ts`, `-strategy.ts`, `-people.ts`,
  `-engineering.ts`, `-agents.ts`, `-compliance.ts`, `-finance.ts`,
  `-sops.ts`) and reduced the original to a 28-LOC aggregator that
  preserves the `getKnowledgeSeeds()` public API + `KnowledgeSeed`
  type export. All 42 seeds + 3 SOP templates moved byte-identical
  (sha256 verified across the full set). Caller `knowledge.ts` is
  unchanged. Closes the last item of the original 30-task audit
  backlog (#18). Pure file split, zero behavior change.
- **Refactored `server/src/routes/agents.ts`** — split the 3,365-LOC,
  61-route monolith into four domain sub-routers composed via
  `Router.use()`: `agent-routes-crud.ts` (33 routes — agent CRUD,
  configuration, revisions, runtime state, instructions, skills, keys,
  prompt versions, adapter models), `agent-routes-lifecycle.ts`
  (13 routes — list/hire/create/team-pack, pause/resume/terminate,
  delete, headcount, org chart) plus the `defaultBudgetCentsForRole`
  helper, `agent-routes-runs.ts` (11 routes — scheduler heartbeats,
  heartbeat runs, live runs, workspace operations, issue runs), and
  `agent-routes-chat.ts` (4 routes — messages, chat, chat/issue,
  feedback). `agents.ts` becomes a 24-LOC orchestrator that preserves
  the `agentRoutes(db)` factory signature so all external callers
  (`app.ts`, three `__tests__/` suites) keep working unchanged. Pure
  file move with route-handler bodies preserved verbatim; zero semantic
  change, zero new dependencies. Per-method+path collision check
  confirms no overlap across the four sub-routers (mount order is
  informational). All 24 tests in `__tests__/agents.test.ts` plus the
  related agent route suites stay green. Approach A from the
  2026-05-07 agents-routes-split design spec.
- **Refactored `server/src/services/heartbeat.ts`** — extracted ~330 LOC of
  module-level helpers into three new sibling files:
  `heartbeat-team-directory.ts` (per-company colleague directory + 5min cache),
  `heartbeat-workspace.ts` (workspace path resolution, session params,
  ledger scope, run task key), and `heartbeat-session-policy.ts` (compaction
  policy, output-token classification, max-token resolution). The
  `heartbeatService(db)` factory closure is unchanged. Pure file move with
  mechanical import rewiring; zero semantic change. `heartbeat.ts` shrinks
  from 3,554 to ~3,255 LOC. External imports keep working via re-export
  shims (`prioritizeProjectWorkspaceCandidatesForRun`,
  `resolveRuntimeSessionParamsForWorkspace`, `parseSessionCompactionPolicy`,
  `ResolvedWorkspaceForRun` are still importable from
  `services/heartbeat.js`). Approach A from the
  2026-05-07 helpers-extraction design spec; Approach B (closure-internal
  split) and C (executeRun split) deferred.

### Removed
- **Plugin system** (full deletion). The plugin extension framework was disabled
  for V1 productization (no plugin routes mounted, no worker processes started)
  and now removed entirely from the codebase. There were no customer plugins
  installed; this is a no-op for end users.
  - Deleted server services: `plugin-registry`, `plugin-event-bus`, `plugin-loader`,
    `plugin-worker-manager`, `plugin-job-coordinator`, `plugin-job-scheduler`,
    `plugin-job-store`, `plugin-lifecycle`, `plugin-tool-registry`,
    `plugin-tool-dispatcher`, `plugin-state-store`, `plugin-secrets-handler`,
    `plugin-host-services`, `plugin-host-service-cleanup`, `plugin-runtime-sandbox`,
    `plugin-stream-bus`, `plugin-log-retention`, `plugin-dev-watcher`,
    `plugin-manifest-validator`, `plugin-config-validator`, `plugin-capability-validator`.
  - Deleted server routes: `routes/plugins`, `routes/plugin-ui-static`.
  - Deleted UI surfaces: `pages/PluginManager`, `pages/PluginSettings`, `pages/PluginPage`,
    `components/plugin-manager/*`, `components/plugin-settings/*`, `plugins/bridge`,
    `plugins/bridge-init`, `plugins/launchers`, `plugins/slots`, `api/plugins`.
    Plugin-extension mount points removed from `Sidebar`, `SidebarProjects`,
    `BreadcrumbBar`, `Dashboard`, `ProjectDetail`, `IssueDetail`,
    `comment-thread/CommentCards`, `useIssueDetailData`, `InstanceSidebar`.
  - Deleted CLI: `cli/commands/client/plugin` (`ironworksai plugin ...` subcommands).
  - Deleted workspace packages: entire `packages/plugins/` tree
    (`@ironworksai/plugin-sdk`, `create-ironworks-plugin`, all
    `plugin-*-example` packages). Removed from `pnpm-workspace.yaml`.
  - Deleted DB schema entries: `plugins`, `plugin_company_settings`, `plugin_config`,
    `plugin_entities`, `plugin_jobs`, `plugin_logs`, `plugin_state`, `plugin_webhooks`.
    A forward-only DROP migration (`0094_drop_plugin_tables.sql`) tears the tables
    down on existing databases; the original CREATE migrations are intentionally
    untouched so historical migration runs on pristine databases still apply
    cleanly.
  - Deleted shared types/validators: `packages/shared/src/types/plugin.ts`,
    `packages/shared/src/validators/plugin.ts`, all `Plugin*` constants/enums in
    `constants.ts`, and the `plugin.ui.updated` / `plugin.worker.crashed` /
    `plugin.worker.restarted` entries from `LIVE_EVENT_TYPES`.
  - Deleted plugin event bus wiring from `services/activity-log.ts`
    (`setPluginEventBus`, `_pluginEventBus`, `PLUGIN_EVENT_SET`).
  - Deleted documentation: `doc/plugins/` (`PLUGIN_SPEC.md`,
    `PLUGIN_AUTHORING_GUIDE.md`, `ideas-from-opencode.md`),
    `docs/phase-i-verification.md`.
- **Plugin-flavored helpers in `services/tool-cache.ts`** (`buildCacheKey`,
  `cacheGet`, `cacheSet`, `PluginToolCacheConfig` import) - their only consumer
  was `plugin-tool-registry`. The first-party / framework helpers
  (`buildFrameworkCacheKey`, `frameworkCacheGet`, `frameworkCacheSet`,
  `FrameworkToolCacheConfig`, `createToolCache`, `ToolCache`, etc.) are
  unchanged - they are still consumed by `heartbeat`, `skill-matching`, and
  `company-skills`.

### Security
- **Email webhook provider signature verification** (`server/src/routes/messaging.ts`,
  `server/src/lib/webhook-signatures.ts`): inbound `/api/webhooks/email` now verifies
  Mailgun (`X-Mailgun-Signature-256`, HMAC-SHA256) and SendGrid
  (`X-Twilio-Email-Event-Webhook-Signature` / `-Timestamp`, Ed25519) when the
  matching env var is set (`MAILGUN_WEBHOOK_SIGNING_KEY`,
  `SENDGRID_WEBHOOK_PUBLIC_KEY`). A valid provider signature satisfies authentication
  without the legacy static `IRONWORKS_EMAIL_WEBHOOK_SECRET` token. Backward compatible:
  deployments with neither env var set behave as before. Boot-time warning logs once
  when signing keys are missing. Pure helpers + 16 unit tests + 4 route integration tests.
- **Routine trigger HMAC enforcement** (`POST /routine-triggers/public/:publicId/fire`):
  reaffirmed — the existing implementation in `server/src/services/routines.ts` already
  enforces HMAC-SHA256 signed-timestamp verification (`signingMode: "hmac_sha256"`) or
  bearer token (`signingMode: "bearer"`) using `crypto.timingSafeEqual` and
  `companySecrets`-backed encrypted secret storage. No schema change needed; the proposed
  inline `hmac_secret TEXT` column was rejected as a regression vs. the existing
  encrypted-secret reference design.
- **Explicit CORS allowlist** (`server/src/lib/cors-config.ts`, wired in `server/src/app.ts`).
  Previously the server inherited Express defaults (effectively allow-all). Now the
  allowlist is driven by `IRONWORKS_ALLOWED_ORIGINS` (comma-separated). Same-origin /
  no-origin requests (curl, server-to-server) always pass. `credentials: true` is set
  for cookie-based session auth. Backward-compatible: when the env var is unset,
  development allows all origins; production reflects the request origin and emits a
  loud startup warning so unconfigured deploys aren't silently broken. Webhook
  signature headers (Mailgun, Twilio/SendGrid, Ironworks) are pre-listed in
  `allowedHeaders`. 12 unit tests in `cors-config.test.ts`.

### Changed
- **`as any` audit in non-test source code; `noExplicitAny` elevated to `error`**
  (`biome.json`, `ui/src/pages/Routines.tsx`). Audited the 28 non-test `as any`
  instances. Tightened: 5 in `ui/src/pages/Routines.tsx` (`agentById`/`projectById`
  casts) eliminated by projecting full Agent/Project rows into the narrow
  `{id, name, icon?|color?}` Map-value shape the child components declare; this
  removes the casts at every call site rather than annotating each one. Kept +
  re-annotated: 2 in `Routines.tsx` for the `routines` prop where
  `RoutineListItem.triggers[].nextRunAt` is typed `Date | null` but arrives as
  `string | null` post-JSON-serialization (real type mismatch, fixing it requires
  touching the shared types layer — out of scope). Kept (already annotated): 10
  in `server/src/index.ts` (Db type doesn't unify across service overloads),
  7 in `server/src/middleware/logger.ts` (custom Express Response props),
  2 in `server/src/middleware/error-handler.ts` (same), 2 in
  `server/src/routes/channels.ts` (Drizzle Db overloads + WakeupOptions
  cross-shape bridge). All 23 surviving non-test `as any` carry a
  `// biome-ignore lint/suspicious/noExplicitAny: <reason>` line. Elevated
  `linter.rules.suspicious.noExplicitAny` from `warn` to `error` repo-wide,
  with a test-file override (`**/*.test.ts`, `**/*.test.tsx`, `**/__tests__/**`,
  `**/test/**`, `**/tests/**`) that drops it back to `warn` so the cheap-mock
  pattern in tests stays unblocked and existing biome-ignore comments in tests
  remain valid suppressions. Net effect: a new `as any` in production code now
  fails CI; tests are unaffected.
- **Release smoke now gates the canary channel** (`.github/workflows/release.yml`).
  Previously `release-smoke.yml` was workflow_dispatch only and ran post-facto
  against an already-published canary, with no automated rollback. The release
  workflow now (a) captures the prior `canary` dist-tag before publishing,
  (b) calls `release-smoke.yml` as a `workflow_call` reusable workflow against
  the just-published canary, and (c) on smoke failure, runs a
  `rollback_canary_on_smoke_failure` job that repoints every public package's
  `canary` dist-tag back to the prior version (mirroring
  `scripts/rollback-latest.sh`'s logic for the `latest` channel). The git
  canary tag stays intact, but consumers running `npx ironworksai@canary` are
  protected from a broken build, and the workflow exits non-zero so red CI
  blocks human promotion to stable.
- Documented `@deprecated` symbols with explicit migration paths and removal-blocker
  rationale (no behavior change). Audited candidates:
  - `RunDatabaseBackupOptions.retentionDays` (`packages/db/src/backup-lib.ts`) - KEPT,
    backward-compat for on-disk `ironworks.config.json` files. Removal scheduled for
    next major version (config migration required).
  - `databaseBackupConfigSchema.retentionDays` (`packages/shared/src/config-schema.ts`)
    - KEPT, same reason.
  - `BOOTSTRAP_PROMPT_KEY` / `bootstrapPromptTemplate`
    (`server/src/services/agent-instructions.ts`) - KEPT, six adapters
    (claude/codex/cursor/gemini/opencode/pi) still read it as a legacy fallback for
    bootstrap prompts on resumed sessions. Removal blocked until adapter cleanup.
  - `Project.goalId` type + `projectFields.goalId` schema
    (`packages/shared/src/types/project.ts`, `packages/shared/src/validators/project.ts`)
    - KEPT, legacy `projects.goalId` DB column still written by `services/projects.ts`
    for single-goal back-compat (UI ClientPortal + older REST consumers).
  Follow-up tickets recommended for: (1) config-file migration tool to drop
  `retentionDays`, (2) drop `bootstrapPromptTemplate` from all adapters once managed
  bundles are universal, (3) drop `projects.goalId` DB column once all callers use
  `goalIds`.

### Added - HTTP Adapter Family (2026-04-20)
- **Four production HTTP adapters**: `poe-api`, `anthropic-api`, `openai-api`,
  `openrouter-api`. Agents can now call external LLM APIs without a local CLI installed.
- **Shared HTTP substrate** in `packages/adapter-utils/src/http/` (16 modules, 314 tests)
  covering retry with exponential backoff, per-provider rate limiting, SSE/chunked-JSON
  streaming, bidirectional tool-call normalization (AJV), full-transcript session replay,
  and schema-aware secret redaction.
- **Workspace provider secrets**: `workspace_provider_secrets` table (migration 0085),
  AES-256-GCM envelope encryption (`secrets-vault`), workspace-scoped REST API
  (`/providers`), and Settings - Providers UI. Keys are never echoed; last-4 displayed only.
- **Per-adapter test suites**: Poe 46, Anthropic 64, OpenAI 56, OpenRouter 43 tests.
  Workspace total: 1,599+ tests across 209 files.
- **Security mitigations**: R3 tool-call format divergence (AJV normalization), R16
  duplicate tool execution on retry (structural flag guard), R17 stateless HTTP sessions
  (full-transcript replay), R20 regex redaction misses JSON (schema-aware path redactor).
- **Integration smoke harness** (`scripts/test-integration-http-adapters.ts`) for live
  end-to-end validation against real provider APIs.
- **Documentation**: `docs/HTTP-ADAPTER-FAMILY.md` (architecture), `docs/LICENSES.md`
  (dependency analysis), `docs/DEFERRED-MIGRATIONS.md` (roadmap),
  `docs/adapters/provider-settings.md` (user key guide),
  `docs/porting-to-upstream.md` (portability manifest), per-adapter READMEs.
- **New environment variables**: `IRONWORKS_SECRETS_KEK_B64` (required),
  `{PROVIDER}_API_KEY` (optional fallback), `{PROVIDER}_RATE_LIMIT_PER_MIN` (optional),
  `ADAPTER_DISABLE_{PROVIDER}` (kill-switch).

### Added
- Dashboard improvements: Mission Control alignment (StatusBar, QuickActionsGrid, TwoPaneLayout, PageTabBar actions)
- Component-first architecture: 7 oversized files decomposed, barrel exports, shared types directory
- React.memo on 7 list/card components, loading state fix on 14 pages
- Biome linter configuration
- Vitest coverage configuration with v8 provider
- E2E tests triggered on pull requests
- OG metadata and meta description

### Changed
- Tabs default to line variant with primary-colored accent border
- Card component gains accentColor and fadeOverflow props
- Dashboard section titles now link to their full pages
- LICENSE copyright updated to Steel Motion LLC

### Security
- Path traversal prevention on file-serving routes
- SSRF protection extended with IPv6 private ranges
- Timing-safe token comparison in board-claim
- Prompt injection patterns expanded from 5 to 16
- Dependency overrides for rollup, kysely, vite, lodash-es CVEs

### Fixed
- 9 icon-only buttons missing aria-labels
- docs.json GitHub links pointed to wrong org

## [0.3.1] - 2026-04-08

### Added
- @mention agent-to-agent waking + board user icon
- Agent chat architecture with Response Router
- Channel message posting from heartbeat runs
- AI-native governance seed docs (30 templates)
- Nolan integration (12 requirements)
- Deliverables workflow, threads, session handling, decision log

### Changed
- Heartbeat interval configurable, default 30s
- Diversified model assignments with automatic fallback
- Agents conversational when no issues assigned

### Security
- 107 tests for security-critical code paths
- WCAG 2.1 AA compliance (16 violations fixed)
- Rate limit increased to 600/min, heartbeat paths exempt

### Fixed
- Channel extraction and response formatting
- Docker build ordering (db+shared before server)
- Sidebar scroll, panel clipping
- Billing subscription 404 console noise
