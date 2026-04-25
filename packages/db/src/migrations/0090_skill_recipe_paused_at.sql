-- Migration 0090: add paused_at to skill_recipes for per-recipe pause/resume.
--
-- A non-null paused_at means the recipe is temporarily suspended from
-- injection. The matcher's candidate query filters WHERE paused_at IS NULL
-- so paused recipes are silently skipped without changing their status
-- (they remain 'active' and resume immediately when the column is cleared).
--
-- This is intentionally additive with no FK and no cascade rules.
-- Pause/resume is a runtime operator control, not a lifecycle transition.
--
-- @see MDMP §4 PR #6 scope: "per-recipe pause/resume".

ALTER TABLE skill_recipes
  ADD COLUMN IF NOT EXISTS paused_at timestamptz;

-- Partial index: fast lookup of paused recipes for the circuit breaker and
-- the runaway detector's auto-pause path.
CREATE INDEX IF NOT EXISTS skill_recipes_paused_idx
  ON skill_recipes (company_id)
  WHERE paused_at IS NOT NULL;
