-- SEC-CHAOS-005: allow issue hard-delete by detaching historical cost/skill/finance rows.
-- These tables retain rows after their referenced issue is removed (issueId becomes NULL),
-- preserving the audit trail while letting the parent issue delete succeed.

ALTER TABLE skill_invocations ALTER COLUMN issue_id DROP NOT NULL;
ALTER TABLE skill_invocations DROP CONSTRAINT IF EXISTS skill_invocations_issue_id_fkey;
ALTER TABLE skill_invocations DROP CONSTRAINT IF EXISTS skill_invocations_issue_id_issues_id_fk;
ALTER TABLE skill_invocations
  ADD CONSTRAINT skill_invocations_issue_id_fkey
  FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE SET NULL;

ALTER TABLE cost_events ALTER COLUMN issue_id DROP NOT NULL;
ALTER TABLE cost_events DROP CONSTRAINT IF EXISTS cost_events_issue_id_fkey;
ALTER TABLE cost_events DROP CONSTRAINT IF EXISTS cost_events_issue_id_issues_id_fk;
ALTER TABLE cost_events
  ADD CONSTRAINT cost_events_issue_id_fkey
  FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE SET NULL;

ALTER TABLE finance_events ALTER COLUMN issue_id DROP NOT NULL;
ALTER TABLE finance_events DROP CONSTRAINT IF EXISTS finance_events_issue_id_fkey;
ALTER TABLE finance_events DROP CONSTRAINT IF EXISTS finance_events_issue_id_issues_id_fk;
ALTER TABLE finance_events
  ADD CONSTRAINT finance_events_issue_id_fkey
  FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE SET NULL;
