-- Migration 0093: per-company prompt preamble override.
--
-- SEC-PROMPT-001: instance.promptPreamble is a singleton row prepended to
-- every tenant's agent system prompt. In a multi-tenant deployment that means
-- one tenant's preamble bleeds into another tenant's agents. The fix is to
-- give each company its own preamble column; the instance-level setting
-- becomes a fallback only when the company column is null/empty.
--
-- Backwards-compatible: existing companies have NULL prompt_preamble, so the
-- heartbeat assembly falls back to the instance preamble exactly as before.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS prompt_preamble text;
