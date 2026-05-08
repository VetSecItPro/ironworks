# Design Spec: Memory Upgrade Phase 2 — Periodic Notes + Time-Series Rollups

**Date:** 2026-05-08
**Approach:** A (sync hooks) + X (two named cost-rollup crons) + M (one page per decision)
**Status:** APPROVED

---

## Problem

Phase 2 of the Memory + Knowledge Layer Upgrade. P0 (PR #183) gave us semantic retrieval; P1 (PR #184) wired the link graph. P2 fills the periodic-notes gap: agent run history, cost rollups, and decisions currently live in JSONL events / per-row tables / structured-fields and are invisible to vault export, hard to skim, and don't show up in the link graph. P2 turns these into first-class knowledge pages so they participate in backlinks, search, and (future) vault export.

## Goal

After P2:

- Every agent-run completion that the operator opts into emits `agents/<slug>/runs/<YYYY-MM-DD>/<run-id>.md` with a canonical `RunFrontmatter` shape and a body summary.
- Every Sunday 00:30 CT, a weekly cost-rollup page lands at `finance/cost-rollups/weekly/<YYYY-Www>.md`. Every 1st of month 00:30 CT, the monthly page lands at `finance/cost-rollups/monthly/<YYYY-MM>.md`. Both with by-agent + by-provider breakdowns.
- Every decision logged via `decision-log.ts` emits `decisions/<decision-id>.md` with `DecisionFrontmatter` and body that uses `[[wikilinks]]` to source issue / agent / project — automatically producing backlinks via P1.
- Operator can toggle run-note emission per instance via `instanceGeneralSettings.notes.persistRunNotes` (default `false`). Decision notes are on by default (low volume, high value). Cost rollups always run (they're cheap and operator-visible).
- All notes use the canonical Frontmatter types from P0 (`RunFrontmatter`, `DecisionFrontmatter`, plus a new `CostRollupFrontmatter` type).

## Non-Goals

- ❌ NOT replacing existing `cost_events` / `cost_rollup_daily` tables — those stay authoritative for analytics. Pages are derived views.
- ❌ NOT historical backfill of run notes (volume could be huge; opt-in cron-only-going-forward semantics)
- ❌ NOT backfill of decision notes (similar; new decisions only)
- ❌ NOT modifying the cost dashboard UI — pages are for vault export + ops review, not the in-app cost view
- ❌ NOT a UI for browsing periodic notes — they show up in the existing KB browser like any other page
- ❌ NOT real-time delivery of cost rollups — cron-driven only

## Approach

### High-level architecture

```
                     ┌─────────────────────────────┐
                     │ heartbeat.finalizeAgent()   │
                     └────────┬────────────────────┘
                              │ if persistRunNotes:
                              ▼
                     ┌─────────────────────────────┐
                     │ emitRunNote(db, runMeta)    │ ← sync, non-fatal on error
                     │  → knowledge.create(...)    │
                     └─────────────────────────────┘

                     ┌─────────────────────────────┐
                     │ logDecisions(db, decisions) │
                     └────────┬────────────────────┘
                              │ if persistDecisionNotes (default: true):
                              ▼
                     ┌─────────────────────────────┐
                     │ emitDecisionNotes(db, ...)  │ ← sync, non-fatal on error
                     │  → knowledge.create(...)    │   (1 page per decision)
                     └─────────────────────────────┘

                     ┌─────────────────────────────┐
                     │ Weekly cron (Sun 00:30 CT)  │
                     │  → emitWeeklyCostRollup()   │
                     │  Reads cost_rollup_daily,   │
                     │  writes finance/cost-       │
                     │  rollups/weekly/<key>.md    │
                     └─────────────────────────────┘

                     ┌─────────────────────────────┐
                     │ Monthly cron (1st 00:30 CT) │
                     │  → emitMonthlyCostRollup()  │
                     │  Same pattern, monthly key  │
                     └─────────────────────────────┘
```

### Why sync over async

Volume:
- Run finalize: ~1-10/min steady state for active agents
- Decisions: maybe 10-100/day per company
- Cost rollups: 2/week + 1/month per company

Adding ~50ms per finalize is well within the heartbeat budget. The async machinery from P0 (queue + worker) is built for high-volume embedding work where the per-call latency would matter. Here it's overkill. Failure mode is "warn-and-continue": if `emitRunNote` throws, log + swallow + the run still finalizes correctly.

### Why Frontmatter-driven

P0 shipped canonical types `RunFrontmatter`, `DecisionFrontmatter`. P2 uses them (extending where needed) so future vault export (P3) gets consistent shapes for free. Bodies use `[[wikilinks]]` so the link graph (P1) lights up automatically — the issue page that triggered a decision shows the decision in its backlinks panel without any additional wiring.

### Why per-decision pages over per-run

The canonical `DecisionFrontmatter` from P0 has `decision_id`, `status`, `context_issue_id`, etc. — clearly per-decision. Per-decision pages enable:
- Backlinks from the source issue/agent/project (one-shot via `[[]]`)
- Direct slug navigation (`decisions/d-12345`)
- Granular `aliases` for renames (per P1)

A per-run aggregator page is a future addition if value emerges.

### Settings extension

`instanceGeneralSettingsSchema` gains a `notes` section:
```ts
notes: z.object({
  persistRunNotes: z.boolean().default(false),
  persistDecisionNotes: z.boolean().default(true),
}).optional()
```

The defaults match the volume/value tradeoff: run notes are noisy and opt-in; decision notes are sparse and on.

### Cost-rollup output shape

`CostRollupFrontmatter` (new, in `packages/shared/src/types/frontmatter/cost-rollup.ts`):

```ts
interface CostRollupFrontmatter extends BaseFrontmatter {
  type: "cost_rollup";
  period_start: string;       // YYYY-MM-DD
  period_end: string;         // YYYY-MM-DD
  granularity: "weekly" | "monthly";
  total_usd: number;
  by_agent: Array<{ agent_slug: string; total_usd: number }>;
  by_provider: Array<{ provider: string; total_usd: number }>;
}
```

Body is a Dataview-shaped markdown table (just markdown — Dataview is an Obsidian plugin, but the syntax doesn't break vanilla markdown render).

## Architecture

### Components to Create

| Component | Path | Purpose |
|---|---|---|
| Run note renderer | `server/src/services/periodic-notes/run-notes.ts` | `emitRunNote(db, runMeta)` |
| Decision note renderer | `server/src/services/periodic-notes/decision-notes.ts` | `emitDecisionNotes(db, decisions, ctx)` |
| Cost rollup renderer | `server/src/services/periodic-notes/cost-rollups.ts` | `emitWeeklyCostRollup(db)`, `emitMonthlyCostRollup(db)` |
| Note frontmatter shapes | `server/src/services/periodic-notes/frontmatter.ts` | Helpers to build canonical FM from runtime data |
| Markdown body renderers | `server/src/services/periodic-notes/render.ts` | Pure functions: `renderRunBody`, `renderDecisionBody`, `renderCostRollupBody` |
| Cron scheduler | `server/src/services/periodic-notes/cron.ts` | `startPeriodicNotesScheduler(db)`, `stopPeriodicNotesScheduler()` — runs weekly + monthly checks |
| `CostRollupFrontmatter` type | `packages/shared/src/types/frontmatter/cost-rollup.ts` | New entity type extending BaseFrontmatter |
| Frontmatter index update | `packages/shared/src/types/frontmatter/index.ts` | Export `CostRollupFrontmatter`, add to `AnyFrontmatter` union, register `"cost_rollup"` in `EntityType` |
| Tests | `server/src/services/periodic-notes/__tests__/*.test.ts` (5 files) | Renderer + emitter + cron tests |
| Frontmatter test extension | `packages/shared/src/types/frontmatter/__tests__/roundtrip.test.ts` | Add cost_rollup round-trip cases |

### Components to Modify

| File | What Changes | Why |
|---|---|---|
| `packages/shared/src/validators/instance.ts` | Add `notes: { persistRunNotes, persistDecisionNotes }` to `instanceGeneralSettingsSchema` and patch schema | Operator toggle |
| `packages/shared/src/types/frontmatter/base.ts` | Add `"cost_rollup"` to `EntityType` union | New type |
| `server/src/services/heartbeat.ts` | Inside `finalizeAgentStatus` (or in the run-completion path around line 2812-2817), after run is fully finalized: read settings, if `notes.persistRunNotes` true → `await emitRunNote(...).catch(logAndSwallow)` | Wire run notes |
| `server/src/services/decision-log.ts` | At end of `logDecisions`, if `notes.persistDecisionNotes` (default true) → `await emitDecisionNotes(...).catch(logAndSwallow)` | Wire decision notes |
| `server/src/app.ts` | `startPeriodicNotesScheduler(db)` at boot; `stopPeriodicNotesScheduler()` on shutdown | Lifecycle |
| `server/src/services/instance-settings.ts` | Normalize new `notes` section on read; preserve through patch | Settings round-trip |
| `CHANGELOG.md` `[Unreleased]` | "Added: periodic run-notes + cost rollup pages + decision-log → KB cross-reference (P2)" | Release trail |
| `docs/OPERATIONS.md` | New section: enabling run notes, ops queries for cost rollups | Runbook |

### Data Model

No new SQL tables — everything goes through existing `knowledge_pages` (and inherits `knowledge_page_links` automatically because of P1's body parser).

### Frontmatter shapes used

```ts
// existing P0 RunFrontmatter (extend with these specifics):
interface RunFrontmatter extends BaseFrontmatter {
  type: "run";
  run_id: string;
  agent_slug: string;
  agent_id: string;
  started_at: string;        // ISO
  completed_at: string;      // ISO
  status: "succeeded" | "failed" | "cancelled" | "timed_out";
  cost_usd: number | null;
  linked_issue_id?: string;
  linked_issue_ref?: string; // human-readable issue ref
}

// existing P0 DecisionFrontmatter — used as-is

// new CostRollupFrontmatter:
interface CostRollupFrontmatter extends BaseFrontmatter {
  type: "cost_rollup";
  period_start: string;
  period_end: string;
  granularity: "weekly" | "monthly";
  total_usd: number;
  by_agent: Array<{ agent_slug: string; total_usd: number }>;
  by_provider: Array<{ provider: string; total_usd: number }>;
}
```

`AgentFrontmatter` and existing types may need minor field additions discovered during implementation; the canonical types module from P0 is the source of truth.

### API

No new HTTP endpoints. All emission is internal.

## User Flow

### Operator enables run notes
1. Operator goes to Settings → General (existing UI).
2. Toggles `notes.persistRunNotes` to true via instance-settings PATCH.
3. From now on, every run completion creates a KB page.

### Run finalizes
1. `finalizeAgentStatus(agentId, "succeeded")` runs.
2. Existing finalization logic runs (writes to `heartbeat_runs`, etc.).
3. After successful finalize: read `instanceSettings.general.notes.persistRunNotes`.
4. If true: build `RunFrontmatter` + render body (status, cost, issue ref, summary text, key event timestamps) → `knowledgeService(db).create(companyId, runPageInput, { agentId })`.
5. Slug pattern: `agents/<agent-slug>/runs/<YYYY-MM-DD>/<run-id-short>` (run id truncated to first 8 hex for readability; collision risk negligible at run volumes).
6. Body uses `[[<agent-slug>]]` to wikilink the agent page (where it exists; resolves on save → backlinks appear on agent page).
7. On error: `logger.warn({ err, runId }, "[periodic-notes] run note emit failed")` + return — run finalize is unaffected.

### Decision logged
1. Agent's reasoning emits structured decisions via `extractDecisions`.
2. `logDecisions(db, decisions, context)` persists them in their existing structured-fields shape.
3. After `logDecisions` returns, if `notes.persistDecisionNotes`: for each decision, `emitDecisionNote(db, d)`.
4. Slug: `decisions/<decision_id>`.
5. Body uses `[[<source-issue-slug>]]`, `[[<agent-slug>]]`, `[[<project-slug>]]` so backlinks appear on those pages.

### Weekly cost rollup (Sunday 00:30 CT)
1. Cron fires.
2. Compute current ISO week (year + week number).
3. Query `cost_rollup_daily` for the prior 7 days, joined with `agents`, grouped by agent + provider.
4. Build `CostRollupFrontmatter` + render body table.
5. Slug: `finance/cost-rollups/weekly/<YYYY-Www>` (e.g., `finance/cost-rollups/weekly/2026-W18`).
6. Idempotent: if page exists, update via `knowledgeService.update` (revisionNumber bump). Otherwise create.

### Monthly cost rollup (1st of month 00:30 CT)
1. Cron fires.
2. Compute previous month's range.
3. Same flow as weekly with `granularity: "monthly"` and slug `finance/cost-rollups/monthly/<YYYY-MM>`.

## Edge Cases

| Case | Behavior |
|---|---|
| Run finalize: settings unset | `persistRunNotes` default `false`; no note emitted; no log noise |
| Run finalize: emitRunNote throws (e.g. unique-slug collision on retry) | `logger.warn`; run finalize succeeds; on next attempt the existing page can be updated rather than re-created (use `knowledgeService.update` if `getPageBySlug` returns a row — implementation detail in renderer) |
| Decision log: zero decisions | No-op — emitter short-circuits on empty array |
| Decision log: emitter throws on one decision | Per-decision try/catch — other decisions still emit |
| Cost rollup: no cost data for period | Page emitted with `total_usd: 0`, empty `by_agent` + `by_provider` arrays. Body renders "No costs recorded for this period." |
| Cost rollup cron fires twice (two app instances racing) | First-write wins via `knowledgePages.companyId+slug` unique index; second errors with conflict → caught + logged; idempotent on retry (next-week run sees prior page and updates) |
| Cost rollup cron skipped (downtime) | Next run handles current period only — historical periods are not auto-backfilled. Operator can manually trigger via `pnpm tsx scripts/backfill-cost-rollups.ts --weeks=4` (out of scope for this spec; documented as follow-up) |
| Cost rollup: single-tenant vs multi-company | Cron iterates every company in the database; each gets its own pages. Companies with no cost data still get an empty rollup page (matches user mental model). |
| Run note: agent slug missing | Fall back to `agents/_unknown/runs/<date>/<run-id>` and warn. Should never happen with normal usage. |
| Run note: linked issue ref unavailable | Frontmatter omits `linked_issue_id` / `linked_issue_ref`; body skips that wikilink |
| Decision note: decision id collision (decision_id reused) | Use `knowledgeService.update` if page exists; revisionNumber increments. P1's link sync re-runs and updates link rows. |
| Settings PATCH with partial `notes` (only one key) | Existing partial-patch semantics preserve unset keys → instance-settings normalize handles this |
| Cron timezone: server in UTC vs CT | All cron specs ARE in CT per CLAUDE.md global rule; convert in scheduler initialization. Use `node-schedule` if available in deps; otherwise compute next-fire time manually with TZ-aware Date math (Node 24 has `Intl.DateTimeFormat` for TZ ops). |
| Body markdown contains existing `[[]]` syntax | Already handled by P1's parser (it just resolves wikilinks; periodic-notes pages get backlinks like any other page) |

## Constraints

- **No regressions to existing tests.** Heartbeat (10), decision-log, knowledge tests must pass without modification.
- **Sync emission must be non-fatal** — if note creation fails, the original operation (finalize, decision log, cron) still completes successfully.
- **Tenant safety.** All companies iterate independently; cron does not cross tenants.
- **Time zone consistency.** All cron specs in CT (America/Chicago) per CLAUDE.md hard rule.
- **Idempotence.** Cost rollup re-runs over same period: update existing page, do not duplicate.
- **No `as any`.**
- **Tests ship with code.** ~22 new tests across renderers, emitters, and cron handlers.

## Testing Strategy

- **Render unit tests:** `renderRunBody`, `renderDecisionBody`, `renderCostRollupBody` produce expected markdown given fixture inputs (snapshot-style or string-match).
- **Emitter integration tests:** with embedded postgres + seeded knowledge_pages / agents, `emitRunNote` creates a page; second call updates same slug; failure path doesn't throw upstream.
- **Settings tests:** `notes` section round-trips through PATCH/GET; default values applied when absent.
- **Cron tests:** `emitWeeklyCostRollup` + `emitMonthlyCostRollup` produce correct data given seeded `cost_rollup_daily` rows; idempotent on re-run.
- **Frontmatter round-trip:** `CostRollupFrontmatter` render → parse cycle.
- **Cron scheduler lifecycle:** start + stop + graceful shutdown (no orphan timers).

## Rollout

1. Ship migration-free additions (no schema change). Settings extension + canonical type extension.
2. Ship renderers + emitter modules + tests (no behavior change yet).
3. Wire heartbeat + decision-log hooks. Verify existing tests still pass.
4. Wire cron + scheduler in app.ts.
5. Operator opts in via Settings → General toggle. Pages start landing.

No feature flag in code beyond the settings toggle. The settings toggle IS the kill switch.

## Out of Scope (Revisit Later)

- **Run-note backfill script.** Could write a `scripts/backfill-run-notes.ts` to walk historical `heartbeat_runs` and emit pages — punt to follow-up if requested.
- **Cost-rollup backfill** for historical periods.
- **Daily cost-rollup pages** (could be added if anyone asks; daily rollup table already exists, just no page emit).
- **Per-company opt-in for cost rollups** — currently always-on. Could add a per-company toggle.
- **UI affordance** for browsing run-history-as-pages (existing KB browser surfaces them already, but a dedicated "Runs" tab could be nice).
- **Aggregator pages** (e.g., `agents/<slug>/runs/<YYYY-MM>.md` summarizing a month) — strategic future work.
- **Stakeholder publish portal** (P4) consumes these pages — out of scope here.

## Open Questions

None.

---

## Implementation Handoff

Ready for `/subagent-dev docs/brainstorm/specs/2026-05-08-memory-upgrade-p2-design.md`.

Task decomposition (each gets two-stage review):

1. **`CostRollupFrontmatter` type** + EntityType union update + render/parse round-trip tests
2. **Settings extension** — `notes` section in `instanceGeneralSettingsSchema` + patch schema + service normalization
3. **Markdown body renderers** (`renderRunBody`, `renderDecisionBody`, `renderCostRollupBody`) as pure functions + unit tests
4. **`emitRunNote`** module + integration tests (page create + update + failure-non-fatal)
5. **`emitDecisionNotes`** module + integration tests (per-decision try/catch + slug + wikilinks)
6. **Cost rollup emitters** (`emitWeeklyCostRollup`, `emitMonthlyCostRollup`) + integration tests covering empty period + populated period + idempotent re-run
7. **Cron scheduler** for periodic notes + lifecycle tests
8. **Wire heartbeat finalize** to call `emitRunNote` (non-fatal) — existing 10 heartbeat tests must still pass
9. **Wire `logDecisions`** to call `emitDecisionNotes` (non-fatal) — existing decision-log tests must still pass
10. **Wire app.ts** scheduler boot + shutdown
11. **CHANGELOG + ops doc** — document opt-in, troubleshooting queries

Total: 11 tasks. Projected ~3-4 days with two-stage review per task.
