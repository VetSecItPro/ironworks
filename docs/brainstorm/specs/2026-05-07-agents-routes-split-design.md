# Design Spec: server/src/routes/agents.ts — Domain Split

**Date:** 2026-05-07
**Approach:** Orchestrator pattern — 4 domain-specific sub-routers + thin parent. Mechanical move with re-export shim.
**Status:** AWAITING APPROVAL (user pre-authorized)

---

## Problem

`server/src/routes/agents.ts` is **3,365 LOC with 61 routes** spanning 9 distinct domains. The audit (task #15) suggested a 3-way split (`agent-crud / agent-employment / agent-memory`), but reality is more textured — there are no agent-memory routes in this file at all (memory routes live in `routes/memory.ts` if anywhere). The actual route distribution by domain:

| Domain | Routes | Examples |
|---|---|---|
| Agent CRUD + identity + config | ~13 | `/agents/:id`, `/agents/me`, `/agents/:id/configuration`, `/agents/:id/runtime-state`, `/agents/:id/inbox-lite` |
| Agent instructions / skills / keys / login | ~13 | `/agents/:id/instructions-bundle*`, `/agents/:id/skills*`, `/agents/:id/keys*`, `/agents/:id/claude-login`, `/agents/:agentId/prompt-versions*` |
| Agent wakeup / heartbeat invocation | ~2 | `/agents/:id/wakeup`, `/agents/:id/heartbeat/invoke` |
| Lifecycle: hire / pause / resume / terminate | ~9 | `/companies/:companyId/agent-hires`, `/companies/:companyId/agents/team-pack`, `/agents/:id/{pause,resume,terminate}`, `/agents/:id` (DELETE), `/companies/:companyId/agents/headcount` |
| Heartbeat run history | ~10 | `/companies/:companyId/heartbeat-runs`, `/heartbeat-runs/:runId/*`, `/issues/:issueId/{live-runs,active-run}`, `/instance/scheduler-heartbeats` |
| Agent chat / messaging / feedback | ~5 | `/companies/:companyId/agents/:agentId/{messages,chat,chat/issue,feedback}` |
| Org chart | ~3 | `/companies/:companyId/org{,.svg,.png}` |
| Other (adapters/models passthrough) | ~1 | `/companies/:companyId/adapters/:type/models` |
| Permissions | ~2 | `/agents/:id/permissions`, `/agents/:id/onboarding-metrics` |

61 routes / 3,365 LOC means average ~55 LOC per route, but the heavy ones (hire, team-pack, instructions-bundle handlers) are 200+ LOC each. The file is unnavigable.

This spec splits agents.ts into **4 domain sub-routers** mounted by a thin orchestrator that preserves the `agentRoutes(db)` external API.

## Goal

After this PR:
- `routes/agents.ts` becomes a ~50 LOC **orchestrator** that imports 4 sub-routers and mounts them under one `Router()`.
- 4 new files own clear domain slices, each navigable in a single screenful of search/scroll.
- All existing tests pass unchanged. `routes/agents.ts` still exports `agentRoutes(db: Db)` with the same Router contract.
- Net behavior change: zero. Pure file move + Express router composition.

## Non-Goals

- NOT changing route paths, status codes, request/response shapes, or auth/authz behavior.
- NOT extracting business logic into services (it mostly already lives in services; this PR moves the *route handler glue*, not the underlying logic).
- NOT splitting `routes/issues.ts` or `routes/access.ts` — those are separate audit tasks (#16, #17) with their own brainstorms required.
- NOT introducing a new routing framework (no Zod-router, no tRPC, no decorators).

## Approach

Use Express's natural `Router.use()` composition. Each new file exports a factory `<domain>Routes(db: Db, deps?: ...)` returning a `Router` configured with that domain's routes. The parent `agents.ts` becomes:

```ts
export function agentRoutes(db: Db): Router {
  const router = Router();
  router.use(agentCrudRoutes(db));
  router.use(agentLifecycleRoutes(db));
  router.use(agentRunsRoutes(db));
  router.use(agentChatRoutes(db));
  return router;
}
```

`app.ts` continues to mount `agentRoutes(db)` at the same prefix it does today. No external caller changes.

Shared helpers (e.g., `defaultBudgetCentsForRole`, validation helpers, common imports) move into a new `routes/agent-route-helpers.ts` if used by more than one sub-router; if only one sub-router uses a helper, it stays inside that file.

### File 1: `server/src/routes/agent-route-helpers.ts` (NEW, ~80 LOC)

Cross-cutting helpers shared by ≥2 sub-routers:
- `defaultBudgetCentsForRole(role)` (currently top-level in agents.ts:110)
- Any helper inside `agentRoutes()` that's used in multiple route domains (audit during implementation; if everything is single-domain, this file is omitted)
- Common Zod schemas if duplicated

### File 2: `server/src/routes/agent-routes-crud.ts` (NEW, ~1,700 LOC)

Owns the bulk of agent-record management (read/write of agent identity + config + capabilities):

**Identity / read accessors (4):**
- `GET /agents/me`
- `GET /agents/me/inbox-lite`
- `GET /agents/:id/inbox-lite`
- `GET /agents/:id`

**Configuration (5):**
- `GET /agents/:id/configuration`
- `PATCH /agents/:id` (update agent fields incl. config)
- `GET /agents/:id/config-revisions`
- `GET /agents/:id/config-revisions/:revisionId`
- `POST /agents/:id/config-revisions/:revisionId/rollback`
- `GET /companies/:companyId/agent-configurations`
- `POST /companies/:companyId/adapters/:type/models` (model availability — adapter-config-related)

**Runtime state (3):**
- `GET /agents/:id/runtime-state`
- `GET /agents/:id/onboarding-metrics`
- `GET /agents/:id/task-sessions`
- `POST /agents/:id/runtime-state/reset-session`

**Permissions (1):**
- `GET /agents/:id/permissions`

**Instructions bundle (6 — including 4 sub-routes):**
- `GET /agents/:id/instructions-path`
- `GET /agents/:id/instructions-bundle`
- `POST /agents/:id/instructions-bundle`
- `POST /agents/:id/instructions-bundle/file` (upload)
- `PATCH /agents/:id/instructions-bundle/file` (update)
- `DELETE /agents/:id/instructions-bundle/file`

**Skills (2):**
- `GET /agents/:id/skills`
- `POST /agents/:id/skills/sync`

**Keys + login (4):**
- `GET /agents/:id/keys`
- `POST /agents/:id/keys`
- `DELETE /agents/:id/keys/:keyId`
- `POST /agents/:id/claude-login`

**Wakeup / heartbeat invocation (2):**
- `POST /agents/:id/wakeup`
- `POST /agents/:id/heartbeat/invoke`

**Prompt versioning (2):**
- `GET /agents/:agentId/prompt-versions`
- `POST /agents/:agentId/prompt-versions/:version/rollback`

Total: ~30 routes.

### File 3: `server/src/routes/agent-routes-lifecycle.ts` (NEW, ~700 LOC)

Owns hire, pause, resume, terminate, listing — the **employment-status** verbs:

- `GET /companies/:companyId/agents` (list)
- `POST /companies/:companyId/agent-hires` (hire/onboard)
- `POST /companies/:companyId/agents` (create — bulk)
- `POST /companies/:companyId/agents/team-pack` (preset team hire)
- `POST /agents/:id/pause`
- `POST /agents/:id/resume`
- `POST /agents/:id/terminate`
- `DELETE /agents/:id`
- `POST /companies/:companyId/agents/:agentId/terminate`
- `GET /companies/:companyId/agents/headcount`
- `GET /companies/:companyId/org`
- `GET /companies/:companyId/org.svg`
- `GET /companies/:companyId/org.png`

Total: ~13 routes (org chart endpoints fold here since they render the active-roster snapshot — same conceptual domain).

### File 4: `server/src/routes/agent-routes-runs.ts` (NEW, ~500 LOC)

Owns run/heartbeat history — these aren't really "agent record" management, they're **execution history**:

- `GET /instance/scheduler-heartbeats`
- `GET /companies/:companyId/heartbeat-runs`
- `GET /companies/:companyId/live-runs`
- `GET /heartbeat-runs/:runId`
- `POST /heartbeat-runs/:runId/cancel`
- `GET /heartbeat-runs/:runId/events`
- `GET /heartbeat-runs/:runId/log`
- `GET /heartbeat-runs/:runId/workspace-operations`
- `GET /workspace-operations/:operationId/log`
- `GET /issues/:issueId/live-runs`
- `GET /issues/:issueId/active-run`

Total: ~11 routes.

### File 5: `server/src/routes/agent-routes-chat.ts` (NEW, ~250 LOC)

Owns ongoing agent communication:

- `POST /companies/:companyId/agents/:agentId/messages`
- `GET /companies/:companyId/agents/:agentId/chat`
- `POST /companies/:companyId/agents/:agentId/chat/issue`
- `POST /companies/:companyId/agents/:agentId/feedback`

Total: ~5 routes.

### File 6: `server/src/routes/agents.ts` (MODIFIED — orchestrator)

After the refactor:
- ~50 LOC.
- Imports: 4 new sub-router factories.
- Body: `Router()` + 4 `router.use(...)` calls.
- Exports: `agentRoutes(db: Db)` (unchanged signature).
- May re-export the shared helpers file's contents for back-compat IF anything outside this directory imports them (audit during implementation; almost certainly none).

## Architecture

### Components to Create

| Component | Path | Purpose |
|---|---|---|
| `agent-route-helpers.ts` | `server/src/routes/` | Cross-domain helpers (defaultBudgetCentsForRole + any shared validators) |
| `agent-routes-crud.ts` | `server/src/routes/` | Read/write agent records, config, instructions, skills, keys, wakeup, prompt versions |
| `agent-routes-lifecycle.ts` | `server/src/routes/` | Hire/pause/resume/terminate/list/headcount + org chart |
| `agent-routes-runs.ts` | `server/src/routes/` | Heartbeat run history, live runs, scheduler |
| `agent-routes-chat.ts` | `server/src/routes/` | Messages, chat, feedback |

### Components to Modify

| File | Change | Why |
|---|---|---|
| `server/src/routes/agents.ts` | Strip 3,300 LOC of route bodies; replace with 4 `router.use()` calls | Becomes orchestrator |
| `server/src/app.ts` | No change | Still imports `agentRoutes` from `services/routes/agents.js`; the export shape is preserved |

## Edge Cases

| Case | Behavior |
|---|---|
| Two sub-routers register the same path with different methods | Express handles cleanly — `router.use()` mounts in order; each sub-router only declares routes it owns. Verified by counting endpoint occurrences during implementation. |
| Imports duplicated across sub-routers (same Zod schema, same Db tables) | Each file imports what it uses. Some duplication is fine; bundler trees-shakes if needed. The audit-PR for "consolidate duplicate imports" is separate. |
| `agent-route-helpers.ts` ends up empty | Drop it. Helpers stay inline in their single-domain file. |
| External caller imports a function-level helper directly from `routes/agents.js` (not the route handler) | Verify via `rg "from .*routes/agents"` — currently no such usage. If found during impl, add a re-export shim. |
| Route ordering matters (Express matches first-registered) | All routes have unique path+method combos. No ordering hazard. Test suite covers conflicting-route regressions. |
| Test files import internal helpers | Audit via grep. Existing tests use supertest+mock; they hit the public Router only. Verified by sampling `__tests__/agents.test.ts` (24 tests, all use `app.use("/", agentRoutes(db))` pattern). |

## Constraints

- No semantic change anywhere. Function bodies move verbatim.
- No `as any`, no `@ts-ignore`.
- No new dependencies.
- Imports use `.js` extension (ESM convention).
- Each sub-router's imports are minimal — only what that file's code uses.
- Each sub-router exports `<domain>Routes(db: Db, ...deps): Router` factory matching the existing pattern.
- Test count delta: 0 (no new tests required for a pure file move).

## Testing Strategy

- Existing `server/src/__tests__/agents.test.ts` (24 tests, supertest+mock) hits the composed Router via `app.use("/", agentRoutes(db))` — no changes needed; tests pass unchanged.
- Run `pnpm --filter @ironworksai/server test` and confirm green.
- Run `pnpm -r typecheck` and `pnpm -r build` to confirm no broken imports.
- No new unit tests required for this refactor — function bodies are unchanged.

## Rollout

- Single PR. No feature flag needed (pure refactor + Router composition).
- Migration: none.
- Risk: LOW-MEDIUM. The closure-style sub-routers preserve scope, but Express's `router.use()` mount order matters if any two routes overlap. Audit during implementation: confirm no path+method collisions across sub-routers.
- Verify before merge: 24/24 agents.test.ts pass; full server suite green; build green.

## Out of Scope (Revisit Later)

- Same audit-driven splits for `routes/issues.ts` (#7) and `routes/access.ts` (#16). Separate brainstorms.
- Extracting cross-route business logic into services (already mostly factored — most route handlers are thin glue calling `agentService.*`).
- Adding new tests beyond what already exists.
- Renaming the `agentRoutes` symbol or changing its signature — back-compat is sacred.

## Open Questions

None — design is concrete.

---

## Implementation Handoff

Ready for `/subagent-dev docs/brainstorm/specs/2026-05-07-agents-routes-split-design.md`.

Estimated effort: ~3-4 hours of careful per-route migration + import rewiring + test verification. Single PR. Risk: LOW-MEDIUM — pure file move with Router composition; verify via `git diff master...HEAD -- server/src/routes/agents.ts` that the orchestrator is the only modification site, and via test suite that no route silently moved or dropped.

After ship: `routes/agents.ts` is ~50 LOC. The natural follow-up is the same treatment for `routes/issues.ts` (audit task #7 closed by tests-only PR; this would be the "split" half) and `routes/access.ts` (#16). Backlog task #15 closes with this PR.
