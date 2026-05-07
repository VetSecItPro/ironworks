# Design Spec: Channel Response Router — Per-Agent Cooldown + Hourly Circuit Breaker

**Date:** 2026-05-07
**Approach:** Extend existing `channel_response_state` with two new tracking dimensions, no new tables.
**Status:** AWAITING APPROVAL

---

## Problem

The channel response router (`server/src/services/channel-router.ts`, shipped in earlier work along with migration `0080_channel_response_state.sql`) implements 5 of the 7 loop-prevention rules from `agent-chat-plan.md`. Two safeguards are still missing:

1. **No per-agent cooldown.** The current rate limit is channel-wide (max 3 agent responses per 10-min window). An agent that just responded can be re-woken for the same channel within 30s if a new human posts. Risk: a single chatty agent monopolizes a channel.

2. **No hard circuit breaker.** The 10-minute window resets on every human message (`recordHumanMessage` zeroes the counter). A noisy human channel — say, a board sprint planning session with 5 humans posting 30 messages per hour — could leak well past 20 agent responses per hour, contradicting the plan's "max 20 agent messages per channel per hour total" rule.

Both gaps were called out in `agent-chat-plan.md` (Layer 3 — "These are non-negotiable") but never landed.

## Goal

Close both gaps with the smallest viable change. Concretely:

- An agent that has responded to a channel within the last 5 minutes is filtered out of the candidate set on subsequent human messages — even if it scores highly.
- A channel that has accumulated 20 agent responses in the last 60 minutes blocks all new agent responses (including @mentions) until the rolling hour clears, regardless of how many human messages reset the 10-min window.

## Non-Goals

- Not introducing per-agent global rate limits (this is a per-channel concern; the existing heartbeat scheduler handles per-agent cadence).
- Not changing the existing 10-min / 3-response soft cap behavior — operators have validated it; we're layering on top.
- Not adding configuration UI; the limits are constants in `channel-router.ts` (operators can patch and redeploy if they need to tune).
- Not building a Matrix bridge — the `agent-chat-plan.md` mention of Matrix room mapping is speculative; no Matrix bridge exists in `server/src/bridges/`. The bullet is being struck from the plan rather than implemented.

## Approach

Extend `channel_response_state` (one row per channel) with two new tracked dimensions:

1. **`hourly_agent_response_count` (integer)** + **`hourly_window_start` (timestamptz)** — counts agent responses in a rolling 60-min window. NOT reset by human messages. When `hourly_window_start` is older than 60 min, reset to 1 on next agent response.

2. **`agent_last_responded_at` (jsonb)** — map of `agentId → ISO timestamp` of that agent's last response in this channel. Used by the per-agent cooldown filter. Pruned to last hour at write time to bound size.

Both fields are added via a forward migration. The existing fields stay unchanged. `recordHumanMessage` does NOT touch the new fields (their windows are independent of human activity).

`selectRespondingAgents` gains two filter steps:

- After Rule 2 (channel-wide rate limit) and before Rule 3 (@mentions): check hourly circuit breaker. If `hourly_agent_response_count >= 20` and `hourly_window_start` is within 60 min, return `[]`. Logs `circuit_breaker=hit` for observability.
- After candidate set is selected (mention or scoring path): filter out agents whose `agent_last_responded_at[agentId]` is within 5 min. If filter empties the candidate set, return `[]`.

`recordAgentResponse` updates the new fields on each agent response: increments `hourly_agent_response_count` (or resets if window expired), sets `agent_last_responded_at[agentId] = now()`, prunes entries older than 1 hour from the map.

## Architecture

### Components to Modify

| File | Change | Why |
|---|---|---|
| `packages/db/src/schema/channel_response_state.ts` | Add `hourlyAgentResponseCount` (integer, default 0), `hourlyWindowStart` (timestamptz, defaultNow), `agentLastRespondedAt` (jsonb, default `{}`) | Extend the row to track new dimensions |
| `packages/db/src/migrations/0095_channel_response_state_safeguards.sql` (new) | `ALTER TABLE channel_response_state ADD COLUMN hourly_agent_response_count integer NOT NULL DEFAULT 0, ADD COLUMN hourly_window_start timestamptz NOT NULL DEFAULT now(), ADD COLUMN agent_last_responded_at jsonb NOT NULL DEFAULT '{}'::jsonb;` | Forward-only schema add. Existing rows backfill to defaults. |
| `server/src/services/channel-router.ts` | Add `checkHourlyCircuitBreaker(state)`, `filterCooledDownAgents(candidates, state, now)` helpers; extend `selectRespondingAgents` to call them; extend `recordAgentResponse` signature to accept `agentId` and write the new fields. Update `channels.ts` caller to pass `agentId`. | Wire safeguards into the existing routing pipeline. |
| `server/src/services/channels.ts` | Update `recordAgentResponse` call sites (lines around 448) to pass the responding agent's id. | Signature change. |
| `server/src/__tests__/channel-router.test.ts` (new, OR extend `channels.test.ts`) | Add ~10 unit tests for the two safeguards. | TDD — fail first, then pass. |

### Data Model

```typescript
// packages/db/src/schema/channel_response_state.ts (extended)
export const channelResponseState = pgTable("channel_response_state", {
  // ... existing fields unchanged ...
  hourlyAgentResponseCount: integer("hourly_agent_response_count").notNull().default(0),
  hourlyWindowStart: timestamp("hourly_window_start", { withTimezone: true }).notNull().defaultNow(),
  agentLastRespondedAt: jsonb("agent_last_responded_at").$type<Record<string, string>>().notNull().default({}),
});
```

### New Constants

```typescript
// channel-router.ts
const PER_AGENT_COOLDOWN_MS = 5 * 60 * 1000;   // 5 minutes
const HOURLY_CIRCUIT_BREAKER_LIMIT = 20;
const HOURLY_WINDOW_MS = 60 * 60 * 1000;        // 60 minutes
```

## User Flow (illustrative)

**Scenario A: chatty agent gets cooled down**

1. Human posts in #leadership: "what about marketing strategy?"
2. Router scores Marcus (CEO) high; Marcus responds.
3. `recordAgentResponse(channelId, companyId, agentId=Marcus)` records `agent_last_responded_at[Marcus] = T0`.
4. Two minutes later, Human posts again: "and pricing?"
5. Router scores Marcus high again — but per-agent cooldown filter excludes him (T0 + 2min < 5min cooldown).
6. Next-highest-scoring agent (Diane CFO) responds instead. Marcus stays silent.
7. Six minutes after T0, Human posts a third time. Marcus is eligible again (cooldown elapsed).

**Scenario B: hourly circuit breaker fires**

1. Active sprint planning channel: 6 humans posting 40 messages over 50 min, with the router selecting agents responsively.
2. After 20 agent responses (well-distributed), `hourly_agent_response_count = 20`.
3. New human message arrives. `selectRespondingAgents` checks circuit breaker → returns `[]` immediately (logs `circuit_breaker=hit`).
4. Channel goes silent from agents until 60 min after the window started.
5. After window expires, next human message resets `hourly_window_start = now`, `hourly_agent_response_count = 0`, and routing resumes normally.

## Edge Cases

| Case | Behavior |
|---|---|
| First-ever message in a channel (no row yet) | `recordHumanMessage` creates the row with default new fields; routing runs unconstrained |
| @mention of an agent currently in cooldown | Filter still applies — explicit @mentions don't override cooldown. Rationale: @mentions are usually retries when an agent didn't respond well; spamming a cooled-down agent doesn't help. |
| @mention of an agent when circuit breaker has fired | Returns `[]` — circuit breaker is hard. Rationale: a stuck channel needs a human pause, not a way around the brake. |
| Agent responds, deletes their message, human posts again | Cooldown still applies (we don't track deletions; the response-attempt was made). Acceptable. |
| `agent_last_responded_at` map grows large | Pruned to last 60 min on every `recordAgentResponse` write. With 12 agents × 1 entry each, max payload is ~600 bytes — well under any practical limit. |
| Clock skew between server and DB | All comparisons use `Date.now() - new Date(stored).getTime()`. Single-instance deploy — no cross-node skew. |

## Constraints

- No new dependencies.
- No `as any`, no `@ts-ignore`.
- Migration is forward-only; existing rows backfill to safe defaults.
- All new code paths must be unit-testable without a real DB (existing tests use mocked Drizzle).

## Testing Strategy

**Unit tests in `server/src/services/channel-router.test.ts` (new file) or extending `channels.test.ts`:**

1. `selectRespondingAgents` filters out an agent whose `agent_last_responded_at[agentId]` is within 5 min
2. ...allows the same agent after 5+ min have elapsed
3. ...returns `[]` when `hourly_agent_response_count >= 20` and window is fresh
4. ...resumes when `hourly_window_start` is older than 60 min
5. ...applies cooldown filter even for @mentioned agents
6. ...applies circuit breaker even for @mentioned agents
7. `recordAgentResponse` records `agent_last_responded_at[agentId] = now`
8. ...increments `hourly_agent_response_count`
9. ...resets `hourly_agent_response_count` to 1 when window has expired
10. ...prunes `agent_last_responded_at` entries older than 60 min

**Integration test in `channels.test.ts`:**

11. Posting 21 successive (different-author) human messages, with mocked router accepting all, results in exactly 20 agent wakeups (the 21st blocks via circuit breaker).

Total: +11 tests. Existing 9 channel-router tests remain green.

## Rollout

- Single PR. Migration runs at next server start (idempotent: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` semantics via Drizzle's `applyPendingMigrations`).
- No feature flag — the change is fail-closed (more conservative routing, never less). Risk of false silences exists but is much smaller than the noisier-loops risk we're closing.
- Observable via `logger.debug` lines: `cooldown_filter_excluded` and `circuit_breaker_hit` are logged when a candidate is filtered out. Operators can grep container logs to validate the safeguards are active.

## Out of Scope (Revisit Later)

- Per-channel configurable limits (admin UI). Hardcoded constants are fine for dogfood.
- Cross-channel agent rate limit (e.g., one agent can't respond in 5 channels simultaneously). Existing heartbeat scheduler already serializes agent runs.
- Matrix bridge integration. Not built; speculation in the original plan.
- Updating `agent-chat-plan.md` to "IMPLEMENTED" status — done in this PR but separate from the design.

## Open Questions

None — design is concrete and matches the plan's original Layer 3 spec.

---

## Implementation Handoff

Ready for `/subagent-dev docs/brainstorm/specs/2026-05-07-channel-router-safeguards-design.md`.

Estimated effort: ~80 LOC source + ~120 LOC tests + 1 short migration. ~1 PR. Risk: LOW.

After ship: tasks #21 and #22 close as ✅ in the backlog (the parts not already shipped land here, the parts already shipped get cross-referenced in the PR body).
