# Design Spec: company-portability-shared.ts — Domain Barrel Split

**Date:** 2026-05-07
**Approach:** Barrel pattern — split into 5 domain files; original file becomes a re-export barrel. Same risk profile as heartbeat helpers extraction (#178).
**Status:** APPROVED (user pre-authorized via repeated pattern)

---

## Problem

`server/src/services/company-portability-shared.ts` is **2,660 LOC with 119 exports** consumed by 4 sibling services (`company-portability.ts`, `company-portability-export.ts`, `company-portability-import.ts`, `agent-yaml-io.ts`). The exports span types, constants, defaults, skill helpers, path helpers, env helpers, and manifest builders — a mix of unrelated domains in one giant file.

Unlike route files (Router.use() composition), services need a different pattern: the **barrel re-export**. We split the file by domain, but the original file becomes a thin barrel that re-exports all symbols from the new files. This preserves ALL existing import paths automatically (callers keep importing from `services/company-portability-shared.ts` and TypeScript resolves through the barrel).

## Goal

After this PR:
- 5 new domain-focused files containing the actual definitions, ~200-700 LOC each.
- `company-portability-shared.ts` becomes a ~30-line barrel re-exporting everything from the new files.
- All 119 export paths preserved (zero caller-file changes required).
- All existing tests pass unchanged.
- Net behavior change: zero. Pure file move + barrel re-exports.

## Non-Goals

- NOT changing any function signature, type definition, or constant value.
- NOT touching the 4 caller files (`company-portability.ts`, `*-export.ts`, `*-import.ts`, `agent-yaml-io.ts`).
- NOT removing or renaming any export. The barrel must be exhaustive.
- NOT trying to optimize import bloat in callers — that's a separate cleanup.

## Approach

Same proven pattern as PR #178 (heartbeat helpers extraction), scaled to a service:

```ts
// company-portability-shared.ts (after) — pure barrel
export * from "./company-portability-types.js";
export * from "./company-portability-defaults.js";
export * from "./company-portability-skill-helpers.js";
export * from "./company-portability-path-helpers.js";
export * from "./company-portability-env-helpers.js";
```

Each new file owns one domain and exports its own definitions. The barrel makes the split invisible to callers.

### Domain breakdown

Based on the 119 exports surveyed:

**File 1: `company-portability-types.ts` (~200 LOC)**
- All `export type` and `export interface`: `ResolvedSource`, `MarkdownDoc`, `ProjectLike`, `IssueLike`, `RoutineLike`, `ImportPlanInternal`, `ImportMode`, `ImportBehaviorOptions`, `AgentLike`, `OrgNode`, etc.
- Pure types only. No runtime code.

**File 2: `company-portability-defaults.ts` (~150 LOC)**
- `DEFAULT_INCLUDE`, `DEFAULT_COLLISION_STRATEGY`, `RUNTIME_DEFAULT_RULES`
- `COMPANY_LOGO_CONTENT_TYPE_EXTENSIONS`, `COMPANY_LOGO_FILE_NAME`
- Other module-level configuration constants
- Plus tiny related helpers (`resolveImportMode`, `resolveSkillConflictStrategy`, `classifyPortableFileKind`)

**File 3: `company-portability-skill-helpers.ts` (~700 LOC)**
- `normalizeSkillSlug`, `normalizeSkillKey`, `readSkillKey`, `deriveManifestSkillKey`
- `buildOrgTreeFromManifest`
- Skill-related parsing/derivation helpers

**File 4: `company-portability-path-helpers.ts` (~600 LOC)**
- `normalizeExportPathSegment`, `deriveLocalExportNamespace`
- `derivePrimarySkillExportDir`, `appendSkillExportDirSuffix`, `deriveSkillExportDirCandidates`, `buildSkillExportDirMap`
- All export-path / namespace derivation logic

**File 5: `company-portability-env-helpers.ts` (~100 LOC)**
- `isSensitiveEnvKey` and related env-key handling
- `execFileAsync` (the promisified execFile constant)

**The barrel: `company-portability-shared.ts` (~30 LOC)**
- Pure `export *` re-exports from all 5 new files.
- No definitions of its own.

If the implementer's audit finds a symbol that doesn't fit cleanly into one of the 5 domains, they can:
- Add a 6th domain file if there's a clear theme
- Keep it in whichever domain file is closest
- NOT keep it in the barrel — the barrel has zero definitions

## Architecture

### Components to Create

| Component | Path | Purpose |
|---|---|---|
| `company-portability-types.ts` | `server/src/services/` | All exported types/interfaces |
| `company-portability-defaults.ts` | `server/src/services/` | Configuration constants + small mode-resolution helpers |
| `company-portability-skill-helpers.ts` | `server/src/services/` | Skill normalization + manifest derivation |
| `company-portability-path-helpers.ts` | `server/src/services/` | Export path / namespace derivation |
| `company-portability-env-helpers.ts` | `server/src/services/` | Env-key handling + `execFileAsync` |

### Components to Modify

| File | Change | Why |
|---|---|---|
| `server/src/services/company-portability-shared.ts` | Strip ~2,600 LOC; replace with `export * from` re-exports | Becomes barrel |

## Edge Cases

| Case | Behavior |
|---|---|
| A symbol fits multiple domains | Pick the one where it's MOST USED. If tied, pick the smallest file. |
| A type re-imports from another new file (e.g., `ImportPlanInternal` references `MarkdownDoc`) | Use cross-file imports (`import type { MarkdownDoc } from "./company-portability-types.js"`) — barrel resolution handles it. |
| Caller imports a symbol that doesn't exist after the move | Audit during impl: every export in master must be re-exported by the barrel. Confirm via `grep -c "^export" master:server/src/services/company-portability-shared.ts` matches the sum of new files' export counts. |
| Test file imports a symbol directly from the barrel | Continues to work via `export *` resolution. |
| Two sibling services need the same helper | They both import from the barrel; barrel re-exports from the owning new file. |
| Implementer forgets to re-export a symbol | TypeScript will fail on `pnpm -r typecheck` because callers can't resolve. Catch via verification step. |

## Constraints

- No semantic change anywhere. All function bodies move verbatim.
- No `as any`, no `@ts-ignore`.
- No new dependencies.
- ESM `.js` import extensions throughout.
- The barrel file (`company-portability-shared.ts`) must contain ZERO definitions — only `export * from` lines.
- Each new file's imports are minimal — only what its definitions use.
- Test count delta: 0 (no new tests required).

## Testing Strategy

- Existing tests for `company-portability*` services (~3 test files) hit the public API via the original barrel path — they pass unchanged.
- Run `pnpm --filter @ironworksai/server test` to confirm green.
- Run `pnpm -r typecheck` to confirm no broken cross-file imports.
- Run `pnpm -r build` to confirm the barrel resolves correctly at compile time.

## Rollout

- Single PR. No feature flag.
- Migration: none.
- Risk: LOW. Barrel re-exports are a well-known TypeScript pattern. The 4 caller files don't change at all. As long as every export survives, this is invisible.
- Verify before merge: caller files compile without modification; full server suite green; build green.

## Out of Scope (Revisit Later)

- Eliminating the barrel by updating callers to import directly from the domain files. That's a follow-up cleanup; not in scope here.
- Splitting `company-portability-export.ts` or `company-portability-import.ts` if they're also large.
- Eliminating dead exports if any are found unused. Audit-and-remove is a separate PR.

## Open Questions

None — the barrel pattern is mechanical and the domain split is clean.

---

## Implementation Handoff

Ready for `/subagent-dev docs/brainstorm/specs/2026-05-07-company-portability-shared-split-design.md`.

Estimated effort: ~2-3 hours mechanical move + verification. Single PR. Risk: LOW.

After ship: `services/company-portability-shared.ts` is a ~30 LOC barrel. Backlog task #17 closes. Next: #18 (knowledge-seeds.ts split — different problem, needs JSON-vs-TS decision).
