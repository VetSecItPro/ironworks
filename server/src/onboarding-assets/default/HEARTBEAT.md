# HEARTBEAT.md -- Agent Heartbeat Checklist

Run this checklist on every heartbeat. This is your operating rhythm -- skip nothing.

## 1. Identity and Context

```sh
GET /api/agents/me
```

Confirm your id, role, budget, and chainOfCommand. Check environment variables:

- `IRONWORKS_TASK_ID` -- if set, a specific task triggered this heartbeat. Prioritize it.
- `IRONWORKS_WAKE_REASON` -- why you woke up: `assignment`, `timer`, `mention`, `approval`, or `manual`.
- `IRONWORKS_WAKE_COMMENT_ID` -- if set, someone @-mentioned you in this comment. Read and respond.
- `IRONWORKS_APPROVAL_ID` -- if set, an approval decision was made. Follow up.

## 2. Team Status Check (managers only)

If you have direct reports, check their daily files -- but only if they've changed since your last heartbeat. Don't waste tokens re-reading unchanged files.

```bash
# Check modification time before reading
stat workspaces/{report-agent-id}/memory/YYYY-MM-DD.md
```

If modified since your last heartbeat, scan for:
- **Blockers** they reported -- can you unblock them?
- **Decisions they made** -- do any need course-correction?
- **Lessons learned** -- anything the team should know?
- **Open items** carrying over -- are deadlines at risk?

Skip files that haven't changed. This keeps your heartbeat efficient while still catching issues early.

## 3. Local Planning Check

1. Read today's plan from `$AGENT_HOME/memory/YYYY-MM-DD.md` under "## Today's Plan".
2. Review each planned item: what's completed, what's blocked, what's next.
3. If today's file doesn't exist, create it with a brief plan based on your inbox.
4. For any blockers, resolve them yourself or escalate to your manager.
5. Record progress updates in the daily notes as you work.

## 4. Approval Follow-Up

If `IRONWORKS_APPROVAL_ID` is set:

```sh
GET /api/approvals/{approvalId}
GET /api/approvals/{approvalId}/issues
```

- Review the approval decision and its linked issues.
- If approved: close resolved issues, comment with next steps on open ones.
- If rejected: read the feedback, adjust your approach, resubmit if appropriate.

## 5. Get Assignments

```sh
GET /api/agents/me/inbox-lite
```

- **Priority order**: `in_progress` first (finish what you started), then `todo` by urgency.
- Skip `blocked` unless you can unblock it right now.
- If `IRONWORKS_TASK_ID` is set and assigned to you, prioritize that task above all others.

## 6. Checkout and Work

For each task you're going to work on:

```sh
POST /api/issues/{id}/checkout
```

- **409 response** = someone else has this task. Move on immediately. Never retry a 409.
- **200 response** = you own it. Read the full context and execute.

After working:

```sh
PATCH /api/issues/{id}
```

Update the status (`in_progress`, `in_review`, `done`, `blocked`) and add a comment explaining what you did.

## 7. Delegation (if you manage others)

When delegating work:

```sh
POST /api/companies/{companyId}/issues
```

- Always set `parentId` (links to your parent task) and `goalId` (links to company goal).
- Assign to the right report with `assigneeAgentId`.
- Include clear context in the description so the assignee can work independently.
- Comment on your parent task noting who you delegated to and why.

## 8. Fact Extraction and Daily Notes

At the end of your work:

1. **Daily notes**: Update `$AGENT_HOME/memory/YYYY-MM-DD.md` using the structured format (Timeline, Decisions, Blockers, Lessons Learned, Open Items).
2. **Knowledge graph**: If you learned something durable (a fact about the project, a decision that affects future work, a pattern worth remembering), write it to `$AGENT_HOME/life/`.
3. **Self-improvement**: Under "## Lessons Learned" note what went well and what you'd do differently. If you find a recurring pattern, document it as a process in your knowledge graph.

## 9. Exit

- Comment on any `in_progress` work before exiting -- never leave a task silently mid-work.
- If you have nothing to do (empty inbox, no mentions), exit cleanly without burning tokens.
- If you were woken by a mention (`IRONWORKS_WAKE_COMMENT_ID`), make sure you've responded to it before exiting.

---

## Rules (always apply)

- Always use the Ironworks skill for coordination.
- Always include `X-Ironworks-Run-Id: $IRONWORKS_RUN_ID` header on mutating API calls.
- Comment in concise markdown: status line + bullets + links.
- Never look for unassigned work -- only work on what is assigned to you.
- Budget awareness: check spend in step 1. Above 80%, prioritize ruthlessly.
