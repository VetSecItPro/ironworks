# Design Spec: server/src/routes/access.ts — Domain Split

**Date:** 2026-05-07
**Approach:** Same Approach-A pattern as PR #178 (heartbeat) and PR #179 (agents) — orchestrator + 5 domain sub-routers + shared helpers context module.
**Status:** APPROVED (user pre-authorized via repeated pattern)

---

## Problem

`server/src/routes/access.ts` is **2,722 LOC across 37 routes** spanning 9 distinct domains: board-claim, cli-auth, skills, agent invites, user invites, join-requests, members, admin, and self (`/me/access`). The file is unnavigable — average ~73 LOC per route is heavy because handlers do meaningful work (token hashing, magic-link generation, role mutation), not thin glue.

The factory signature `accessRoutes(db, opts)` takes 4 deployment-mode parameters that are used inside multiple route handlers. ~10 module-level helpers (`hashToken`, `createInviteToken`, `tokenHashesMatch`, `requestBaseUrl`, `buildCliAuthApprovalPath`, `readSkillMarkdown`, `resolveIronworksSkillsDir`, `parseSkillFrontmatter`, `listAvailableSkills`, `companyInviteExpiresAt`) are used across multiple route domains. The closure also instantiates 3 service singletons (`accessService`, `boardAuthService`, `agentService`) and a closure-scoped `assertInstanceAdmin` predicate, all shared across handlers.

This spec applies the proven pattern from heartbeat/agents: extract a context-building helper module + split routes into 5 domain-specific sub-routers + collapse `access.ts` into a thin orchestrator.

## Goal

After this PR:
- `routes/access.ts` becomes a ~30 LOC orchestrator that imports 5 sub-routers and mounts them via `router.use()`.
- 5 new files own clear domain slices, each navigable in a single screenful.
- 1 new helpers module (`access-route-helpers.ts`) exports `buildAccessRouteContext(db, opts)` returning the shared service instances + helpers + the `assertInstanceAdmin` predicate.
- All existing tests pass unchanged. `routes/access.ts` still exports `accessRoutes(db, opts)` with identical signature.
- Net behavior change: zero. Pure file move + Express router composition.

## Non-Goals

- NOT changing route paths, status codes, request/response shapes, auth/authz behavior, or token hashing logic.
- NOT extracting business logic into services (most route handlers already call `accessService.*`, `boardAuthService.*`).
- NOT touching `routes/issues.ts`, `routes/agents.ts` (already done in #179), or `routes/companies.ts`.
- NOT renaming the `accessRoutes` symbol or changing its signature.

## Approach

Same as PR #179 (agents.ts split):

```ts
// access.ts — orchestrator
export function accessRoutes(db: Db, opts: AccessRoutesOpts): Router {
  const router = Router();
  const ctx = buildAccessRouteContext(db, opts);
  router.use(accessBoardClaimRoutes(ctx));
  router.use(accessCliAuthRoutes(ctx));
  router.use(accessSkillsRoutes(ctx));
  router.use(accessInvitesRoutes(ctx));
  router.use(accessMembershipRoutes(ctx));
  return router;
}
```

Each sub-router takes the `ctx` object (NOT raw `db, opts`) so the shared services + helpers + predicates are passed by reference. This avoids re-instantiating `accessService(db)` 5 times.

### File 1: `server/src/routes/access-route-helpers.ts` (NEW, ~300 LOC)

Exports:
- `AccessRoutesOpts` interface (the 4 deployment fields)
- `AccessRouteContext` interface (shape of the ctx object)
- `buildAccessRouteContext(db, opts): AccessRouteContext` factory
- Module-level pure helpers re-exported as standalone functions (used by ≥2 sub-routers): `hashToken`, `createInviteToken`, `createClaimSecret`, `tokenHashesMatch`, `companyInviteExpiresAt`, `requestBaseUrl`, `buildCliAuthApprovalPath`, `readSkillMarkdown`, `resolveIronworksSkillsDir`, `parseSkillFrontmatter`, `listAvailableSkills`
- `companyInviteExpiresAt` keeps its existing `export` so any external caller importing through `routes/access.js` keeps working via re-export shim in the orchestrator.

The `ctx` object includes:
- `access` (accessService instance)
- `boardAuth` (boardAuthService instance)
- `agents` (agentService instance)
- `db` (raw Db handle for occasional direct queries)
- `opts` (deployment config)
- `assertInstanceAdmin(req)` (closure-scoped predicate)
- helpers that need `db` or `opts` capture (e.g., a wrapped `requestBaseUrl` that knows about `bindHost`)

### File 2: `server/src/routes/access-routes-board-claim.ts` (NEW, ~200 LOC, 2 routes)

- `GET /board-claim/:token` (verify claim token)
- `POST /board-claim/:token/claim` (consume claim, set up board)

Export: `accessBoardClaimRoutes(ctx: AccessRouteContext): Router`

### File 3: `server/src/routes/access-routes-cli-auth.ts` (NEW, ~450 LOC, 6 routes)

- `POST /cli-auth/challenges` (create challenge)
- `GET /cli-auth/challenges/:id` (status)
- `POST /cli-auth/challenges/:id/approve`
- `POST /cli-auth/challenges/:id/cancel`
- `GET /cli-auth/me` (current CLI session)
- `POST /cli-auth/revoke-current`

Export: `accessCliAuthRoutes(ctx: AccessRouteContext): Router`

### File 4: `server/src/routes/access-routes-skills.ts` (NEW, ~300 LOC, 3 routes)

- `GET /skills/available` (skill discovery)
- `GET /skills/index`
- `GET /skills/:skillName` (skill body)

Export: `accessSkillsRoutes(ctx: AccessRouteContext): Router`

This sub-router is the heaviest user of `readSkillMarkdown`, `resolveIronworksSkillsDir`, `parseSkillFrontmatter`, `listAvailableSkills` — they could optionally live ENTIRELY inside this file rather than helpers, but per audit-during-implementation: if any helper is used elsewhere (e.g., onboarding routes also read skill markdown), keep it in helpers; otherwise move it inline.

### File 5: `server/src/routes/access-routes-invites.ts` (NEW, ~900 LOC, 13 routes)

Agent invites + user invites + join-requests — all "let X in" workflows:

**Agent invites** (7):
- `POST /companies/:companyId/invites`
- `GET /companies/:companyId/invites`
- `GET /invites/:token`
- `GET /invites/:token/onboarding`
- `GET /invites/:token/onboarding.txt`
- `POST /invites/:token/test-resolution`
- `POST /invites/:token/accept`
- `POST /invites/:inviteId/revoke`

**User invites** (5):
- `POST /companies/:companyId/user-invites`
- `GET /companies/:companyId/user-invites`
- `GET /user-invites/:token`
- `POST /user-invites/:token/accept`
- `POST /companies/:companyId/user-invites/:inviteId/revoke`

**Join-requests** (4):
- `POST /companies/:companyId/join-requests`
- `POST /companies/:companyId/join-requests/:requestId/approve`
- `POST /companies/:companyId/join-requests/:requestId/reject`
- `POST /join-requests/:requestId/claim-api-key`

Export: `accessInvitesRoutes(ctx: AccessRouteContext): Router`

This will be the largest sub-file. If during implementation it exceeds ~1,200 LOC, consider further splitting into `access-routes-invites-agent.ts` and `access-routes-invites-user.ts`. Default: keep all 13 in one file unless the line count crosses threshold.

### File 6: `server/src/routes/access-routes-membership.ts` (NEW, ~500 LOC, 8 routes)

Members + admin + self — "who already has access":

- `GET /companies/:companyId/members`
- `DELETE /companies/:companyId/members/:memberId`
- `PATCH /companies/:companyId/members/:memberId/role`
- `POST /admin/users/:userId/promote-instance-admin`
- `POST /admin/users/:userId/demote-instance-admin`
- `GET /admin/users/:userId/company-access`
- `PATCH /admin/users/:userId/company-access`
- `GET /me/access`

Export: `accessMembershipRoutes(ctx: AccessRouteContext): Router`

### File 7: `server/src/routes/access.ts` (MODIFIED — orchestrator)

After the refactor:
- ~30 LOC.
- Imports: `buildAccessRouteContext` + 5 sub-router factories.
- Body: `Router()` + 5 `router.use(...)` calls.
- Exports: `accessRoutes(db, opts)` (unchanged signature) + re-export shim for `companyInviteExpiresAt` (preserves any external import path).

## Architecture

### Components to Create

| Component | Path | Purpose |
|---|---|---|
| `access-route-helpers.ts` | `server/src/routes/` | `buildAccessRouteContext(db, opts)` + shared module-level helpers + `AccessRoutesOpts`/`AccessRouteContext` types |
| `access-routes-board-claim.ts` | `server/src/routes/` | 2 routes: claim verification + consumption |
| `access-routes-cli-auth.ts` | `server/src/routes/` | 6 routes: CLI authentication flow |
| `access-routes-skills.ts` | `server/src/routes/` | 3 routes: skill discovery + read |
| `access-routes-invites.ts` | `server/src/routes/` | 13 routes: agent invites + user invites + join-requests |
| `access-routes-membership.ts` | `server/src/routes/` | 8 routes: members + admin + /me/access |

### Components to Modify

| File | Change | Why |
|---|---|---|
| `server/src/routes/access.ts` | Strip 2,700 LOC; replace with 5 `router.use()` calls + re-export shim | Becomes orchestrator |
| `server/src/app.ts` | No change | `accessRoutes(db, opts)` signature preserved |

## Edge Cases

| Case | Behavior |
|---|---|
| Sub-router needs a helper currently used by ONE sub-router | If genuinely 1-consumer, keep helper inline in that file rather than the helpers module. Audit during impl. |
| `assertInstanceAdmin` is closure-scoped (uses `access.isInstanceAdmin`) | Captured by `buildAccessRouteContext` and exposed via `ctx.assertInstanceAdmin`. Each sub-router calls `ctx.assertInstanceAdmin(req)`. |
| External caller imports `companyInviteExpiresAt` from `routes/access.js` | Re-export shim: `export { companyInviteExpiresAt } from "./access-route-helpers.js"` |
| Path collision check across sub-routers | None expected — domains are clearly separated by URL prefix. Verify via `for f in access-routes-*.ts; do grep ... ; done | sort | uniq -d` empty. |
| Two sub-routers share a Zod schema | Either re-import in both files (cheap, fine) or move to helpers if 3+ routers need it |
| Tests import internal helpers | Audit via `rg "from .*routes/access" server/src ui/src` — currently only `app.ts` + 1 test file (`access.test.ts`). Test file uses `app.use(... accessRoutes(db, opts))` — agnostic to internal split. |

## Constraints

- No semantic change anywhere. Function bodies move verbatim.
- No `as any`, no `@ts-ignore`.
- No new dependencies.
- Imports use `.js` extension (ESM convention).
- Each sub-router's imports are minimal — only what its handlers use.
- Each sub-router exports `<domain>Routes(ctx: AccessRouteContext): Router` factory.
- `accessRoutes(db, opts)` external signature preserved.
- `companyInviteExpiresAt` external export preserved via re-export shim.
- Test count delta: 0 (no new tests required for pure file move).

## Testing Strategy

- Existing `server/src/__tests__/access.test.ts` (18 tests after PR #175 expansion) hits the composed Router via `app.use(...)` pattern — passes unchanged.
- Run `pnpm --filter @ironworksai/server test` and confirm green.
- Run `pnpm -r typecheck` and `pnpm -r build`.
- No new unit tests required.

## Rollout

- Single PR. No feature flag.
- Migration: none.
- Risk: LOW-MEDIUM. Same pattern as agents.ts (#179) which shipped clean. Slightly higher risk because access.ts has heavier per-handler logic + closure-scoped predicates. Mitigation: extract `assertInstanceAdmin` into the ctx object so it's centrally defined, not duplicated.
- Verify before merge: 18/18 access.test.ts pass; full server suite green; build green.

## Out of Scope (Revisit Later)

- Same audit-driven splits for `routes/companies.ts`, `routes/issues.ts` if they hit the size threshold (none of these are in the audit backlog).
- Splitting `access-routes-invites.ts` further if it exceeds ~1,200 LOC during implementation.
- Extracting cross-route business logic into services (most handlers already thin).
- Cleanup of dead exports / over-exposed ctx helpers (same follow-up as #179 quality reviewer flagged).

## Open Questions

None — design is concrete.

---

## Implementation Handoff

Ready for `/subagent-dev docs/brainstorm/specs/2026-05-07-access-routes-split-design.md`.

Estimated effort: ~3-4 hours mechanical move + import rewiring + test verification. Single PR. Risk: LOW-MEDIUM.

After ship: `routes/access.ts` is ~30 LOC. Backlog task #16 closes. Next: #17 (company-portability-shared.ts split — 2,660 LOC, but a SERVICE not a route file, so different pattern).
