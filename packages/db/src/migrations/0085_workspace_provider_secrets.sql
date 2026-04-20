-- Migration 0085: workspace_provider_secrets table.
--
-- Stores per-company (workspace) API keys for HTTP provider adapters
-- (poe_api, anthropic_api, openai_api, openrouter_api). Keys are stored
-- encrypted with AES-256-GCM envelope encryption: a random DEK encrypts the
-- plaintext, and the DEK itself is encrypted with the server-side KEK
-- (IRONWORKS_SECRETS_KEK_B64). Both layers use distinct IVs and auth tags.
--
-- RLS helpers reference company_memberships to scope reads to members and
-- writes to owners/admins. The anon role has zero access.
--
-- "workspace" in column names maps to what IronWorks calls a "company".

CREATE TABLE workspace_provider_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('poe_api','anthropic_api','openai_api','openrouter_api')),
  -- AES-256-GCM ciphertext of the API key (encrypted with DEK)
  encrypted_key bytea NOT NULL,
  -- AES-256-GCM ciphertext of the DEK (encrypted with KEK)
  encrypted_dek bytea NOT NULL,
  -- 12-byte IV used when encrypting the DEK with the KEK
  dek_iv bytea NOT NULL,
  -- 16-byte auth tag from DEK encryption (GCM tag)
  dek_auth_tag bytea NOT NULL,
  -- 12-byte IV used when encrypting the plaintext key with the DEK
  key_iv bytea NOT NULL,
  -- 16-byte auth tag from key encryption (GCM tag)
  key_auth_tag bytea NOT NULL,
  -- Last 4 chars of the plaintext API key for UI display (never the full key)
  key_last_four varchar(4) NOT NULL,
  last_tested_at timestamptz,
  last_test_status text CHECK (last_test_status IN ('pass','fail','pending')),
  last_test_error text,
  created_by_user_id text REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz,
  UNIQUE (company_id, provider)
);

CREATE INDEX idx_wps_company ON workspace_provider_secrets(company_id);

-- Authorization is enforced at the application layer (routes/providers.ts uses
-- assertBoard + assertCompanyAccess + assertOwnerOrOperator per verb). This
-- follows IronWorks convention — no other production table in this codebase
-- uses PostgreSQL RLS, and the company_memberships schema uses
-- (principal_type, principal_id) rather than a user_id column, which makes
-- a RLS policy subtle to get right. If RLS is added later as defense-in-depth,
-- it should key on principal_type='user' AND principal_id = current_setting(...)
-- populated from the app session, not current_user (which is the DB role).
