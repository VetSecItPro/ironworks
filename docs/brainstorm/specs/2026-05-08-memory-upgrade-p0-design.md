# Design Spec: Memory Upgrade Phase 0 — Embeddings Pipeline + Frontmatter Normalization

**Date:** 2026-05-08
**Approach:** B — Async queue + worker, comprehensive scope
**Status:** APPROVED

---

## Problem

Phase 0 of the Memory + Knowledge Layer Upgrade (`ironworks-memory-upgrade.md`) closes two gaps that block every later phase:

1. **Half-built embeddings pipeline.** `agent_memory_entries.embedding` (vector(1536)) is declared in schema but never written. `agent-memory.ts:511, 738` admits "pipeline not yet active" and falls through to FTS-only retrieval. The vector tier in `getContextualMemories` is dead code. Result: agents miss semantically-related context that the architecture promises.
2. **No canonical frontmatter shape.** Each entity type (knowledge / decision / skill / agent / project / issue / run) carries ad-hoc metadata. The portability export (`company-portability-export.ts`) emits inconsistent shapes, which would make the eventual vault export (Phase 3) a mess and Dataview-style queries impossible.

Knowledge_pages also have a separate, partially-wired chunks pipeline (`knowledge_chunks`, vector(768), nomic-embed-text via Ollama Cloud). This spec keeps that pipeline as-is and adds a parallel pipeline for memory entries — provider abstraction allows future unification but does not require it now.

## Goal

After P0:

- Every new `agent_memory_entries` row gets an embedding written asynchronously within 30 seconds of creation (p95).
- Every existing nullable-embedding row is backfilled idempotently via a one-shot script.
- Tier-3 vector retrieval in `getContextualMemories` returns real cosine-similarity results, not log-and-bail.
- Knowledge pages embed too — every new/updated page enqueues a chunking + embedding job; backfill exists.
- A canonical `Frontmatter` types module exists in `packages/shared/src/types/frontmatter/` covering all 7 entity types. `company-portability-export.ts` consumes it. Existing tests pass unchanged.
- Worker is supervised (in-process scheduler, same pattern as `heartbeat`) with structured retries, dead-letter handling, and Prometheus metrics.

## Non-Goals

- ❌ NOT migrating `knowledge_chunks` from 768-dim nomic to 1536-dim OpenAI (out of scope; tracked as follow-up).
- ❌ NOT wiring `[[wikilink]]` parser, backlinks UI, or graph view (those are P1).
- ❌ NOT changing memory write semantics (no new memory types, no new categories).
- ❌ NOT adding a UI for the queue (operators read it via SQL or `/metrics`).
- ❌ NOT building re-ranking, hybrid retrieval scoring, or MMR diversification (Tier 2 + Tier 3 dedup-by-id stays as-is for P0).

## Approach

### High-level architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ MEMORY/KB WRITE PATH                                            │
│   createMemoryEntry()  ─┐                                       │
│   updateMemoryEntry()   ├─► enqueueEmbeddingJob()  ──┐          │
│   createKnowledgePage() ┘                            │          │
│   updateKnowledgePage() ─► enqueueChunkingJob() ─────┤          │
└──────────────────────────────────────────────────────┼──────────┘
                                                       ▼
                                       ┌──────────────────────────┐
                                       │  embedding_jobs (queue)  │
                                       │  + chunking_jobs (queue) │
                                       └──────────┬───────────────┘
                                                  │ poll every 5s
                                                  ▼
                                       ┌──────────────────────────┐
                                       │  EmbeddingsWorker        │
                                       │  (in-process, same       │
                                       │   process as heartbeat)  │
                                       │                          │
                                       │  EmbeddingProvider iface │
                                       │   ├─ OpenAIProvider      │
                                       │   ├─ OllamaProvider      │
                                       │   └─ NoOpProvider (test) │
                                       └──────────┬───────────────┘
                                                  │
                                                  ▼
                                       ┌──────────────────────────┐
                                       │ UPDATE agent_memory_     │
                                       │ entries SET embedding=   │
                                       │ ...                      │
                                       │                          │
                                       │ INSERT knowledge_chunks  │
                                       │ (id, page_id, embedding) │
                                       └──────────────────────────┘
```

### Provider strategy

Provider chosen at runtime via env vars. Default: OpenAI for memory (1536d), Ollama for knowledge chunks (768d, existing). Both share the `EmbeddingProvider` interface.

```
IRONWORKS_MEMORY_EMBEDDING_PROVIDER=openai     # default; alternates: ollama, noop
IRONWORKS_MEMORY_EMBEDDING_MODEL=text-embedding-3-small
IRONWORKS_CHUNK_EMBEDDING_PROVIDER=ollama      # default; preserves current behavior
IRONWORKS_CHUNK_EMBEDDING_MODEL=nomic-embed-text
OPENAI_API_KEY=sk-...                          # required if provider=openai
OLLAMA_CLOUD_URL=https://...                   # required if provider=ollama
```

If no provider is configured: writes succeed, jobs accumulate as `status=pending_provider`, worker logs a warn-once banner, FTS continues serving retrieval. System never crashes on missing config.

### Backfill

`scripts/backfill-embeddings.ts` accepts `--target=memory|chunks|both` and `--batch-size=N` (default 50). Idempotent: skips rows where `embedding IS NOT NULL`. Enqueues into the same job table the worker drains. Safe to run repeatedly. Reports progress every 100 rows.

### Tier-3 wiring

`getContextualMemories` line 723-744 currently logs and bails. Replaced with real cosine-similarity query:

```sql
SELECT * FROM agent_memory_entries
WHERE agent_id = $1
  AND archived_at IS NULL
  AND embedding IS NOT NULL
ORDER BY embedding <=> $2  -- cosine distance
LIMIT 5
```

Query embedding generated on-the-fly (synchronously, since this is read-path) by calling the same `EmbeddingProvider`. Cached in-memory by query-text hash for the request lifetime. Falls back to FTS on provider error.

### Frontmatter normalization

New module `packages/shared/src/types/frontmatter/`:

```
frontmatter/
  index.ts                  # public re-exports + discriminated union
  base.ts                   # BaseFrontmatter (id, created, updated, tags)
  knowledge.ts              # KnowledgeFrontmatter
  decision.ts               # DecisionFrontmatter
  skill.ts                  # SkillFrontmatter
  agent.ts                  # AgentFrontmatter
  project.ts                # ProjectFrontmatter
  issue.ts                  # IssueFrontmatter
  run.ts                    # RunFrontmatter
  render.ts                 # renderFrontmatter(fm): string (YAML emitter)
  parse.ts                  # parseFrontmatter<T>(md): { fm: T; body: string }
```

`company-portability-shared.ts` (existing barrel) re-exports from new module — old import paths preserved. `company-portability-export.ts` switches all entity export paths to use the canonical types. Existing tests must pass unchanged.

## Architecture

### Components to Create

| Component | Path | Purpose |
|-----------|------|---------|
| `EmbeddingProvider` interface | `server/src/services/embeddings/provider.ts` | Polymorphic provider abstraction (`embed(text: string): Promise<number[]>`, `dims: number`, `model: string`) |
| `OpenAIProvider` | `server/src/services/embeddings/providers/openai.ts` | Calls `https://api.openai.com/v1/embeddings`, model configurable, dims=1536 |
| `OllamaProvider` | `server/src/services/embeddings/providers/ollama.ts` | Wraps existing Ollama Cloud client, model=`nomic-embed-text`, dims=768 |
| `NoOpProvider` | `server/src/services/embeddings/providers/noop.ts` | Returns null array; for tests + missing-config |
| Provider factory | `server/src/services/embeddings/factory.ts` | `getMemoryProvider()` / `getChunkProvider()` from env |
| `enqueueEmbeddingJob` | `server/src/services/embeddings/queue.ts` | INSERT into `embedding_jobs` |
| `enqueueChunkingJob` | `server/src/services/embeddings/queue.ts` | INSERT into `chunking_jobs` |
| `EmbeddingsWorker` | `server/src/services/embeddings/worker.ts` | Polling loop, batch claim, provider call, write-back, retry/dead-letter |
| Worker scheduler hook | `server/src/services/embeddings/scheduler.ts` | Starts worker on app boot (after DB ready); graceful shutdown on SIGTERM |
| Backfill script | `scripts/backfill-embeddings.ts` | One-shot enqueue-all-nullables, idempotent, batched |
| `embedding_jobs` migration | `packages/db/migrations/NNNN_embedding_jobs.sql` | Table + indexes |
| `chunking_jobs` migration | `packages/db/migrations/NNNN_chunking_jobs.sql` | Table + indexes |
| Drizzle schemas | `packages/db/src/schema/embedding_jobs.ts`, `chunking_jobs.ts` | Type-safe queue rows |
| Prometheus metrics | extend `server/src/observability/metrics.ts` | `embedding_jobs_pending`, `embedding_jobs_failed_total`, `embedding_provider_latency_ms`, `embedding_provider_errors_total` |
| Frontmatter types module | `packages/shared/src/types/frontmatter/` (10 files) | Canonical types per entity + render/parse helpers |
| Worker tests | `server/src/services/embeddings/__tests__/worker.test.ts` | Unit + integration |
| Provider tests | `server/src/services/embeddings/__tests__/providers.test.ts` | Mock HTTP, verify retry/timeout/error handling |
| Queue tests | `server/src/services/embeddings/__tests__/queue.test.ts` | Enqueue/claim/complete semantics |
| Backfill test | `tests/integration/backfill-embeddings.test.ts` | End-to-end with seeded data |
| Tier-3 retrieval test | `server/src/services/__tests__/agent-memory-vector.test.ts` | Cosine similarity returns ranked results |
| Frontmatter tests | `packages/shared/src/types/frontmatter/__tests__/` | Render → parse round-trip per entity |

### Components to Modify

| File | What Changes | Why |
|------|------------|-----|
| `server/src/services/agent-memory.ts:511, 738` | Replace log-and-bail with real cosine-similarity query | Activate tier-3 |
| `server/src/services/agent-memory.ts` (extractMemoriesFromIssue, consolidateMemories, all `db.insert(agentMemoryEntries)` callsites) | Append `await enqueueEmbeddingJob(db, entry.id, 'memory')` | Wire write path |
| `server/src/services/knowledge.ts` (createPage, updatePage, restoreRevision) | Append `await enqueueChunkingJob(db, page.id)` | Wire KB write path |
| `server/src/services/company-portability-shared.ts` | Re-export from new frontmatter module; delete duplicated render/parse helpers | Single source of truth |
| `server/src/services/company-portability-export.ts` (entity export functions) | Use canonical Frontmatter types | Consistency |
| `server/src/app.ts` | Boot `embeddingsScheduler.start()` after DB ready; stop on shutdown | Lifecycle |
| `packages/db/src/schema/index.ts` | Export new schemas | Drizzle registry |
| `server/.env.example` | Document new env vars | Operator clarity |
| `CHANGELOG.md` `[Unreleased]` | "Added: async embeddings pipeline, frontmatter normalization, vector retrieval" | Release trail |

### Data Model

```typescript
// packages/db/src/schema/embedding_jobs.ts
export const embeddingJobs = pgTable("embedding_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  targetType: text("target_type").notNull(), // 'memory' | 'chunk'
  targetId: uuid("target_id").notNull(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending | claimed | done | failed | pending_provider
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  statusIdx: index("embedding_jobs_status_idx").on(t.status, t.createdAt),
  targetIdx: uniqueIndex("embedding_jobs_target_uq").on(t.targetType, t.targetId),
}));

// packages/db/src/schema/chunking_jobs.ts (mirror; targetType always 'page')
// Status flow: pending → claimed → done (or failed after MAX_ATTEMPTS=5)
```

```typescript
// packages/shared/src/types/frontmatter/base.ts
export interface BaseFrontmatter {
  id: string;
  type: EntityType; // discriminator
  title: string;
  created_at: string; // ISO 8601
  updated_at: string;
  tags?: string[];
  visibility?: "company" | "project" | "private";
}

// packages/shared/src/types/frontmatter/knowledge.ts
export interface KnowledgeFrontmatter extends BaseFrontmatter {
  type: "knowledge";
  slug: string;
  document_type?: string;
  department?: string;
  deliverable_status?: string;
  auto_generated: boolean;
  revision_number: number;
  agent_id?: string;
  project_id?: string;
}

// packages/shared/src/types/frontmatter/decision.ts
export interface DecisionFrontmatter extends BaseFrontmatter {
  type: "decision";
  decision_id: string;
  status: "proposed" | "accepted" | "superseded" | "deprecated";
  context_issue_id?: string;
  decided_by_agent_id?: string;
  alternatives_considered?: string[];
  consequences?: string[];
}

// (skill, agent, project, issue, run frontmatter follow same pattern;
//  full shapes enumerated in frontmatter/*.ts files)

export type AnyFrontmatter =
  | KnowledgeFrontmatter
  | DecisionFrontmatter
  | SkillFrontmatter
  | AgentFrontmatter
  | ProjectFrontmatter
  | IssueFrontmatter
  | RunFrontmatter;
```

### Provider Interface

```typescript
// server/src/services/embeddings/provider.ts
export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dims: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

// server/src/services/embeddings/providers/openai.ts
export class OpenAIProvider implements EmbeddingProvider {
  readonly name = "openai";
  readonly model: string;
  readonly dims = 1536;
  constructor(apiKey: string, model = "text-embedding-3-small") { ... }
  async embed(text: string): Promise<number[]> {
    // POST https://api.openai.com/v1/embeddings
    // Body: { input: text, model: this.model }
    // Retries: 3 attempts, exponential backoff (1s, 2s, 4s)
    // Timeout: 30s per attempt
    // Errors: 429 → backoff longer; 5xx → retry; 4xx (not 429) → throw
  }
  async embedBatch(texts: string[]): Promise<number[][]> {
    // OpenAI accepts up to 2048 inputs per request; chunk if needed
  }
}
```

### Worker Loop

```typescript
// server/src/services/embeddings/worker.ts
async function tick(db: Db, provider: EmbeddingProvider): Promise<void> {
  // 1. Claim batch: UPDATE embedding_jobs SET status='claimed', claimed_at=now()
  //    WHERE id IN (SELECT id FROM embedding_jobs
  //                 WHERE status='pending' AND attempts < 5
  //                 ORDER BY created_at LIMIT 25 FOR UPDATE SKIP LOCKED)
  //    RETURNING id, target_type, target_id
  // 2. Fetch source rows (memory.content or page.body)
  // 3. provider.embedBatch(texts) → number[][]
  // 4. UPDATE agent_memory_entries SET embedding=... WHERE id=...
  //    (or INSERT INTO knowledge_chunks for chunking jobs)
  // 5. UPDATE embedding_jobs SET status='done', completed_at=now()
  // 6. On error: UPDATE status='pending', attempts=attempts+1, last_error=...
  //    If attempts >= 5: status='failed' (dead letter)
}

// Polling cadence: every 5 seconds
// Concurrency: single worker per process (FOR UPDATE SKIP LOCKED keeps multi-process safe)
// Graceful shutdown: drain in-flight tick before exit
```

### API (if applicable)

No new HTTP endpoints. Operator visibility via:
- `/metrics` (Prometheus): `embedding_jobs_pending`, `embedding_jobs_failed_total`, `embedding_provider_latency_ms`, `embedding_provider_errors_total{provider,model}`
- SQL: `SELECT status, count(*) FROM embedding_jobs GROUP BY status`

## User Flow

1. Agent runs `extractMemoriesFromIssue` during heartbeat tick.
2. New row inserted into `agent_memory_entries` (`embedding=NULL`).
3. Same transaction enqueues into `embedding_jobs` (`status=pending`).
4. Heartbeat tick returns immediately — no provider latency on hot path.
5. Within 5 seconds: `EmbeddingsWorker.tick()` claims the row, calls OpenAI, writes embedding back, marks job `done`.
6. Next time `getContextualMemories` runs for that agent: tier-3 cosine-similarity query returns this entry ranked by relevance.
7. Operator runs `node scripts/backfill-embeddings.ts --target=both` once after deploy: every nullable row gets enqueued and processed in the background. Idempotent — safe to re-run.

## Edge Cases

| Case | Behavior |
|------|----------|
| Provider env unset | Writes succeed; jobs marked `pending_provider`; worker logs warn-once; retrieval falls back to FTS |
| Provider returns 429 (rate limit) | Worker backs off (10s, 30s, 60s); job stays `claimed`; reclaimed after timeout if worker dies |
| Provider returns 4xx (auth, model not found) | Job marked `failed` immediately; alert via Prometheus counter; operator action required |
| Provider returns 5xx | Retry up to 5 attempts with exponential backoff; then `failed` |
| Worker dies mid-tick | `claimed` jobs older than 5 minutes are reclaimable (`status='pending'` reset by janitor query each tick) |
| Multiple worker processes (multi-instance deploy) | `FOR UPDATE SKIP LOCKED` prevents double-processing |
| Memory entry deleted before embedding written | Job runs, target row missing, mark `failed` with `last_error='target_gone'`; not retried |
| Memory entry updated (content changes) | New job enqueued with same `(targetType, targetId)`; unique constraint upserts → reset to `pending`, attempts=0 |
| Knowledge page chunking: large body | Chunking step splits by H2 sections (existing `knowledge_chunks` standard); each chunk gets its own embedding job |
| Backfill script run twice | Second run sees rows already have `embedding NOT NULL` → skips; idempotent |
| pgvector extension missing | Tier-3 query short-circuits via `isPgvectorAvailable()`; falls to FTS; jobs still queue but `failed` on write |
| Model dimension mismatch | Provider asserts response length === `this.dims`; throws if mismatch; job goes to dead letter |
| Frontmatter parse on legacy MD without YAML header | Parser returns `{ fm: undefined, body: full markdown }`; export skips frontmatter; no crash |

## Constraints

- **No breaking changes to existing import paths.** `company-portability-shared.ts` keeps re-exporting frontmatter helpers for backward compat.
- **No latency tax on heartbeat hot path.** Embedding writes are async by construction.
- **Single primary store.** Postgres remains the source of truth (`ironworks-memory-upgrade.md` Hard Constraint #1).
- **Provider-agnostic core.** Adding Voyage/Cohere later = new `Provider` impl, no service changes.
- **Multi-tenant safety.** Every job row has `company_id`; worker writes scoped by `target_id`; no cross-tenant leakage.
- **Graceful degradation.** Missing API keys, missing pgvector, provider outages all degrade to FTS without crashing.
- **Steel Principle #3 (TDD).** Each new module ships with tests in the same PR.
- **Steel Principle #7 (no tech debt).** No `as any`, no `// TODO fix later`, no suppression.

## Testing Strategy

- **Unit:** Provider classes (mock HTTP), queue functions (in-memory DB), worker tick (mock provider + fixtures), Frontmatter render/parse round-trips for all 7 entity types.
- **Integration:** End-to-end backfill (seed 100 memories → run script → assert all embeddings populated). Tier-3 retrieval (seed embeddings → query → assert cosine ranking). Worker recovery (kill worker mid-tick → restart → claimed jobs reclaimed). Multi-process safety (two workers concurrently → no double-processing).
- **E2E (manual smoke):** Trigger memory creation via real heartbeat; observe embedding lands within 30s; observe retrieval improves on semantic-but-non-keyword query.
- **Test count:** ~45 new tests projected (8 provider, 6 queue, 10 worker, 14 frontmatter, 4 backfill, 3 retrieval).

## Rollout

1. Ship migrations + Drizzle schemas (no behavior change yet).
2. Ship provider/queue/worker code with `IRONWORKS_MEMORY_EMBEDDING_PROVIDER=noop` default — enqueue-only, no actual embeddings yet.
3. Ship frontmatter normalization (refactor; existing tests must pass).
4. Operator sets `IRONWORKS_MEMORY_EMBEDDING_PROVIDER=openai` + `OPENAI_API_KEY` → worker activates.
5. Run backfill script in production: `node scripts/backfill-embeddings.ts --target=both`.
6. Monitor `embedding_jobs_pending` (should drain), `embedding_jobs_failed_total` (should stay flat).
7. Switch tier-3 wiring on. Validate via `getContextualMemories` test fixtures + manual smoke.

No feature flag in code — provider env var IS the kill switch (`=noop` disables embeddings without re-deploy).

## Out of Scope (Revisit Later)

- **Re-ranking / hybrid scoring.** Tier 2 + Tier 3 dedup-by-id stays as-is; future work could MMR-blend FTS rank with vector similarity.
- **Knowledge_chunks 768→1536 unification.** Current schema split is intentional; a unification migration is its own project.
- **Per-tenant model overrides.** All tenants share the configured provider for now.
- **Token cost accounting.** Provider call costs go through OpenAI billing, not per-company. Future: integrate with `cost_events`.
- **Embedding deletion on memory archive.** Archived memories keep their embedding (`archivedAt IS NULL` filter excludes them from retrieval); vacuum is a future janitor.
- **Real-time embedding via LISTEN/NOTIFY.** Polling is sufficient at current scale.
- **Frontmatter validation at API boundary.** Types are TS-only for now; runtime Zod validators come with vault export (P3).

## Open Questions

None.

---

## Implementation Handoff

Ready for `/subagent-dev docs/brainstorm/specs/2026-05-08-memory-upgrade-p0-design.md`.

Task decomposition (the implementer will treat each as a single task with two-stage review):

1. **Migrations + Drizzle schemas** for `embedding_jobs` + `chunking_jobs`.
2. **Frontmatter types module** in `packages/shared/src/types/frontmatter/` (7 entity types + render/parse + tests).
3. **Provider abstraction** + OpenAI/Ollama/NoOp implementations + factory + tests.
4. **Queue layer** (`enqueueEmbeddingJob`, `enqueueChunkingJob`) + tests.
5. **EmbeddingsWorker + scheduler** lifecycle + tests + Prometheus metrics.
6. **Wire memory write paths** in `agent-memory.ts` to enqueue.
7. **Wire knowledge write paths** in `knowledge.ts` to enqueue chunking.
8. **Tier-3 vector retrieval** in `getContextualMemories` (replace log-and-bail with cosine query).
9. **Backfill script** `scripts/backfill-embeddings.ts` + integration test.
10. **Refactor `company-portability-export.ts`** to use canonical Frontmatter types (existing tests must pass).
11. **CHANGELOG + .env.example + ops runbook excerpt** in `docs/OPERATIONS.md` (already an open backlog item — extend it).

Total: 11 tasks, projected ~5-7 days of focused execution with two-stage review per task.
