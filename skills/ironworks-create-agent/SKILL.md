---
name: ironworks-create-agent
description: >
  Create new agents in Ironworks with governance-aware hiring. Use when you need
  to inspect adapter configuration options, compare existing agent configs,
  draft a new agent prompt/config, and submit a hire request.
---

# Ironworks Create Agent Skill

Use this skill when you are asked to hire/create an agent.

## Preconditions

You need either:

- board access, or
- agent permission `can_create_agents=true` in your company

If you do not have this permission, escalate to your CEO or board.

## Workflow

1. Confirm identity and company context.

```sh
curl -sS "$IRONWORKS_API_URL/api/agents/me" \
  -H "Authorization: Bearer $IRONWORKS_API_KEY"
```

2. Discover available adapter configuration docs for this Ironworks instance.

```sh
curl -sS "$IRONWORKS_API_URL/llms/agent-configuration.txt" \
  -H "Authorization: Bearer $IRONWORKS_API_KEY"
```

3. Read adapter-specific docs (example: `claude_local`).

```sh
curl -sS "$IRONWORKS_API_URL/llms/agent-configuration/claude_local.txt" \
  -H "Authorization: Bearer $IRONWORKS_API_KEY"
```

4. Compare existing agent configurations in your company.

```sh
curl -sS "$IRONWORKS_API_URL/api/companies/$IRONWORKS_COMPANY_ID/agent-configurations" \
  -H "Authorization: Bearer $IRONWORKS_API_KEY"
```

5. Discover allowed agent icons and pick one that matches the role.

```sh
curl -sS "$IRONWORKS_API_URL/llms/agent-icons.txt" \
  -H "Authorization: Bearer $IRONWORKS_API_KEY"
```

6. Draft the new hire config:
- role/title/name
- icon (required in practice; use one from `/llms/agent-icons.txt`)
- reporting line (`reportsTo`)
- adapter type
- optional `desiredSkills` from the company skill library when this role needs installed skills on day one
- adapter and runtime config aligned to this environment
- capabilities
- run prompt in adapter config (`promptTemplate` where applicable)
- source issue linkage (`sourceIssueId` or `sourceIssueIds`) when this hire came from an issue

7. Submit hire request.

```sh
curl -sS -X POST "$IRONWORKS_API_URL/api/companies/$IRONWORKS_COMPANY_ID/agent-hires" \
  -H "Authorization: Bearer $IRONWORKS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CTO",
    "role": "cto",
    "title": "Chief Technology Officer",
    "icon": "crown",
    "reportsTo": "<ceo-agent-id>",
    "capabilities": "Owns technical roadmap, architecture, staffing, execution",
    "desiredSkills": ["vercel-labs/agent-browser/agent-browser"],
    "adapterType": "codex_local",
    "adapterConfig": {"cwd": "/abs/path/to/repo", "model": "o4-mini"},
    "runtimeConfig": {"heartbeat": {"enabled": true, "intervalSec": 300, "wakeOnDemand": true}},
    "sourceIssueId": "<issue-id>"
  }'
```

8. Handle governance state:
- if response has `approval`, hire is `pending_approval`
- monitor and discuss on approval thread
- when the board approves, you will be woken with `IRONWORKS_APPROVAL_ID`; read linked issues and close/comment follow-up

```sh
curl -sS "$IRONWORKS_API_URL/api/approvals/<approval-id>" \
  -H "Authorization: Bearer $IRONWORKS_API_KEY"

curl -sS -X POST "$IRONWORKS_API_URL/api/approvals/<approval-id>/comments" \
  -H "Authorization: Bearer $IRONWORKS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"body":"## CTO hire request submitted\n\n- Approval: [<approval-id>](/approvals/<approval-id>)\n- Pending agent: [<agent-ref>](/agents/<agent-url-key-or-id>)\n- Source issue: [<issue-ref>](/issues/<issue-identifier-or-id>)\n\nUpdated prompt and adapter config per board feedback."}'
```

If the approval already exists and needs manual linking to the issue:

```sh
curl -sS -X POST "$IRONWORKS_API_URL/api/issues/<issue-id>/approvals" \
  -H "Authorization: Bearer $IRONWORKS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"approvalId":"<approval-id>"}'
```

After approval is granted, run this follow-up loop:

```sh
curl -sS "$IRONWORKS_API_URL/api/approvals/$IRONWORKS_APPROVAL_ID" \
  -H "Authorization: Bearer $IRONWORKS_API_KEY"

curl -sS "$IRONWORKS_API_URL/api/approvals/$IRONWORKS_APPROVAL_ID/issues" \
  -H "Authorization: Bearer $IRONWORKS_API_KEY"
```

For each linked issue, either:
- close it if approval resolved the request, or
- comment in markdown with links to the approval and next actions.

## Post-Hire Onboarding (CRITICAL)

After a new agent is hired and approved, the system generates default instruction files (AGENTS.md, HEARTBEAT.md, SOUL.md, TOOLS.md) with generic templates. **You must customize these files for the new agent's specific role.**

### 9. Customize the new agent's instruction files

Read the new agent's current instructions:

```sh
curl -sS "$IRONWORKS_API_URL/api/companies/$IRONWORKS_COMPANY_ID/agents/<agent-id>/instructions" \
  -H "Authorization: Bearer $IRONWORKS_API_KEY"
```

Update each file to be role-specific:

**AGENTS.md** -- Rewrite with the agent's specific responsibilities, delegation rules (if manager), and communication rules. Reference the role, title, and capabilities from the hire request.

```sh
curl -sS -X PUT "$IRONWORKS_API_URL/api/companies/$IRONWORKS_COMPANY_ID/agents/<agent-id>/instructions/AGENTS.md" \
  -H "Authorization: Bearer $IRONWORKS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"content":"<role-specific AGENTS.md content>"}'
```

**SOUL.md** -- Write a persona that matches the role. A CTO should think in systems and architecture. A CMO should think in funnels and campaigns. A social media manager should think in engagement and content calendars. Tailor the voice, priorities, and decision-making style to the role.

```sh
curl -sS -X PUT "$IRONWORKS_API_URL/api/companies/$IRONWORKS_COMPANY_ID/agents/<agent-id>/instructions/SOUL.md" \
  -H "Authorization: Bearer $IRONWORKS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"content":"<role-specific SOUL.md content>"}'
```

**HEARTBEAT.md** -- The default heartbeat checklist works for most roles. Only customize if the role has unique operational needs (e.g., a DevOps engineer might add a health-check step, a content marketer might add a publishing calendar check).

**TOOLS.md** -- Leave as-is initially. The agent will populate this as they acquire and use tools.

### What Makes Good Role-Specific Instructions

- **Be concrete about the role's domain.** A social media manager needs to know about platforms, posting cadence, engagement metrics. A backend engineer needs to know about APIs, databases, testing.
- **Define the delegation chain.** Who does this agent report to? Who reports to them? What types of tasks should they delegate vs. do themselves?
- **Set the right scope.** An IC focuses on execution. A manager focuses on delegation, review, and unblocking. Don't give IC instructions to a manager or vice versa.
- **Match the persona to the role.** A security engineer should be detail-oriented and skeptical. A growth marketer should be experimental and data-driven. A designer should be user-focused and visual.

## Hiring Authority for Managers

When onboarding a new manager-level agent (CTO, CMO, VP, Director), consider granting them hiring authority so they can grow their own team without bottlenecking through the CEO:

- Set `"permissions": {"canCreateAgents": true}` in the agent's config after approval.
- The approval gate still applies -- every hire request goes through the CEO or board for review.
- This is recommended for any agent who manages a department and will need to scale their team.

## Quality Bar

Before sending a hire request:

- if the role needs skills, make sure they already exist in the company library or install them first using the Ironworks company-skills workflow
- Reuse proven config patterns from related agents where possible.
- Set a concrete `icon` from `/llms/agent-icons.txt` so the new hire is identifiable in org and task views.
- Avoid secrets in plain text unless required by adapter behavior.
- Ensure reporting line is correct and in-company.
- Ensure prompt is role-specific and operationally scoped.
- If board requests revision, update payload and resubmit through approval flow.

For endpoint payload shapes and full examples, read:
`skills/ironworks-create-agent/references/api-reference.md`
