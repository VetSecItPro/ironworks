# Porting to Upstream (paperclipai/paperclip)

This document is a portability manifest for contributing the HTTP adapter family back to
the upstream `paperclipai/paperclip` project. It covers what changed, what is safe to
propose as a PR, and what should stay in this fork.

---

## Upstream safety assessment

All code additions in this branch are upstream-safe. No business-specific logic was
introduced in package source files. A grep confirms zero occurrences of Atlas-specific
identifiers in `packages/`, `server/src/`, or `ui/src/`:

```
Atlas, Ikram, Anouar, vetsecitpro, atlas-ops, atlasops, useapex, command.useapex.io
```

The one reference in `docs/LICENSES.md` is a BYOK deployment example that can be
genericized before submitting upstream.

---

## Files added

### `packages/adapter-utils/src/http/`
Shared HTTP substrate used by all four HTTP adapters. 16 modules + tests (314 tests):
- `client.ts` - base fetch wrapper with retry + timeout
- `retry.ts` - exponential backoff; structural `toolCallFlag` guard (R16)
- `redaction.ts` - schema-aware JSON path redactor (R20)
- `tool-normalize.ts` - AJV-validated bidirectional tool-call normalization (R3)
- `session-replay.ts` - full-transcript replay for stateless HTTP sessions (R17)
- `streaming.ts` - SSE and chunked-JSON stream parsers
- `rate-limiter.ts` - token-bucket per-provider rate limiting
- `error-classifier.ts` - maps provider HTTP errors to IronWorks error types
- `headers.ts` - shared header builders (auth, content-type, user-agent)
- `pagination.ts` - cursor and page-based pagination helpers
- `response-parser.ts` - provider-agnostic response normalization
- `tool-call-assembler.ts` - reassembles streamed tool-call fragments
- `usage-tracker.ts` - prompt/completion token accounting
- `model-list.ts` - cacheable model-list fetcher
- `backpressure.ts` - stream backpressure control
- `index.ts` - barrel export

### `packages/adapters/poe-api/`
Poe HTTP adapter. 46 tests. Handles Poe's token-based protocol, tool-call translation,
and message-thread continuity.

### `packages/adapters/anthropic-api/`
Anthropic Messages API adapter. 64 tests. Native tool_use blocks, streaming deltas,
system-prompt injection, and vision pass-through.

### `packages/adapters/openai-api/`
OpenAI Chat Completions adapter. 56 tests. Covers parallel tool calls, streaming
function_call vs tool_calls dual-format, and o-series reasoning models.

### `packages/adapters/openrouter-api/`
OpenRouter adapter. 43 tests. Wraps OpenAI-compatible API with model-string routing,
provider preference headers, and cost-per-token tracking.

### `packages/db/src/migrations/0085_workspace_provider_secrets.sql`
Schema migration adding `workspace_provider_secrets` table. Uses `company_memberships`
for FK (IronWorks convention - same in upstream). No adaptation needed.

### `packages/db/src/` (Drizzle schema)
`workspace-provider-secrets.ts` - Drizzle table definition and query helpers.

### `server/src/services/secrets-vault.ts`
AES-256-GCM envelope encryption service. KEK -> DEK -> ciphertext model. Never logs
plaintext. Exposes `seal` / `unseal` only.

### `server/src/services/provider-secret-resolver.ts`
Resolver that checks workspace DB row first, falls back to env var, errors cleanly on
miss. Called by `resolveAdapterConfigForRuntime`.

### `server/src/routes/providers.ts`
REST API for workspace provider secrets: `GET /providers`, `POST /providers`,
`DELETE /providers/:provider`, `POST /providers/:provider/test`.

### `ui/src/components/AdapterPicker/`
Provider picker component with official brand logos and key-prefix hints.

### `ui/src/components/AgentConfig/adapters/`
Per-adapter config forms (Poe, Anthropic, OpenAI, OpenRouter). Each form shows only
the fields relevant to its provider.

### `ui/src/pages/Settings/Providers.tsx`
Settings UI for workspace provider keys. Role-gated (owner/operator write, viewer
read-only). Shows last-4 of saved keys; includes one-click connection test.

### `scripts/test-integration-http-adapters.ts`
Real-API smoke harness. Requires live keys in env. Documents expected pass/fail
patterns per provider. Not part of `pnpm test` (manual run only).

### Documentation
- `docs/HTTP-ADAPTER-FAMILY.md` - architectural overview
- `docs/LICENSES.md` - license analysis for all new deps
- `docs/DEFERRED-MIGRATIONS.md` - deferred-item roadmap
- `docs/testing/integration-tests.md` - integration harness guide
- `docs/phase-i-verification.md` - quality-gate results
- `docs/adapters/provider-settings.md` - user-facing key configuration guide (this PR)
- `docs/porting-to-upstream.md` - this file
- `packages/adapters/{poe,anthropic,openai,openrouter}-api/README.md` - per-adapter READMEs

---

## Files modified

| File | Change |
|---|---|
| `packages/shared/src/constants.ts` | Added 4 HTTP adapter types to `AGENT_ADAPTER_TYPES` |
| `packages/shared/src/types/adapter.ts` | Added `"system-prompt-injected"` to `AdapterSkillSyncMode` |
| `server/src/adapters/registry.ts` | Registered 4 new adapters |
| `server/src/services/secrets.ts` | `resolveAdapterConfigForRuntime` wired to new resolver |
| `server/src/app.ts` | Mounted `/providers` routes |
| `ui/src/App.tsx` | Registered `/settings/providers` route |
| `ui/src/components/agent-config/AdapterSection.tsx` | HTTP adapter types in picker |
| `ui/src/components/agent-config/AdapterTypeDropdown.tsx` | HTTP adapter options in dropdown |
| `ui/src/components/agent-config/help-text.ts` | Help text for HTTP adapter types |
| `biome.json` | CSS Tailwind directives, email-template HTML exclusion, `noConfusingVoidType` fix mode |
| `vitest.config.ts` | 4 new project entries (one per HTTP adapter) |
| `package.json` files (workspace) | ~200 patch + minor dep bumps |

---

## New dependencies

All new runtime dependencies carry permissive licenses. Full analysis in `docs/LICENSES.md`.

| Package | License | Purpose |
|---|---|---|
| `undici` | MIT | HTTP/2 transport; replaces bare `fetch` for streaming reliability |
| `ajv` | MIT | JSON Schema validation for tool-call normalization |
| `ajv-formats` | MIT | Date, URI, email formats for AJV |
| `picocolors` | ISC | CLI output coloring in the integration smoke harness |

All other dependencies (`zod`, `drizzle-orm`, `@anthropic-ai/sdk`, etc.) were already
present in the workspace.

---

## New environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `IRONWORKS_SECRETS_KEK_B64` | Yes | - | 32-byte base64 KEK for envelope encryption. Generate: `openssl rand -base64 32` |
| `ANTHROPIC_API_KEY` | No | - | Fallback Anthropic key for CI/CD; workspace DB takes precedence |
| `OPENAI_API_KEY` | No | - | Fallback OpenAI key |
| `OPENROUTER_API_KEY` | No | - | Fallback OpenRouter key |
| `POE_API_KEY` | No | - | Fallback Poe key |
| `ANTHROPIC_RATE_LIMIT_PER_MIN` | No | 60 | Self-throttle before hitting provider ceiling |
| `OPENAI_RATE_LIMIT_PER_MIN` | No | 60 | |
| `OPENROUTER_RATE_LIMIT_PER_MIN` | No | 60 | |
| `POE_RATE_LIMIT_PER_MIN` | No | 60 | |
| `ADAPTER_DISABLE_ANTHROPIC` | No | - | Set to `1` to kill-switch the adapter platform-wide |
| `ADAPTER_DISABLE_OPENAI` | No | - | |
| `ADAPTER_DISABLE_OPENROUTER` | No | - | |
| `ADAPTER_DISABLE_POE` | No | - | |

---

## Migration path for existing CLI-adapter users

No breaking changes. CLI adapters (`claude-local`, `codex-local`, `cursor-local`,
`gemini-local`, `hermes-local`, `opencode-local`, `pi-local`, `openclaw-gateway`) are
untouched. HTTP adapters are purely additive. Existing agents continue working without
configuration changes.

To adopt HTTP adapters: open an agent's config, change the **Adapter** dropdown to the
desired HTTP adapter type (e.g. `anthropic-api`), then confirm a key is saved under
**Settings -> Providers** for that provider.

---

## Security highlights

Four security risks identified during MDMP planning were addressed in this PR:

| Risk | Mitigation |
|---|---|
| R3 - Tool-call format divergence between providers | AJV-validated bidirectional normalization in `tool-normalize.ts`. All tool-call objects are validated against a shared JSON Schema before dispatch and after receipt. |
| R16 - Duplicate tool execution via retry | Structural `toolCallFlag` guard in `retry.ts`. The flag is checked at the top of the catch block, before retryability is evaluated. A tool-call response is never retried. |
| R17 - Stateless HTTP vs native CLI session | Full-transcript replay via `session-replay.ts`. The complete message history is re-sent on each HTTP turn, preserving conversational context across stateless calls. |
| R20 - Regex redaction misses JSON | Schema-aware JSON path redactor in `redaction.ts`. Sensitive fields are identified by path pattern, not by value regex, so structured JSON is correctly scrubbed. |

Provider secrets use AES-256-GCM envelope encryption: the server's KEK encrypts a
per-row DEK; the DEK encrypts the API key ciphertext. The raw key is never logged, never
echoed in API responses, and never returned after the initial save - only the last-4
characters are surfaced in the UI.

---

## Test coverage summary

- Workspace total: **1,599+ tests across 209 files**
- HTTP adapter substrate (`adapter-utils/http`): **314 tests**
- Per-adapter: Poe 46, Anthropic 64, OpenAI 56, OpenRouter 43
- Lint: **0 severity:error** violations (Biome)
- Typecheck: **clean** (tsc --noEmit)

---

## Atlas-only artifacts (NOT in this PR)

The following files live in the `03.atlas-ops` repo or in local `.claude/` memory and
are not part of this PR:

| File | Location | Reason excluded |
|---|---|---|
| `atlasops-ironworks.md`, `atlasops-journey.md`, `atlas-fleet.md` | `03.atlas-ops` repo | Atlas business context |
| `memory/*.md` | Local `.claude/projects/*/memory/` | User's Claude Code session memory |
| `.mdmp/*` | Local `.claude/worktrees/*/` | MDMP planning orders |

---

## Upstream notes for PR submission

1. **Genericize `docs/LICENSES.md`** - remove the `command.useapex.io` deployment
   example and replace with a generic `your-domain.example.com` placeholder.
2. **Migration 0085** uses `company_memberships` (IronWorks/upstream convention). No
   adaptation needed - upstream already has this table.
3. **`IRONWORKS_SECRETS_KEK_B64`** name is IronWorks-specific. Upstream may prefer a
   namespace-neutral name like `SECRETS_KEK_B64`. Coordinate with upstream maintainers.
4. **Brand logos** in `AdapterPicker` are sourced from provider CDNs. Verify upstream's
   asset policy before merging.
5. **No Atlas branding** is present in any package source file. The grep is clean.
