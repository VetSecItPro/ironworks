# Changelog

All notable changes to IronWorks are documented in this file.

## [Unreleased]

### Added
- **Email verification step in onboarding** (`server/src/auth/better-auth.ts`,
  `server/src/services/email.ts`, `server/src/middleware/auth.ts`,
  `server/src/routes/authz.ts`, `server/src/routes/companies.ts`,
  `server/src/app.ts`, `ui/src/components/EmailVerificationBanner.tsx`).
  Password+email signups are now sent through better-auth's email verification
  flow (`emailVerification.sendOnSignUp: true`, 24h expiry, auto-sign-in on
  verify). Until the user clicks the verification link, `POST /api/companies`
  and `POST /api/companies/onboard` return `403` with
  `{ details: { code: "email_verification_required" } }`, blocking the
  identity-spoof signup path where a bad actor could create an account
  using someone else's email and immediately spin up a company. The actor
  middleware now reads `emailVerified` off the user row on every session-
  backed request so the gate cannot be bypassed by a stale session cookie.
  `local_implicit` (loopback dev mode), agent JWTs, and board API keys are
  permissively `undefined` and bypass the gate as before. A new endpoint
  `POST /api/auth/resend-verification` (alias of better-auth's
  `/send-verification-email`, rate-limited to 3/hour per IP+email) lets the
  UI banner re-issue the mail. Existing user rows keep their current
  `emailVerified` value (no migration churn). The default email transport
  is `console` (logs the verification URL via the structured logger) so
  dev/local works out of the box; production deploys configure a real
  transport via `setEmailService()` once a provider integration is wired
  in. UI: a new `EmailVerificationBanner` component shows on the Dashboard
  and on the onboarding wizard's Launch step for unverified users, with a
  Resend button that auto-throttles client-side. Tests: +4 (3 in
  `email-verification-gate.test.ts` covering the assert helper +
  permissive paths, +1 in `companies-onboard-route.test.ts` covering the
  onboard 403 + no-row-side-effect contract). New env var:
  `IRONWORKS_EMAIL_TRANSPORT` (reserved; current implementation only honors
  the default `console` transport — provider transports are a follow-up).
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
