# Deferred Migrations

Migrations and features intentionally deferred from the `mdmp/http-adapter-family` PR. Each entry has enough context to pick up cleanly in a future session.

---

## 1. TypeScript 5.9 -> 6.x

**Why deferred:** Attempted during T3. Broke typecheck in multiple packages. Root cause is a combination of `@types/node` config mismatches and `Cannot find name 'node:path'` / `process` errors in packages that omit `"types": ["node"]` from their `tsconfig.json`. Scope exceeded the PR boundary.

**Blocker:** None external. Internal scope only.

**Concrete first step:** Add `"types": ["node"]` to each affected package's `tsconfig.json`, or update `@types/node` to 25.x and adjust `lib` targets to match. Run `pnpm typecheck` after each package to isolate regressions.

**Files likely touched:**
- Every `packages/*/tsconfig.json` and `packages/adapters/*/tsconfig.json`
- Possibly `tsconfig.base.json` at the repo root

**Acceptance criteria:** `pnpm typecheck` passes with TypeScript 6.x installed. No `skipLibCheck: true` added to paper over errors.

**Estimated effort:** ~1 day focused work.

---

## 2. Vitest 3.2 -> 4.x

**Why deferred:** Adapter-utils typecheck regression on upgrade. Likely caused by mock API changes (`vi.mocked`, `vi.fn<T>`) and possibly Promise-based hook signatures that changed between Vitest 3 and 4.

**Blocker:** None external. Internal scope only.

**Concrete first step:** Read the [Vitest 4 migration guide](https://vitest.dev/guide/migration). Focus on any `adapter-utils` test file that calls `vi.mocked<T>()` or uses typed `vi.fn<T>`. Batch-fix those files first before running the full suite.

**Files likely touched:**
- `packages/adapter-utils/src/**/__tests__/*.test.ts`
- `vitest.config.ts` at the repo root (project definitions)

**Acceptance criteria:** `pnpm vitest run` passes cleanly with Vitest 4.x. No `@ts-expect-error` suppressions added to mask incompatibilities.

**Estimated effort:** 1-2 days.

---

## 3. Zod 3 -> 4

**Why deferred:** Deep, breaking change. `z.object({}).strict()` behavior changed, `.parse` error shape changed, new `z.infer` mechanics. Unblocks better-auth 1.6 peer dependency once complete.

**Blocker:** None external. Internal migration effort only. better-auth 1.6 blocked on this.

**Concrete first step:** Scan the codebase for `z.object`, `z.parse`, `z.infer` usages and batch-fix per-file. The Zod 4 migration guide publishes a codemods list - run those first.

```sh
grep -r "z\.object\|z\.parse\|z\.infer" packages/ server/ --include="*.ts" -l
```

**Files likely touched:**
- All files in `packages/*/src/` that import from `zod`
- `server/src/` validation schemas
- API route handlers

**Acceptance criteria:** `pnpm typecheck` and `pnpm vitest run` pass with Zod 4. No `as unknown as` casts added to mask parse errors.

**Estimated effort:** ~2 days.

---

## 4. better-auth 1.4 -> 1.6

**Why deferred:** Blocked on Zod 4 (item 3 above). The 1.6 release requires Zod 4 as a peer dependency.

**Blocker:** Zod 3 -> 4 migration must ship first.

**Concrete first step:** After Zod 4 lands, run `pnpm add better-auth@^1.6` and check for any breaking-change notes in the better-auth 1.6 changelog that affect the session/auth setup in `server/src/`.

**Files likely touched:**
- `server/src/auth.ts` (or equivalent better-auth setup file)
- Any middleware that wraps better-auth session handling

**Acceptance criteria:** Auth flows work end-to-end in dev and staging. `pnpm vitest run` passes.

**Estimated effort:** ~2-4 hours after Zod 4 lands.

---

## 5. @clack/prompts 0.10 -> 1.2

**Why deferred:** CLI typecheck broke on upgrade. The `@clack/prompts` 1.x release changed several import shapes used in `cli/src/commands/`.

**Blocker:** None external. Internal scope only.

**Concrete first step:** Read the `@clack/prompts` 1.x breaking-change notes. Diff the imports in `cli/src/commands/*.ts` against the new API surface. The breaking changes are typically in the `spinner`, `confirm`, and `select` call signatures.

**Files likely touched:**
- `cli/src/commands/*.ts`
- `cli/src/index.ts`

**Acceptance criteria:** `pnpm typecheck` passes with `@clack/prompts@^1.2`. CLI smoke test passes (`pnpm --filter @ironworksai/cli test:run`).

**Estimated effort:** ~2 hours.

---

## 6. Systemic server test pollution fix (retry:2 lift)

**Why deferred:** 15+ module-level stateful singletons in server packages leak state between test files. Prior fix attempts:
- Defensive full-services mock in 2 files: shifted pollution to other files rather than eliminating it.
- Global `beforeEach` reset hook: broke 429 tests via `vi.mock` hoisting conflict (hoisted mocks run before `beforeEach`).

The `retry: 2` workaround in `vitest.config.ts` masks this by retrying flaky tests.

**Blocker:** Requires careful investigation of Vitest's interaction between `setupFiles`, static imports, and `vi.mock` hoisting.

**Concrete first step:** Investigate whether Vitest's `setupFiles` + dynamic-import pattern is compatible with `vi.mock` hoisting. If not, audit each test file individually and add `__resetForTests` exports + `afterAll` cleanup in each module that holds module-level state. Start with the files that appear most often in flaky test output.

**Files likely touched:**
- `vitest.config.ts` (remove `retry: 2` once fixed)
- `server/src/**/__tests__/*.test.ts` (add `afterAll` cleanup)
- Any server module holding module-level singleton state

**Acceptance criteria:** `pnpm vitest run` passes reliably without `retry: 2`. No test order dependencies remain. Can be verified by running with `--sequence.shuffle`.

**Estimated effort:** 4-8 hours.

---

## 7. Phase O enterprise features

The following capabilities were out of scope for this PR and are planned for Phase O:

| Feature | Description |
|---|---|
| Workspace-shared CLI subscriptions + HOME isolation | Agents share a single CLI subscription key with per-workspace HOME dirs to prevent cross-contamination |
| Server-side device flow | OAuth device flow for authenticating CLI tools from the server without exposing credentials to the UI |
| OpenRouter OAuth PKCE | First-party OAuth flow for OpenRouter instead of static API key |
| Live rate-limit indicators | Surface per-model rate-limit state from provider API response headers to the UI |
| Budget ceilings (soft/hard caps) | Per-agent and per-workspace soft-warn and hard-stop spending limits |
| Continuous health probes | Scheduled background probes that verify each adapter is reachable and report status to the Board Briefing page |
| API request/response audit log | Immutable append-only log of all adapter calls for compliance and debugging |

**Blocker:** None. These are new features, not migrations. First step for any item: create a Phase O issue with the feature spec and link it here.

---

## 8. License review

**Why deferred:** `@codesandbox/nodebox` and `khroma` have unknown or missing license metadata per `docs/LICENSES.md`.

**Blocker:** None. Requires manual investigation.

**Concrete first step:** Run `pnpm licenses list` (or equivalent) and cross-reference the npm registry entries for both packages. If the licenses are permissive (MIT/Apache/BSD), update `docs/LICENSES.md`. If they are restrictive or unclear, escalate before any external redistribution.

**Files likely touched:**
- `docs/LICENSES.md`

**Acceptance criteria:** Both packages have confirmed license entries in `docs/LICENSES.md`. No redistribution without this resolved.

**Estimated effort:** ~1 hour.
