# Agent Chat Architecture - Implementation Plan

**Status:** IMPLEMENTED 2026-05-07 (router shipped earlier; safeguards in PR for #21+#22 close-out)
**Author:** Claude + Anouar
**Date:** 2026-04-08

## What landed vs what was speculative

The channel response router (`server/src/services/channel-router.ts`), the score-based agent selection, the 10-min / 3-response soft cap, and the agent-message prefix strip all shipped in earlier PRs alongside migration `0080_channel_response_state.sql`. The two remaining Layer 3 safeguards from this plan - the **per-agent 5-min cooldown** and the **hard 20-responses-per-channel-per-hour circuit breaker** - shipped in PR `feat/channel-router-safeguards` (migration `0095_channel_response_state_safeguards.sql`). The Matrix room mapping bullet was struck rather than implemented: no Matrix bridge exists in `server/src/bridges/`, and the bullet was speculative scaffolding for an integration that was never built. Tasks #21 and #22 close as done with this PR.

---

## Problem Statement

The current agent chat implementation is broken:
1. Agents either don't respond to channel messages (no conversational capability)
2. OR they cascade into infinite loops (agent posts -> wakes agents -> they post -> wakes more)
3. Nolan bridge duplicates Matrix messages and accumulates `**Nolan Calloway:**` prefixes
4. No turn management - all agents respond simultaneously
5. No relevance filtering - every agent responds to every message

## Research Summary

Studied AutoGen GroupChat, LangGraph Supervisor, OpenAI Swarm, Slack/Discord bot patterns. Key finding: **all frameworks use a single-speaker-per-turn model with explicit routing.** No framework allows free-fire where every agent independently decides to respond.

## Architecture Design

### Layer 1: Message Response Router

**Purpose:** When a human/bridge message arrives in a channel, decide which agent(s) should respond.

**Algorithm (rule-based, no LLM):**

```
On new message from human/bridge:
  1. Extract @mentions from message body
  2. IF explicit @mentions -> wake ONLY those agents
  3. IF no @mentions:
     a. Score each agent for relevance:
        - Is agent in this channel's department? (+3)
        - Does message contain keywords matching agent's role? (+2)
        - Is agent a department head for this channel? (+2)
        - Has agent responded in this thread before? (+1)
     b. Select top 1 agent (max 2 for leadership channels)
     c. If no agent scores above threshold (3) -> nobody responds
  4. Create wakeup request with sequencePosition for staggering
```

**Why rule-based, not LLM:** An LLM selector call costs tokens and adds 2-5s latency before anyone can start responding. Rules are instant and predictable.

### Layer 2: Turn Management

**Purpose:** Prevent simultaneous responses and ensure natural conversation flow.

**Implementation:**
- Each wakeup gets a `sequencePosition` (1, 2)
- Position 1 agent wakes immediately
- Position 2 agent wakes only AFTER position 1's run completes
- Max 2 agent responses per human message (not 3, not 12)

### Layer 3: Loop Prevention (Hard Rules)

**These are non-negotiable:**

| Rule | Implementation |
|------|---------------|
| Agent messages NEVER trigger wakeups | `postMessage()` skips wake logic when `authorAgentId` is set |
| Max 3 agent messages per channel per 10-min window | Counter in `channel_thread_state` table |
| Human message resets the window | Update `last_human_message_at` on human post |
| Cooldown after responding | Agent can't be woken for same channel for 5 min |
| Hard circuit breaker | Max 20 agent messages per channel per hour total |

### Layer 4: Nolan Bridge Fix

**Current bugs:**
1. `**Nolan Calloway:**` prefix accumulates on every relay
2. Same message posted to multiple IronWorks channels
3. No channel mapping between Matrix rooms and IronWorks channels

**Fix:**
- Strip the `**Author:**` prefix from bridge messages before posting (author is already in the `authorUserId`/`authorAgentId` field)
- Add a Matrix room -> IronWorks channel mapping config
- Don't broadcast to all channels - each Matrix room maps to exactly one IronWorks channel

### Layer 5: Natural Feel

- Stagger response timing: 2-5 second delay before agent responds (randomized)
- "Typing" indicator via live event while agent is generating
- Agents don't respond with "acknowledged" or "standing by" - only substantive responses
- If nothing requires response, agent stays silent

---

## Database Changes

```sql
-- Thread-level rate limiting for agent responses
CREATE TABLE IF NOT EXISTS channel_response_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES agent_channels(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  agent_response_count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  last_human_message_at timestamptz,
  last_agent_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(channel_id)
);

-- Add sequence position to wakeup requests (if not exists)
-- ALTER TABLE agent_wakeup_requests ADD COLUMN IF NOT EXISTS sequence_position integer DEFAULT 0;
```

---

## Files to Create/Modify

### New Files
1. `server/src/services/channel-router.ts` (~150 lines)
   - `selectRespondingAgents(db, channelId, message, agents)` -> returns 0-2 agent IDs with sequence positions
   - `shouldAgentRespond(db, channelId, agentId)` -> checks cooldown and rate limits
   - `recordAgentResponse(db, channelId)` -> increments counter, updates timestamps

### Modified Files
2. `server/src/services/channels.ts`
   - Replace the current "wake max 3 idle agents" block with `channelRouter.selectRespondingAgents()`
   - Strip accumulated `**Author:**` prefixes from bridge messages before storage

3. `server/src/services/heartbeat-context.ts`
   - No changes needed (channel message injection is correct)

4. `server/src/services/heartbeat-awareness.ts`
   - No changes needed (platform awareness prompt is correct)

5. `server/src/adapters/ollama-cloud/execute.ts`
   - No changes needed (check-in prompt for idle agents is correct)

6. `server/src/routes/channels.ts` (if Nolan bridge route exists)
   - Add Matrix room -> channel mapping
   - Strip author prefix from bridge-relayed messages

### Migration
7. `packages/db/src/migrations/XXXX-channel-response-state.ts`
   - Create `channel_response_state` table

---

## Implementation Order

| Step | What | Depends On | Risk |
|------|------|-----------|------|
| 1 | Create migration for `channel_response_state` table | Nothing | Low |
| 2 | Build `channel-router.ts` with rule-based agent selection | Step 1 | Low |
| 3 | Replace wake logic in `channels.ts` with router | Step 2 | Medium |
| 4 | Fix Nolan bridge prefix accumulation | Nothing | Low |
| 5 | Add Matrix room -> channel mapping | Step 4 | Low |
| 6 | Add staggered response timing | Step 3 | Low |
| 7 | Test with 1 agent first, then 3, then all | Steps 1-6 | Low |
| 8 | Unpause agents one at a time | Step 7 | Low |

---

## Testing Strategy

1. **Unit test `channel-router.ts`** - test agent selection with mock data
2. **Test with Marcus only** - unpause Marcus, post in #leadership, verify he responds once and stops
3. **Test with Marcus + Viktor** - verify turn management (Marcus first, Viktor waits)
4. **Test loop prevention** - post 5 rapid messages, verify max 3 agent responses
5. **Test silence** - post in #engineering about marketing, verify no engineer responds (irrelevant)
6. **Test @mention** - post "@Diane can you check this", verify only Diane wakes

---

## What We're NOT Building

- No LLM-based routing (too slow, too expensive, not needed for 12 agents)
- No agent-to-agent free-form chat in channels (agents communicate through issues and deliberations)
- No pub/sub system (overkill for single-server)
- No AutoGen/LangGraph dependency (our stack is TypeScript, their value is the pattern not the library)
- No persistent conversation threads (use existing `replyToId` chains)

---

## Success Criteria

- [ ] Human posts in #leadership -> 1-2 relevant agents respond within 30 seconds
- [ ] Agent responses don't trigger other agents
- [ ] Max 3 agent responses per channel per 10-minute window
- [ ] No `**Nolan Calloway:**` prefix spam
- [ ] Matrix room messages map to correct IronWorks channel (not broadcast)
- [ ] Silence when no agent is relevant to the message
- [ ] All 944 tests still pass
- [ ] No cascade loops under any conditions
