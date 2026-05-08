import type { KnowledgeSeed } from "./knowledge-seeds.js";

export const sopSeeds: KnowledgeSeed[] = [
  {
    title: "SOP: Code Review Standard Operating Procedure",
    body: `# Code Review Standard Operating Procedure

## Purpose

Ensure all code changes meet quality, security, and consistency standards before merging.

## Scope

Applies to all engineering agents submitting code changes to any project repository.

## Prerequisites

- Reviewer has read access to the target project
- Code changes are in a pull request or equivalent review format
- All automated tests have passed before review begins

## Steps

1. **Read the PR description** - understand what changed and why before looking at code.
2. **Check scope** - verify the change matches the associated issue. Flag scope creep.
3. **Review architecture** - confirm the approach is consistent with existing patterns.
4. **Check error handling** - ensure system boundaries have proper error handling.
5. **Verify security** - no hardcoded secrets, user input is validated, SQL is parameterized.
6. **Review tests** - changes should include tests for new behavior and regression coverage.
7. **Check naming and clarity** - functions, variables, and files should have clear names.
8. **Leave actionable feedback** - explain the problem, suggest a solution, reference standards.
9. **Approve or request changes** - do not approve with unresolved critical feedback.

## Checklist

- [ ] PR description explains the change and links to an issue
- [ ] No new dependencies added without justification
- [ ] No secrets, credentials, or PII in the diff
- [ ] Error handling at system boundaries
- [ ] Tests cover the new behavior
- [ ] Code follows the project Engineering Standards
- [ ] No commented-out code left behind

## Escalation

If the reviewer and author cannot agree on an approach, escalate to the CTO for a final decision.`,
  },
  {
    title: "SOP: Incident Response Procedure",
    body: `# Incident Response Procedure - SOP

## Purpose

Define a repeatable process for identifying, containing, and resolving production incidents.

## Severity Classification

| Level | Definition | Response Time |
|---|---|---|
| P1 | Service down, all users affected | Immediate |
| P2 | Major feature broken, many users affected | Within 1 hour |
| P3 | Minor feature broken, workaround exists | Within 4 hours |
| P4 | Cosmetic or low-impact issue | Next business day |

## Response Steps

### 1. Detection and Triage (0-10 minutes)
- Confirm the issue is real (not a false alarm or monitoring noise)
- Classify severity using the table above
- Create an issue with priority matching severity, prefixed with severity level
- Assign an incident commander (CTO for P1, senior engineer for P2+)

### 2. Communication (10-15 minutes)
- Notify the team via the appropriate channel
- For P1/P2: notify CEO immediately
- Update the issue with initial findings

### 3. Investigation (15-45 minutes)
- Check recent deployments for potential causes
- Review error logs, metrics, and monitoring dashboards
- Identify the blast radius (which users/features are affected)
- Document findings in the issue as you go

### 4. Containment and Fix
- For P1/P2: hotfix path, skip standard review if necessary
- Always have a rollback plan before deploying
- Deploy the fix and verify the symptoms are resolved
- Monitor for 30 minutes after the fix

### 5. Postmortem (within 24 hours)
- Write a postmortem: timeline, root cause, impact, action items
- No blame - focus on systems and processes
- Store the postmortem in the Knowledge Base
- Assign follow-up action items with owners and due dates

## Checklist

- [ ] Incident confirmed and severity classified
- [ ] Issue created and incident commander assigned
- [ ] Stakeholders notified per severity level
- [ ] Root cause identified or escalated
- [ ] Fix deployed and verified
- [ ] Postmortem written within 24 hours
- [ ] Action items assigned with due dates`,
  },
  {
    title: "SOP: New Hire Onboarding Checklist",
    body: `# New Hire Onboarding Checklist - SOP

## Purpose

Ensure every new agent is properly configured, trained, and productive within their first week.

## Owner

VP of HR owns this process. The hiring manager (direct report) is responsible for role-specific onboarding.

## Day 1

- [ ] SOUL.md written with role-specific instructions (not generic boilerplate)
- [ ] AGENTS.md updated with clear ownership boundaries and collaboration rules
- [ ] Skills assigned from the company skill pool
- [ ] Reporting line set in the Org Chart
- [ ] At least one starter issue assigned (simple task to validate configuration)
- [ ] Project access configured for required projects
- [ ] Budget limits set appropriate for the role and model tier

## Week 1

- [ ] Agent has completed at least one task successfully
- [ ] Output quality reviewed by their direct manager
- [ ] Agent can access all required projects and resources
- [ ] Agent has accessed the Knowledge Base for relevant documentation
- [ ] Cost per task is within expected range for their role and model
- [ ] No repeated failures or error patterns in run transcripts

## Month 1

- [ ] Agent rating is C or above on the Performance page
- [ ] No unresolved blockers or repeated failure patterns
- [ ] Manager has confirmed the agent is productive
- [ ] Skills inventory reviewed and updated based on actual work
- [ ] First performance check-in documented

## Troubleshooting

If the new agent cannot complete their first task within 24 hours:

1. Check the run transcript for adapter or configuration errors
2. Review SOUL.md for unclear or contradictory instructions
3. Verify the model is appropriate for the task complexity
4. Try assigning a simpler, more isolated task
5. Check project access and permissions
6. If nothing works, terminate and recreate with adjusted configuration

## Sign-off

| Step | Completed By | Date |
|---|---|---|
| Day 1 setup | VP of HR | |
| Week 1 review | Hiring manager | |
| Month 1 review | VP of HR + Manager | |`,
  },
];
