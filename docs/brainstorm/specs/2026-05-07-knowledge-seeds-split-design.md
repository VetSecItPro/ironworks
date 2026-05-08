# Design Spec: knowledge-seeds.ts — Domain Split (Aggregator Pattern)

**Date:** 2026-05-07
**Approach:** Domain-categorize, split into N domain files, original becomes thin aggregator
**Status:** APPROVED (user pre-authorized)

---

## Problem

`server/src/services/knowledge-seeds.ts` is **3,256 LOC of pure data**: ~30 markdown documents in a `seeds` array (lines 3-3090) plus ~7 SOP templates (lines 3091-3253). Single export `getKnowledgeSeeds()`. One caller (`knowledge.ts`).

The audit's original suggestion ("move to scripts/") was wrong — the file is RUNTIME-imported, not a one-shot seed script. Reframe: split by domain into smaller TS files, with the original becoming a thin aggregator that preserves the single-export public API.

JSON was considered but rejected: bodies are multi-paragraph markdown with backticks, indentation, code blocks. Round-tripping to JSON requires escaping that's lossy and error-prone. Template-literal TypeScript is the right substrate.

## Goal

After this PR:
- ~6-8 new domain files (`knowledge-seeds-<category>.ts`), each ~200-600 LOC, each containing thematically grouped seeds.
- `knowledge-seeds.ts` becomes a thin aggregator (~30 LOC) that imports each domain file and exposes the original `getKnowledgeSeeds()` API by concatenating their seeds.
- `knowledge.ts` (the caller) is unchanged — it keeps calling `getKnowledgeSeeds()` and gets the same array back.
- All existing tests pass unchanged.
- Net behavior change: zero. Pure file split + aggregation.

## Non-Goals

- NOT moving to JSON (markdown round-trip is lossy).
- NOT moving to `scripts/` (file is runtime-imported).
- NOT changing seed content, titles, or structure.
- NOT changing the caller (`knowledge.ts`).
- NOT changing the `KnowledgeSeed` type definition.

## Approach

### Step 1: Implementer reads all seed titles + classifies into domains

The implementer will read every title in the `seeds` array and the `sopTemplates` array, grouping by theme. Likely groupings (verify during impl):

- **Operating manuals / governance** (`Company Operating Manual`, board docs, charters)
- **Strategy / planning** (vision, OKRs, roadmap docs)
- **People / HR** (hiring playbooks, role descriptions, performance review templates)
- **Engineering / technical** (architecture standards, code review guides, deploy practices)
- **Marketing / GTM** (positioning, content calendars, launch playbooks)
- **Finance / operations** (budgeting, cost reviews, vendor management)
- **Legal / compliance** (privacy, contracts, audit prep)
- **SOPs** — the existing second array; can be its own file or merged with one of the above

If a seed doesn't fit any category, the implementer adds an "uncategorized" file rather than forcing a fit. Categories with only 1 seed merge into the closest neighbor.

### Step 2: Each domain file exports its own seed array

```ts
// knowledge-seeds-operating.ts
import type { KnowledgeSeed } from "./knowledge-seeds.js";

export const operatingSeeds: KnowledgeSeed[] = [
  { title: "Company Operating Manual", body: `...` },
  // ... other operating-domain seeds
];
```

Each domain file:
- Imports `KnowledgeSeed` type from the aggregator (or from a new `knowledge-seeds-types.ts` if circular-import becomes an issue).
- Exports a single `<domain>Seeds: KnowledgeSeed[]` array.
- No other exports.

### Step 3: Aggregator becomes thin

```ts
// knowledge-seeds.ts (after)
export type KnowledgeSeed = { title: string; body: string };

import { operatingSeeds } from "./knowledge-seeds-operating.js";
import { strategySeeds } from "./knowledge-seeds-strategy.js";
import { peopleSeeds } from "./knowledge-seeds-people.js";
import { engineeringSeeds } from "./knowledge-seeds-engineering.js";
import { marketingSeeds } from "./knowledge-seeds-marketing.js";
import { financeSeeds } from "./knowledge-seeds-finance.js";
import { legalSeeds } from "./knowledge-seeds-legal.js";
import { sopSeeds } from "./knowledge-seeds-sops.js";

export function getKnowledgeSeeds(): {
  seeds: KnowledgeSeed[];
  sopTemplates: KnowledgeSeed[];
} {
  return {
    seeds: [
      ...operatingSeeds,
      ...strategySeeds,
      ...peopleSeeds,
      ...engineeringSeeds,
      ...marketingSeeds,
      ...financeSeeds,
      ...legalSeeds,
    ],
    sopTemplates: sopSeeds,
  };
}
```

The order of concatenation matters ONLY if `knowledge.ts` cares — verify by checking how the seeds are consumed (likely by title-based lookup, not index, so order is cosmetic).

## Architecture

### Components to Create

| Component | Path | Purpose |
|---|---|---|
| `knowledge-seeds-<category>.ts` × ~7 | `server/src/services/` | Domain-grouped seeds (specific count + names determined by impl audit) |

### Components to Modify

| File | Change | Why |
|---|---|---|
| `server/src/services/knowledge-seeds.ts` | Strip data; replace with aggregator that imports + concatenates domain files | Becomes thin aggregator preserving the public API |

## Edge Cases

| Case | Behavior |
|---|---|
| Total seed count differs after split | Implementer must verify: `master_count = seeds + sopTemplates`. New aggregator must yield same totals. Run `getKnowledgeSeeds().seeds.length` test if needed. |
| Order matters in `knowledge.ts` consumption | Audit during impl. If consumer lookup is title-based, order is cosmetic. If positional, preserve master order via concat order. |
| Two seeds share a title across domains | Should not happen — titles are documents. If found, implementer flags. |
| Caller imports `KnowledgeSeed` type from the file | Type stays exported from `knowledge-seeds.ts` for back-compat. |

## Constraints

- No semantic change. All seed bodies move byte-identical.
- No `as any`, no `@ts-ignore`.
- No new dependencies.
- ESM `.js` extensions on relative imports.
- `getKnowledgeSeeds()` signature preserved (returns `{ seeds, sopTemplates }`).
- `KnowledgeSeed` type still exported from `knowledge-seeds.ts`.
- Test count delta: 0.

## Testing Strategy

- Existing tests (if any directly test seed content) hit `getKnowledgeSeeds()` and remain valid — same return shape.
- `pnpm --filter @ironworksai/server test` passes unchanged.
- `pnpm -r typecheck` and `pnpm -r build` pass.
- Sanity check: `getKnowledgeSeeds().seeds.length` and `.sopTemplates.length` match master counts.

## Rollout

- Single PR. No feature flag.
- Migration: none.
- Risk: VERY LOW. Pure data move. The only failure modes are (a) drop a seed, (b) corrupt a body via copy-paste, (c) wrong concat order. All are caught by visual inspection + total count check.
- Verify before merge: caller's behavior unchanged; full server suite green.

## Out of Scope (Revisit Later)

- Moving seed bodies to actual `.md` files in a folder structure (more work; preserve TS for now).
- Refactoring the `getKnowledgeSeeds()` consumer to use lazy loading (currently loads all seeds at startup).
- Deduplicating any near-duplicate seed bodies.

## Open Questions

None — the pattern is clear; specifics emerge from the implementer's title classification.

---

## Implementation Handoff

Ready for `/subagent-dev`. Estimated effort: ~2-3 hours mechanical classification + file creation + verification. Single PR. Risk: VERY LOW.

After ship: `services/knowledge-seeds.ts` is a ~30 LOC aggregator. Backlog task #18 closes — last item from the original 30-task audit. Then the memory upgrade project (`ironworks-memory-upgrade.md`) becomes the next focus.
