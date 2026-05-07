-- Migration 0095: per-agent cooldown + hourly circuit breaker safeguards.
--
-- Adds two new dimensions to channel_response_state to close the remaining
-- Layer 3 loop-prevention rules from agent-chat-plan.md:
--
--   1. hourly_agent_response_count + hourly_window_start: hard ceiling of
--      20 agent responses per channel per 60-min rolling window. NOT reset
--      by human messages (independent of the existing 10-min soft cap).
--
--   2. agent_last_responded_at: jsonb map agentId -> ISO timestamp used to
--      enforce a 5-min per-agent cooldown so a single chatty agent can't
--      monopolize a channel via repeated re-wakeups.
--
-- Forward-only. Existing rows backfill to safe defaults via DEFAULT clauses.
-- Idempotent via ADD COLUMN IF NOT EXISTS so re-runs are safe.

ALTER TABLE channel_response_state
  ADD COLUMN IF NOT EXISTS hourly_agent_response_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hourly_window_start timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS agent_last_responded_at jsonb NOT NULL DEFAULT '{}'::jsonb;
