-- Migration 0089: skill loop — recipes, invocations, evaluations tables + company_skills additions.
--
-- Establishes the staging + history layer for AI-proposed skill recipes.
-- No execution path is wired in this migration; subsequent PRs add the
-- extraction service, operator UI, matcher, and evaluation rollup.
--
-- Design notes:
-- - skill_recipes is the staging and provenance table. Approved recipes are
--   materialised into company_skills (origin='extracted', recipe_id=this row).
--   The existing skill loader at heartbeat.ts reads company_skills unchanged.
-- - skill_invocations records each prompt injection for counterfactual measurement.
--   outcome='inflight' until heartbeat-post-run settles it.
-- - skill_evaluations is the rolling weekly aggregate populated by a nightly cron.
--   Unique on (recipe_id, window_start) so re-runs are idempotent.
-- - company_skills.recipe_id uses ON DELETE SET NULL so deleting a recipe row
--   does not cascade-destroy an already-live skill.
-- - approved_by_user_id in skill_recipes is TEXT (not UUID) to match the
--   better-auth "user" table which uses TEXT primary keys.
-- - The GIN index on applicable_role_titles enables the matcher's role-filter
--   query to skip the full array scan on large recipe sets.
--
-- Authorization is app-layer only (assertBoard + assertCompanyAccess). No RLS —
-- consistent with every other production table in this codebase.

CREATE TABLE skill_recipes (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid        NOT NULL REFERENCES companies(id),
  source_skill_id       uuid,
  proposed_by_agent_id  uuid        REFERENCES agents(id),
  source_issue_id       uuid        REFERENCES issues(id),
  source_run_id         uuid        REFERENCES heartbeat_runs(id),
  title                 text        NOT NULL,
  trigger_pattern       text        NOT NULL,
  procedure_markdown    text        NOT NULL,
  rationale             text,
  applicable_role_titles text[]     NOT NULL DEFAULT '{}',
  status                text        NOT NULL DEFAULT 'proposed',
  rejection_reason      text,
  confidence            integer     NOT NULL DEFAULT 50,
  extractor_model       text        NOT NULL,
  approved_by_user_id   text,
  approved_at           timestamptz,
  archived_at           timestamptz,
  last_validated_at     timestamptz DEFAULT now(),
  metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX skill_recipes_company_status_idx
  ON skill_recipes(company_id, status);

-- GIN index for the matcher's role-filter: WHERE company_id = $1 AND applicable_role_titles @> ARRAY[$role]
CREATE INDEX skill_recipes_applicable_roles_gin_idx
  ON skill_recipes USING GIN (applicable_role_titles);

CREATE TABLE skill_invocations (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  uuid        NOT NULL REFERENCES companies(id),
  recipe_id                   uuid        NOT NULL REFERENCES skill_recipes(id),
  agent_id                    uuid        NOT NULL REFERENCES agents(id),
  heartbeat_run_id            uuid        REFERENCES heartbeat_runs(id),
  issue_id                    uuid        REFERENCES issues(id),
  matcher_score               numeric(4,3),
  matcher_model               text        NOT NULL,
  injected_at                 timestamptz NOT NULL DEFAULT now(),
  outcome                     text,
  expected_runs_to_completion numeric,
  actual_runs_to_completion   integer,
  operator_thumbs             integer,
  notes                       text
);

CREATE INDEX skill_invocations_recipe_idx
  ON skill_invocations(recipe_id, injected_at DESC);

CREATE INDEX skill_invocations_company_outcome_idx
  ON skill_invocations(company_id, outcome);

CREATE TABLE skill_evaluations (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid        NOT NULL REFERENCES companies(id),
  recipe_id            uuid        NOT NULL REFERENCES skill_recipes(id),
  window_start         timestamptz NOT NULL,
  window_end           timestamptz NOT NULL,
  invocations_count    integer     NOT NULL,
  completed_count      integer     NOT NULL,
  failed_count         integer     NOT NULL,
  reopen_count         integer     NOT NULL,
  effectiveness_delta  numeric(5,4),
  operator_thumbs_avg  numeric(4,3),
  computed_at          timestamptz NOT NULL DEFAULT now()
);

-- Unique on (recipe_id, window_start) so the nightly rollup can upsert idempotently.
CREATE UNIQUE INDEX skill_evaluations_recipe_window_idx
  ON skill_evaluations(recipe_id, window_start);

-- Add provenance + recipe back-reference to the live skill store.
ALTER TABLE company_skills
  ADD COLUMN IF NOT EXISTS origin    text DEFAULT 'authored' NOT NULL,
  ADD COLUMN IF NOT EXISTS recipe_id uuid REFERENCES skill_recipes(id) ON DELETE SET NULL;

-- Wire the back-reference on skill_recipes now that company_skills.id exists.
-- source_skill_id intentionally left unkeyed at creation time (circular FK resolved here).
ALTER TABLE skill_recipes
  ADD CONSTRAINT skill_recipes_source_skill_id_fkey
  FOREIGN KEY (source_skill_id) REFERENCES company_skills(id) ON DELETE SET NULL;
