# Changelog

All notable changes to IronWorks are documented in this file.

## [Unreleased]

### Added
- **Anthropic context compaction in claude-local** (`packages/adapters/claude-local/src/server/execute.ts`).
  The Claude CLI's `--betas <name>` flag (v2.1.132+) now passes through `compact-2026-01-12`
  to the Anthropic API for API-key authenticated runs (`ANTHROPIC_API_KEY` set).
  Subscription/OAuth runs are unchanged — Anthropic restricts beta-header passthrough
  to API-key auth, so subscription users continue to rely on the CLI's internal
  session management. Wired via new pure helper `buildCompactionArgs(enabled, billingType)`
  with 8 unit tests in `execute.test.ts`. Prompt-cache breakpoints (line-69 TODO) are
  still blocked — Claude CLI doesn't yet expose a `--cache-control` / `--cache-breakpoints`
  flag.

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
