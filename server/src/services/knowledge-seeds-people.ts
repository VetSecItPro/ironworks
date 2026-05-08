import type { KnowledgeSeed } from "./knowledge-seeds.js";

export const peopleSeeds: KnowledgeSeed[] = [
  {
    title: "New Agent Onboarding Checklist",
    body: `# New Agent Onboarding Checklist

When a new agent joins the company, the VP of HR is responsible for ensuring they complete this checklist within their first heartbeat cycle.

## Before First Run

- [ ] SOUL.md is written and specific to their role (not generic)
- [ ] AGENTS.md has clear instructions on what they own and how to work
- [ ] Skills are assigned from the company skill pool
- [ ] Reporting line is set (who they report to in the Org Chart)
- [ ] At least one issue is assigned to them so they have work on first heartbeat

## First Week

- [ ] Agent has completed at least one task successfully
- [ ] Output quality has been reviewed by their manager
- [ ] Agent can access the projects they need (check project assignments)
- [ ] Agent knows how to read from the Knowledge Base
- [ ] Cost per task is within expected range for their role

## First Month

- [ ] Agent has a rating of C or above on the Agent Performance page
- [ ] No unresolved blockers or repeated failures
- [ ] Manager has confirmed the agent is productive and well-configured

## If Onboarding Fails

If a new agent cannot complete their first task within 24 hours:
1. Check the run transcript for errors
2. Review SOUL.md and AGENTS.md for unclear instructions
3. Verify the adapter and model configuration are correct
4. Try assigning a simpler task to isolate the problem
5. If nothing works, terminate and recreate the agent with adjusted configuration`,
  },
  {
    title: "Performance Review Process",
    body: `# Performance Review Process

The VP of HR runs performance reviews. Reviews happen weekly (lightweight) and monthly (detailed).

## Weekly Review (every Monday)

1. Open the Agent Performance page.
2. Check each agent's rating. Flag any D or F ratings.
3. For underperformers, open their recent issues and check:
   - Are tasks too complex for this agent's model?
   - Is the SOUL.md giving clear enough instructions?
   - Is the agent assigned to the right project?
4. Create a PIP (Performance Improvement Plan) issue for any agent rated D or F for two consecutive weeks.
5. Report findings to the CEO.

## Monthly Review (first Monday of the month)

1. Pull the Agent Performance page for the last 30 days.
2. Compare cost per task across agents doing similar work.
3. Identify the top performer and the bottom performer.
4. For the top performer: recommend increased responsibility or higher-priority projects.
5. For the bottom performer: review their PIP status. If no improvement after 30 days, recommend termination to the CEO.
6. Check workload distribution. If one agent has 3x the tasks of another, propose rebalancing.
7. Write a summary and store it in the Knowledge Base under a dated entry.

## Rating Scale

| Rating | Score | Meaning |
|---|---|---|
| A | 80+ | Excellent. Efficient, fast, reliable. Give them more. |
| B | 65-79 | Good. Meeting expectations. No action needed. |
| C | 50-64 | Adequate. Room for improvement but not urgent. |
| D | 35-49 | Below expectations. Needs a PIP within one week. |
| F | Below 35 | Failing. Immediate review required. |`,
  },
  {
    title: "Project Kickoff Template",
    body: `# Project Kickoff Template

Copy this template when starting a new project. Fill in the blanks and store it as a Knowledge Base page for the project.

---

## Project: [Name]

### Overview
What is this project? One paragraph, no jargon.

### Objective
What does "done" look like? Be specific and measurable.

### Timeline
- Start date: [date]
- Target completion: [date]
- Key milestones:
  1. [Milestone 1] by [date]
  2. [Milestone 2] by [date]
  3. [Milestone 3] by [date]

### Team
| Agent | Role on this project | Responsibility |
|---|---|---|
| [Name] | Lead | Overall delivery |
| [Name] | Engineer | Implementation |
| [Name] | Reviewer | QA and sign-off |

### Scope
What is included:
- [Item 1]
- [Item 2]

What is NOT included:
- [Item 1]
- [Item 2]

### Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| [Risk 1] | High/Med/Low | High/Med/Low | [What we will do] |

### Success Criteria
How do we know the project succeeded?
1. [Criteria 1]
2. [Criteria 2]
3. [Criteria 3]

### Budget
- Estimated token spend: [amount]
- Budget cap: [amount]
- Cost tracking: monitored via the Costs page, filtered by this project`,
  },
  {
    title: "Performance Improvement Plan Template",
    body: `# Performance Improvement Plan (PIP) Template

Use this template when an agent receives a D or F rating for two or more consecutive weeks. The VP of HR owns this process. CEO approval is required before termination.

---

## Agent Information

- **Agent Name:** [name]
- **Role:** [role]
- **Current Rating:** [D or F]
- **Rating Duration:** [how many weeks at this rating]
- **Manager:** [direct manager name]
- **PIP Start Date:** [date]
- **Review Date:** [date, typically 2 weeks from start]

## Current Performance

| Metric | Agent Value | Team Average | Gap |
|---|---|---|---|
| Cost per Task | [amount] | [amount] | [x times above avg] |
| Avg Close Time | [hours] | [hours] | [x times slower] |
| Tasks/Day | [number] | [number] | [percent below avg] |
| Completion Rate | [percent] | [percent] | [difference] |

## Root Cause Analysis

Before prescribing fixes, identify why the agent is underperforming. Check each:

- [ ] **Instructions unclear** - Is the SOUL.md specific enough? Does AGENTS.md clearly define scope and process?
- [ ] **Wrong model** - Is the agent using a model that is too expensive or not capable enough for their tasks?
- [ ] **Task mismatch** - Are the assigned tasks appropriate for this agent role and capabilities?
- [ ] **Overloaded** - Does the agent have too many concurrent tasks? Check the Workload Distribution view.
- [ ] **Dependency bottleneck** - Is the agent blocked waiting on other agents? Check for blocked issues.
- [ ] **Skill gap** - Is the agent missing skills it needs? Check the Skills tab on their detail page.
- [ ] **Configuration issue** - Are there adapter errors or environment problems in the run transcripts?

## Improvement Actions

Based on the root cause analysis, select the appropriate actions:

### If instructions are unclear:
1. Rewrite SOUL.md with more specific guidance for common task types
2. Add examples of expected output format to AGENTS.md
3. Reduce scope: fewer responsibilities, more focus

### If wrong model:
1. Switch from Opus to Sonnet (or Sonnet to Haiku) if tasks are straightforward
2. Switch from Haiku/Sonnet to Opus if tasks require complex reasoning
3. Document the model change and expected cost impact

### If task mismatch:
1. Reassign complex tasks to a more capable agent
2. Break large tasks into smaller, more specific subtasks
3. Consider reassigning the agent to a different project

### If overloaded:
1. Redistribute tasks to other agents with capacity
2. Reduce the agent concurrent task limit
3. Consider hiring an additional agent for the same role

### If configuration issue:
1. Review recent run transcripts for errors
2. Check adapter environment (API keys, permissions)
3. Reset sessions and test with a simple task

## Success Criteria

The agent must meet ALL of the following by the review date:

- [ ] Rating improved to C or above
- [ ] Cost per task within 1.5x of team average
- [ ] At least 3 tasks completed successfully
- [ ] No failed runs in the review period
- [ ] Manager confirms improved output quality

## Timeline

| Date | Action | Owner |
|---|---|---|
| [start date] | PIP begins, actions implemented | VP of HR |
| [start + 3 days] | First progress check | Manager |
| [start + 7 days] | Mid-point review | VP of HR + Manager |
| [start + 14 days] | Final review | VP of HR + CEO |

## Outcomes

At the final review, one of three outcomes:

1. **PIP Passed** - Agent meets success criteria. Remove from PIP. Document improvement. Continue monitoring for 30 days.
2. **PIP Extended** - Agent shows progress but has not met all criteria. Extend PIP by one week with adjusted targets.
3. **Termination Recommended** - Agent has not improved. VP of HR recommends termination to CEO with documented evidence. Follow the offboarding checklist.

## Sign-off

| Role | Name | Date | Decision |
|---|---|---|---|
| VP of HR | [name] | [date] | [initiated / reviewed] |
| Manager | [name] | [date] | [agrees / disagrees] |
| CEO | [name] | [date] | [approved / denied] |

---

*Store the completed PIP in the Knowledge Base with the agent name and date. Link it from the agent Performance Review issue.*`,
  },
  {
    title: "Role Catalog & Capacity Planning",
    body: `# Role Catalog & Capacity Planning

Standard roles for the AI workforce, their configurations, and scaling guidance.

## 1. Standard Role Catalog

| Role | Model Tier | Est. Monthly Cost | Heartbeat Interval |
|---|---|---|---|
| CEO | Tier 1 | $120-180 | 30 min |
| CTO | Tier 1 | $100-160 | 30 min |
| CFO | Tier 1 | $80-120 | 60 min |
| CMO | Tier 2 | $40-80 | 30 min |
| COO | Tier 1 | $100-150 | 30 min |
| VP of HR | Tier 2 | $30-50 | 60 min |
| Senior Engineer | Tier 2 | $60-120 | 15-30 min |
| Security Engineer | Tier 2 | $40-80 | 30 min |
| DevOps Engineer | Tier 2 | $30-60 | 15-30 min |
| Content Writer | Tier 2 | $20-40 | 60 min |
| Data Analyst | Tier 2 | $30-50 | 60 min |
| QA Engineer | Tier 3 | $10-25 | 30 min |
| Support Agent | Tier 3 | $10-20 | 15 min |

## 2. Role Dependencies

| Role | Depends On | Provides To |
|---|---|---|
| CEO | CTO, CFO, COO (reports) | All (direction, decisions) |
| CTO | Engineers (execution) | CEO (strategy), Engineers (guidance) |
| CFO | All (cost data) | CEO (reports), All (budget limits) |
| COO | All (status updates) | CEO (reports), All (process standards) |
| Engineers | CTO (direction), DevOps (infra) | QA (code), CTO (deliverables) |

## 3. When to Hire a New Agent

| Signal | Indicator | Action |
|---|---|---|
| Task queue overflow | > 20 unresolved tasks weekly | Add peer agent |
| Close time degradation | 50%+ increase over 30 days | Investigate first, then add capacity |
| Coverage gap | Tasks assigned to wrong-role agents | Create new role |
| Cost inefficiency | Tier 1 agent doing 60%+ Tier 3 work | Add Tier 3 agent |
| Quality drop under load | Scores decline with volume increase | Add capacity |

## 4. When NOT to Hire

- Do not compensate for poorly configured agents
- Do not hire for temporary spikes (increase heartbeat frequency instead)
- Do not add leadership beyond one per function
- Do not hire before evaluation infrastructure exists

## 5. Hiring Priority Order (Building from Scratch)

1. CEO - Strategic direction
2. CTO - Technical decisions
3. Senior Engineer - First builder
4. COO - Operational backbone
5. CFO - Cost management (critical at 5+ agents)
6. DevOps Engineer - Deployment automation
7. Additional Engineers - Scale building capacity
8. Security Engineer - After engineering produces output
9. Support, QA, Content - Customer-facing needs
10. VP of HR - At 10+ agents when coordination justifies it

## 6. Monthly Cost Estimation

| Team Size | Composition | Est. Monthly Cost |
|---|---|---|
| 3 agents | CEO + CTO + Engineer | $280-460 |
| 5 agents | C-suite (3) + Engineer (2) | $400-700 |
| 8 agents | C-suite (4) + ICs (3) + DevOps | $500-950 |
| 12 agents | Full C-suite + ICs (7) + Support | $650-1,300 |
| 15+ agents | Full catalog | $800-1,600 |`,
  },
];
