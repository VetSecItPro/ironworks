# Design Spec: heartbeat.ts — Module-Level Helpers Extraction (Approach A)

**Date:** 2026-05-07
**Approach:** A — Conservative (helpers-only, closure intact)
**Status:** AWAITING APPROVAL

---

## Problem

`server/src/services/heartbeat.ts` is the single largest file in the codebase at **3,554 lines**. About 200 LOC at the top is imports, then ~330 LOC of module-level helper functions, then a 2,866 LOC `heartbeatService(db)` factory closure, then a 157 LOC public API return block. Reading or editing this file requires scrolling past hundreds of lines of helpers before reaching the actual service body. Test failures, stack traces, and code review all suffer from the file size.

The audit (task #14) suggested splitting into 5 modules (timing/context/awareness/scheduling/recovery), but that taxonomy doesn't match the actual seams — the closure body has 7 natural domains, and the `executeRun` function alone is 1,728 lines (about half the file). A full closure-internal split is genuinely risky for a stateful agent-execution service: closure capture is implicit across ~30 functions, and missing a dependency means runtime bugs, not compile errors.

This spec covers Approach A: extract only the module-level helpers (everything OUTSIDE the closure). The closure stays whole. No semantic changes, only file moves and import rewiring. Approach B (closure-internal split via `Ctx` object pattern) is an explicit follow-up — defer until A is shipped and stable.

## Goal

After this PR:
- `heartbeat.ts` shrinks from 3,554 → roughly 3,200 LOC (the ~330 LOC of helpers move out, plus their dedicated imports).
- Three new helper modules sit alongside `heartbeat.ts` with clear domain ownership: workspace, session policy, team directory.
- All existing tests pass unchanged. No public API change for callers (`routes/executive.ts` + 3 test files).
- Net behavior change: zero. This is a pure file-move refactor with import updates.

## Non-Goals

- NOT splitting the closure body (Approach B). Defer.
- NOT splitting `executeRun` (Approach C). Defer further.
- NOT removing `_resolveLedgerScopeForRun` or `_runTaskKey` even though they appear unused — the `_` prefix signals intentional preservation; out of scope to clean up in a refactor PR.
- NOT introducing dependency injection or other architectural patterns. Pure function moves only.
- NOT changing any function signatures (except making formerly-internal types exported where the helpers' new files need them).

## Approach

Pull the four standalone module-level helper groups out of `heartbeat.ts` into three new sibling files. Each new file mirrors the existing import/export pattern (top-of-file imports, then exports). The main `heartbeat.ts` gains ~7 new import lines (one per moved symbol it still uses) and loses ~330 LOC of body.

### File 1: `server/src/services/heartbeat-team-directory.ts` (~50 LOC)

Extracts:
- `TEAM_DIRECTORY_CACHE` constant (lines ~175-186)
- `renderTeamDirectory(db, companyId, currentAgentId)` (lines 201-223)

Imports it needs:
- `Db` from `@ironworksai/db`
- `agents` schema + `eq`/`and`/`sql` from drizzle
- `frameworkCacheGet` / `frameworkCacheSet` / `FrameworkToolCacheConfig` from `./tool-cache.js`

Exports: `renderTeamDirectory` (and `TEAM_DIRECTORY_CACHE` if any other module reads it — to verify; otherwise keep private).

### File 2: `server/src/services/heartbeat-workspace.ts` (~230 LOC)

Extracts:
- `deriveRepoNameFromRepoUrl(repoUrl)` (lines 225-241, pure)
- `ensureManagedProjectWorkspace(input)` (lines 243-327, async helper)
- `ResolvedWorkspaceForRun` type (lines 329-348, exported)
- `prioritizeProjectWorkspaceCandidatesForRun<T>(candidates, run)` (lines 350-358, exported, pure)
- `_resolveLedgerScopeForRun(db, companyId, run)` (lines 360-385, internal — keep `_` prefix; intentional)
- `resolveRuntimeSessionParamsForWorkspace(input)` (lines 391-462, exported, logic)
- `_runTaskKey(run)` (lines 472-478, internal pure helper)

Imports it needs:
- Node `fs/promises`, `path`
- `Db` from `@ironworksai/db`
- Schema imports (agents, heartbeatRuns, etc.) — to be enumerated by reading actual usage
- Drizzle helpers (eq, and)
- `resolveDefaultAgentWorkspaceDir`, `resolveManagedProjectWorkspaceDir` from `../home-paths.js`
- Workspace-runtime helpers from `./workspace-runtime.js`

Exports: `ResolvedWorkspaceForRun`, `prioritizeProjectWorkspaceCandidatesForRun`, `resolveRuntimeSessionParamsForWorkspace`, `ensureManagedProjectWorkspace`, `deriveRepoNameFromRepoUrl`, `_resolveLedgerScopeForRun`, `_runTaskKey`. Even the underscore-prefixed ones get exported, since `heartbeat.ts` may import them.

### File 3: `server/src/services/heartbeat-session-policy.ts` (~80 LOC)

Extracts:
- `parseSessionCompactionPolicy(agent)` (lines 387-389, exported, pure)
- `classifyOutputTokenCategory(context, source)` (lines 480-503, pure)
- `resolveMaxOutputTokens(config, context, source)` (lines 509-528, pure)

Imports it needs:
- `agents` schema (for `typeof agents.$inferSelect`)
- `OutputTokenCategory`, `DEFAULT_OUTPUT_TOKEN_LIMITS` from `@ironworksai/shared`
- `readNonEmptyString` from `../adapters/utils.js`
- `SessionCompactionPolicy` type — verify location; likely in shared

Exports: `parseSessionCompactionPolicy`, `classifyOutputTokenCategory`, `resolveMaxOutputTokens`.

### File 4: `server/src/services/heartbeat.ts` (modified)

Changes:
- Delete lines 175-186 (TEAM_DIRECTORY_CACHE), 201-223 (renderTeamDirectory).
- Delete lines 225-358 (workspace helpers).
- Delete lines 360-462 (resolveRuntimeSessionParamsForWorkspace + ledger scope + parseSessionCompactionPolicy).
- Delete lines 472-528 (run task key + token category + max output tokens).
- Delete the existing `export { ... }` block at line 464 that exported some of these symbols (now exported from their new homes).
- Add imports at the top:
  ```ts
  import { renderTeamDirectory } from "./heartbeat-team-directory.js";
  import {
    deriveRepoNameFromRepoUrl,
    ensureManagedProjectWorkspace,
    prioritizeProjectWorkspaceCandidatesForRun,
    resolveRuntimeSessionParamsForWorkspace,
    type ResolvedWorkspaceForRun,
    _resolveLedgerScopeForRun,
    _runTaskKey,
  } from "./heartbeat-workspace.js";
  import {
    classifyOutputTokenCategory,
    parseSessionCompactionPolicy,
    resolveMaxOutputTokens,
  } from "./heartbeat-session-policy.js";
  ```
- Re-export the previously-exported symbols if any external caller imports them — check current `export { ... }` block. The existing block at line 464 looks to be `export { prioritizeProjectWorkspaceCandidatesForRun, resolveRuntimeSessionParamsForWorkspace, parseSessionCompactionPolicy, ResolvedWorkspaceForRun }` (or similar). After the move, `heartbeat.ts` can still re-export them via `export { ... } from "./heartbeat-workspace.js"` to preserve any external import paths.

## Architecture

### Components to Create

| Component | Path | Purpose |
|---|---|---|
| `heartbeat-team-directory.ts` | `server/src/services/` | Per-company colleague directory + 5min cache |
| `heartbeat-workspace.ts` | `server/src/services/` | Workspace path resolution, session params, ledger scope, run task key |
| `heartbeat-session-policy.ts` | `server/src/services/` | Pure config: compaction policy, output-token classification, max-token resolution |

### Components to Modify

| File | Change | Why |
|---|---|---|
| `server/src/services/heartbeat.ts` | Remove ~330 LOC of module-level helpers; add 3 import statements + re-export shim for back-compat | Slims the file; preserves external import paths |

## Edge Cases

| Case | Behavior |
|---|---|
| External caller imports `prioritizeProjectWorkspaceCandidatesForRun` from `services/heartbeat.js` | Re-exported via `export { … } from "./heartbeat-workspace.js"` so the path keeps working |
| Tests import an internal helper directly | Existing tests don't (verified via grep — only `heartbeatService` and `getRun`-style methods are imported externally). If new tests want pure-helper coverage, they import from the new files. |
| Drizzle schema imports differ between split files | Each new file declares only the schemas it actually uses, keeping import bloat scoped |
| `_resolveLedgerScopeForRun` and `_runTaskKey` appear unused after the move | They're preserved in `heartbeat-workspace.ts` with their `_` prefix unchanged. Audit-PR for "remove unused symbols" is separate; not in scope here. |
| TypeScript module resolution after split | All imports use `.js` extension (matching repo convention for ESM Node 24 builds) |

## Constraints

- No `as any`, no `@ts-ignore`.
- No new dependencies.
- No public API surface change to `heartbeatService` factory.
- No semantic change anywhere — pure file moves with mechanical import rewiring.
- Re-exports preserve any external import paths that currently resolve through `services/heartbeat.js`.

## Testing Strategy

- The existing tests (`heartbeat-run-summary.test.ts`, `heartbeat-process-recovery.test.ts`, `heartbeat-workspace-session.test.ts`) all hit the public API via `heartbeatService(db)` and don't import the moved helpers directly. They should pass unchanged after the move.
- Run `pnpm --filter @ironworksai/server test` and confirm all tests stay green.
- Run `pnpm -r typecheck` and `pnpm -r build` to confirm no broken imports.
- No NEW unit tests are required for this refactor — the function bodies are unchanged. (Future Approach B work may add focused unit tests for pure helpers in their new homes; out of scope here.)

## Rollout

- Single PR. No feature flag needed (pure refactor).
- Migration: none.
- Risk: very low. The closure body is untouched; the only change is which file the helpers live in and how heartbeat.ts imports them.
- Verify before merge: full server test suite passes; full monorepo build passes.

## Out of Scope (Revisit Later)

- **Approach B** — closure-internal split using `Ctx` object pattern. Make a separate spec when ready. The 7 closure-internal domains identified during this brainstorm are good starting points: queries, session-compaction, workspace-resolution, run-state-machine, recovery-reaping, scheduling-cancellation, and the executeRun monolith.
- **Approach C** — splitting `executeRun` itself. Multi-PR effort. Defer until B has proven stable.
- Removing `_resolveLedgerScopeForRun` and `_runTaskKey` if they're genuinely dead code. Audit them in a "remove unused exports" PR.
- Updating CLAUDE.md (in `~/.claude/`) to clarify that the 400-line rule applies to UI components, not stateful service factories. User-noted follow-up; not part of this PR's diff.

## Open Questions

None — design is concrete; the file/symbol assignments are explicit; the public API is preserved.

---

## Implementation Handoff

Ready for `/subagent-dev docs/brainstorm/specs/2026-05-07-heartbeat-helpers-extraction-design.md`.

Estimated effort: ~2-3 hours of careful import rewiring + test verification. ~1 PR. Risk: LOW — pure file move, no semantic change.

After ship: `heartbeat.ts` is ~3,200 LOC. The natural follow-up brainstorm is Approach B (closure-internal split via Ctx object pattern), which would target taking it to ~300 LOC of composition + 7 sibling modules of 150-300 LOC each, leaving `executeRun` as the largest single piece at ~1,728 LOC. Backlog task #14 stays "in progress" with this PR closing the helpers-extraction half; the closure-split PR closes it fully.
