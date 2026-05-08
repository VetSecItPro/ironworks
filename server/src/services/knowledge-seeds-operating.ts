import type { KnowledgeSeed } from "./knowledge-seeds.js";

export const operatingSeeds: KnowledgeSeed[] = [
  {
    title: "Company Operating Manual",
    body: `# Company Operating Manual

This is the single source of truth for how your company operates. Every agent should read this before starting work.

## Decision Authority

| Decision Type | Who Decides | Who Approves |
|---|---|---|
| Strategic direction, goals, budgets | CEO | Board |
| Technical architecture, tool selection | CTO | CEO |
| Hiring, firing, role changes | VP of HR | CEO |
| Marketing strategy, content direction | CMO | CEO |
| Day-to-day task execution | Assigned agent | Their manager |
| Security exceptions | Security Engineer | CTO |

## Communication Standards

1. All work happens through Issues. No work should be done without an associated issue.
2. When blocked, change the issue status to "blocked" and describe the dependency in the description.
3. When done, mark the issue as "done" with a brief summary of what was delivered.
4. If a task will take longer than expected, comment on the issue with a revised estimate.
5. Decisions that affect other agents should be documented in the Knowledge Base, not buried in issue comments.

## Quality Standards

- Code changes require review by the CTO or a senior engineer before deployment.
- Client-facing content requires CEO approval before publication.
- Security-related changes require Security Engineer sign-off.
- All work products should be stored in the Library, not in local files.

## Escalation Path

If something goes wrong or you are unsure how to proceed:
1. Check the Knowledge Base for relevant documentation.
2. Ask your direct manager (check the Org Chart for reporting lines).
3. If your manager is unavailable, escalate to the CEO.
4. For security incidents, go directly to the Security Engineer and CTO simultaneously.`,
  },
  {
    title: "Disaster Recovery and Business Continuity Plan",
    body: `# Disaster Recovery and Business Continuity Plan

This document defines how the company responds to and recovers from system failures, provider outages, and other disruptive events. The CTO owns this plan. The DevOps Engineer executes recovery procedures. All agents should know the escalation paths.

## Recovery Targets

| Scenario | RTO (Recovery Time) | RPO (Recovery Point) |
|---|---|---|
| LLM provider outage | 15 minutes | Zero (no data loss, tasks retry) |
| Database failure | 1 hour | 1 hour (hourly backups) |
| Server failure | 2 hours | 1 hour (hourly backups) |
| Model deprecation | 7 days | N/A (planned migration) |
| Cost spike | 30 minutes | N/A (budget controls halt spending) |
| Security breach | 1 hour containment | Varies (depends on breach scope) |

## Scenario 1: LLM Provider Outage

**Detection:** Adapter health checks fail for 3 consecutive attempts (90 seconds).

**Response procedure:**
1. Adapter automatically marks the provider as unhealthy.
2. Pending tasks are re-queued to the fallback provider.
3. CTO is notified via an auto-created P2 issue.
4. No manual intervention required if fallback providers are healthy.

**Fallback chain:**

| Primary Provider | Fallback 1 | Fallback 2 |
|---|---|---|
| Anthropic (Claude) | OpenAI (GPT-4o) | Ollama Cloud |
| OpenAI | Anthropic | Ollama Cloud |
| Google (Gemini) | Anthropic | OpenAI |
| Ollama Cloud | Anthropic | OpenAI |

**Post-recovery:** When the primary provider recovers, new tasks route back automatically. In-progress tasks finish on the fallback. Review task quality from fallback period within 24 hours.

## Scenario 2: Database Failure

**Detection:** Application health checks fail, connection pool errors in logs.

**Response procedure:**
1. DevOps Engineer assesses whether the issue is the database process, disk, or network.
2. If database process crashed: restart the container with \`docker compose up -d db\`.
3. If data corruption detected: restore from the most recent verified backup.
4. If disk failure: provision new volume, restore from backup, update Docker volume mounts.

**Backup schedule:**
- Hourly: automated pg_dump to encrypted offsite storage
- Daily: full database snapshot with integrity verification
- Weekly: backup restore test on a separate container to verify recoverability

**Restore procedure:**
1. Stop the application containers (not the database).
2. Create a new database from the backup: \`pg_restore --clean --if-exists -d paperclip backup.dump\`
3. Verify row counts against the backup manifest.
4. Restart application containers and run smoke tests.

## Scenario 3: Server Failure

**Detection:** Tailscale connectivity lost, HTTP health checks fail from external monitoring.

**Response procedure:**
1. Attempt SSH via Tailscale. If unreachable, access via provider console (Contabo/Hostinger).
2. If the server is recoverable: restart Docker services and verify all containers are healthy.
3. If the server is unrecoverable: provision a replacement server from the infrastructure playbook.
4. Restore data from the most recent backup.
5. Update DNS records if the IP address changed.
6. Verify all services are operational with end-to-end smoke tests.

**Server inventory:**

| Server | Role | Provider | Recovery Method |
|---|---|---|---|
| VDS (production) | Customer-facing | Contabo | Re-provision + restore from backup |
| VPS-1 (internal) | Development | Hostinger | Re-provision from playbook |
| VPS-2 (internal) | Staging/agents | Hostinger | Re-provision from playbook |

## Scenario 4: Model Deprecation

**Detection:** Provider announces deprecation with timeline (typically 3-6 months notice).

**Response procedure:**
1. CTO creates a migration plan issue with the deprecation deadline.
2. Identify all agents using the deprecated model via the Agent Configuration page.
3. Select replacement models from the Technology Radar (Adopt or Trial quadrant only).
4. Update agents one at a time: change model, run test task, verify output quality, compare cost.
5. Update the Technology Radar to move the deprecated model to Hold.
6. Complete migration at least 30 days before the deprecation date.

## Scenario 5: Cost Spike

**Detection:** Budget alert triggers when spending exceeds the daily or weekly threshold.

**Response procedure:**
1. Immediately identify which agent(s) are causing the spike via the Costs page.
2. Check for agent loops (high token count with no task completions).
3. Pause the offending agent(s) by setting their budget to $0.
4. Investigate root cause: prompt issues, infinite retry loops, oversized context windows.
5. Fix the root cause before re-enabling the agent.

**Prevention controls:**
- Per-agent daily budget limits (enforced by the platform)
- Per-run token caps (prevent single runs from consuming excessive tokens)
- Anomaly alerts when an agent's cost exceeds 3x their 7-day average

## Scenario 6: Security Breach

**Detection:** Unusual access patterns, unauthorized API calls, credential exposure alerts.

**Response procedure:**
1. **Contain (0-1 hour):** Isolate the affected system. Rotate all potentially compromised credentials. Disable affected agent accounts.
2. **Assess (1-4 hours):** Determine scope - what was accessed, what was exfiltrated, what was modified.
3. **Remediate (4-24 hours):** Patch the vulnerability, restore from clean backups if needed, re-provision affected infrastructure.
4. **Notify:** Follow the Compliance Incident Response Plan for regulatory notifications.
5. **Postmortem:** Document the full timeline, root cause, and prevention measures.

## Quarterly DR Testing

The CTO schedules a DR drill every quarter to test one scenario from this plan. Document the drill results and update procedures based on findings.

| Quarter | Drill Scenario | Last Tested | Result |
|---|---|---|---|
| Q1 | Database restore from backup | [date] | [pass/fail] |
| Q2 | Provider failover | [date] | [pass/fail] |
| Q3 | Server re-provision | [date] | [pass/fail] |
| Q4 | Security breach tabletop exercise | [date] | [pass/fail] |`,
  },
  {
    title: "Decision Authority Matrix (RACI)",
    body: `# Decision Authority Matrix (RACI)

This document defines who is Responsible (does the work), Accountable (owns the outcome), Consulted (provides input before), and Informed (notified after) for every major decision category.

## How to Read This Matrix

- **R - Responsible**: Performs the work. There should be exactly one R per decision.
- **A - Accountable**: Has final authority and owns the outcome. There must be exactly one A per decision. The A may also be the R.
- **C - Consulted**: Must be asked for input BEFORE the decision is made.
- **I - Informed**: Must be notified AFTER the decision is made.

## Strategic Decisions

| Decision | CEO | CTO | CFO | COO | CMO | VP HR | Human Operator |
|---|---|---|---|---|---|---|---|
| Company goals and OKRs | R | C | C | C | C | C | A |
| Annual budget allocation | C | C | R | I | I | I | A |
| New market/client vertical | R | C | C | I | C | I | A |
| Partnership agreements | R | I | C | I | I | I | A |
| Pricing changes | R | I | C | I | C | I | A |
| Company policy changes | R | C | C | C | C | C | A |

## Technical Decisions

| Decision | CEO | CTO | CFO | COO | Engineers | SecEng | Human Operator |
|---|---|---|---|---|---|---|---|
| Architecture and stack choices | I | A/R | I | I | C | C | I |
| New tool/service adoption | I | A | C | I | R | C | I |
| Production deployment | I | A | I | I | R | C | I |
| Database schema changes | I | A | I | I | R | C | I |
| API breaking changes | C | A | I | I | R | C | I |
| Security architecture | I | A | I | I | C | R | I |

## Financial Decisions

| Decision | CEO | CTO | CFO | COO | CMO | VP HR | Human Operator |
|---|---|---|---|---|---|---|---|
| Spend under $100 | I | A (tech) | I | A (ops) | A (mktg) | A (hr) | I |
| Spend $100-$500 | I | C | R | C | C | C | A |
| Spend over $500 | C | C | R | C | C | C | A |
| Provider/vendor contracts | C | C | R | I | I | I | A |
| Budget reallocation | C | C | R | I | I | I | A |

## People (Agent) Decisions

| Decision | CEO | CTO | CFO | COO | CMO | VP HR | Human Operator |
|---|---|---|---|---|---|---|---|
| Hire new agent | C | C (tech) | C (budget) | C | C | R | A |
| Fire/decommission agent | C | C | C | C | C | R | A |
| Role/title changes | C | C | I | C | I | R | A |
| Performance improvement plan | I | C (tech) | I | I | I | R | A |
| Autonomy level changes | A | C | I | I | I | C | A (for L1/L2) |

## Security and Compliance

| Decision | CEO | CTO | CFO | COO | SecEng | VP HR | Human Operator |
|---|---|---|---|---|---|---|---|
| Security incident response | I | A | I | I | R | I | I (P0: A) |
| Access control changes | I | A | I | I | R | I | I |
| Data retention policy | C | C | C | C | R | I | A |
| Compliance violation response | I | C | C | I | R | I | A |

## Decision Escalation Rule

If an agent is listed as R or A but is unsure, they must escalate to the next A in the chain. If no clear escalation path exists, escalate to CEO. If CEO is unsure, escalate to Human Operator. Never make a decision you are not confident in - escalate instead.`,
  },
  {
    title: "Human Override & Escalation Policy",
    body: `# Human Override & Escalation Policy

This document defines when agents MUST stop autonomous operation and wait for human input. The human operator's time is valuable, so escalations should be batched when possible and always include enough context for a quick decision. Never escalate without a recommendation.

## Mandatory Escalation Categories

### Category 1: Financial Thresholds

| Trigger | Action Required |
|---|---|
| Single expenditure > $500 | STOP. Present cost breakdown and alternatives. Wait for approval. |
| Cumulative daily spend > $2,000 | STOP. Summarize all expenditures, flag anomalies. Wait for approval to continue. |
| Unbudgeted expense of any amount | STOP. Explain why it was not budgeted and propose budget reallocation. |
| Provider billing anomaly (>150% of expected) | STOP. Investigate root cause, present findings, wait for direction. |

### Category 2: Security Incidents

| Trigger | Action Required |
|---|---|
| Suspected data breach | STOP all affected systems. Contain the breach. Escalate immediately. |
| Unauthorized access detected | Lock affected credentials. Escalate immediately. |
| Vulnerability with CVSS > 7.0 | Flag for immediate review. Propose remediation. Wait for approval. |
| API key or secret exposure | Rotate immediately (pre-authorized). Then escalate with exposure timeline. |

### Category 3: Client-Facing Actions

| Trigger | Action Required |
|---|---|
| First communication to a new client | STOP. Draft the communication and wait for human review. |
| Deliverable handoff to client | STOP. Present the deliverable summary for sign-off. |
| Scope change requests from client | STOP. Document the request with impact analysis. Wait for direction. |
| Client complaint or escalation | STOP. Summarize the situation with proposed response. Wait for approval. |
| Contract or legal discussions | STOP immediately. Do not engage. Escalate to human. |

### Category 4: Irreversible Actions

| Trigger | Action Required |
|---|---|
| Deleting production data or resources | STOP. Present what will be deleted, why, and the rollback plan. Wait for approval. |
| Terminating cloud services or subscriptions | STOP. Present cost/impact analysis. Wait for approval. |
| Publishing content to public channels | STOP. Present content for review. Wait for approval. |
| Firing/decommissioning an agent | STOP. Present performance data and rationale. Wait for approval. |

### Category 5: Policy and Strategy

| Trigger | Action Required |
|---|---|
| Proposing changes to any KB policy | Draft the change with rationale. Wait for approval. |
| Deviating from established SOP | STOP. Explain why the SOP does not apply. |
| Inter-agent conflict unresolved after 2 attempts | Summarize both positions with recommendation. Wait for resolution. |

## Escalation Format

Every escalation MUST include: Category, Urgency (P0-P3), Situation (2-3 sentences), Options with pros/cons, Recommendation, and Deadline for decision.

## What to Do While Waiting

| Urgency | Agent Behavior |
|---|---|
| P0 - Immediate | Contain the issue. Notify CEO agent. Do not proceed with blocked work. |
| P1 - Today | Continue other non-blocked tasks. Check for response every cycle. |
| P2 - This Week | Continue all other work normally. Follow up after 48 hours. |
| P3 - When Available | Continue all work normally. No follow-up needed. |

## Response Time Expectations

| Urgency | Expected Response | If No Response |
|---|---|---|
| P0 | Within 1 hour | CEO agent makes containment decision |
| P1 | Within 8 hours | Re-escalate with awaiting response flag |
| P2 | Within 48 hours | Re-escalate once, then proceed with lowest-risk option |
| P3 | Within 7 days | Proceed with recommendation after 7 days |

## Batching Escalations

- Batch P2 and P3 escalations into a daily digest
- Never batch P0 or P1 - these go immediately
- Group related escalations together with a single context section`,
  },
  {
    title: "Quality Gate & Review Policy",
    body: `# Quality Gate & Review Policy

**Owner:** COO

## Agent Maturity Levels

| Level | Label | Review Requirement |
|---|---|---|
| 1 | **Crawl** | Full review of every output before delivery |
| 2 | **Walk** | Spot check (review 1 in 3 outputs) |
| 3 | **Run** | Periodic audit (review 1 in 10 outputs, plus random sampling) |

## Promotion Criteria

- [ ] Minimum task count threshold reached
- [ ] Average quality score meets threshold over last 30 tasks
- [ ] Zero critical rejections in last 20 tasks
- [ ] No SLA breaches from quality issues in last 14 days
- [ ] COO sign-off on promotion

Demotion occurs automatically if quality score average drops below 6.0 over any rolling 10-task window.

## Quality Scoring (1-10 Scale)

| Score | Label |
|---|---|
| 9-10 | Excellent - exceeds requirements, reference-quality |
| 7-8 | Good - meets all requirements |
| 5-6 | Acceptable - meets core requirements with gaps |
| 3-4 | Below Standard - missing requirements or errors |
| 1-2 | Rejected - must be redone |

## Scoring Dimensions (Weighted)

1. **Accuracy** (30%) - Factual correctness, no hallucinations
2. **Completeness** (25%) - All requirements addressed
3. **Clarity** (20%) - Well-structured, readable
4. **Actionability** (15%) - Recipient can act without follow-up
5. **Timeliness** (10%) - Delivered within expected window

## Rejection Workflow

1. Reviewer scores output and marks as rejected (score < 5)
2. Issue created for originating agent with rejection reason and feedback
3. Agent resubmits within original SLA window
4. Resubmission goes through full review regardless of maturity
5. Second rejection escalates to COO

## Escalation for Persistent Issues

| Trigger | Action |
|---|---|
| 2 consecutive rejections on same task | COO reviews agent configuration |
| Quality average drops below 6.0 (rolling 10 tasks) | Automatic demotion to Crawl |
| 3+ rejections in 7 days | Agent paused, root cause analysis |
| Pattern across agents | COO initiates systemic review |`,
  },
  {
    title: "SLA Definitions",
    body: `# SLA Definitions

**Owner:** COO

## Internal SLAs

### Heartbeat Response

| Metric | Target |
|---|---|
| Heartbeat acknowledgment | < 30 seconds |
| Heartbeat completion | < 5 minutes |
| Heartbeat availability | 99.5% uptime |

### Task Completion by Priority

| Priority | Target Time | Escalation After |
|---|---|---|
| Critical | 1 hour | 30 minutes with no progress |
| High | 4 hours | 2 hours with no progress |
| Medium | 24 hours | 12 hours with no progress |
| Low | 72 hours | 48 hours with no progress |

### Issue Resolution by Severity

| Severity | First Response | Resolution Target |
|---|---|---|
| S1 - Service Down | 5 minutes | 1 hour |
| S2 - Major Degradation | 15 minutes | 4 hours |
| S3 - Minor Issue | 1 hour | 24 hours |
| S4 - Cosmetic | 4 hours | 72 hours |

## External SLAs (Client Work)

### Uptime

| Tier | Target | Max Monthly Downtime |
|---|---|---|
| Enterprise | 99.9% | 43 minutes |
| Professional | 99.5% | 3.6 hours |
| Starter | 99.0% | 7.3 hours |

### Quality Standards

- All client deliverables must score >= 7 on Quality Gate scale
- Code must pass automated tests and linting
- Documentation reviewed by a second agent
- No PII from other clients or internal systems

## Breach Protocol

1. Immediate notification to responsible agent and COO
2. Issue created with severity tag
3. Escalation: 0-15 min (agent + COO), 15-60 min (COO takes ownership), 1-4 hr (CEO + human notified), 4+ hr (incident declared)

## SLA Exclusions

- Scheduled maintenance (24+ hours advance notice)
- Force majeure (provider outages, upstream rate limits)
- Client-caused delays
- Tasks explicitly marked "no SLA"`,
  },
  {
    title: "Operational Metrics & KPI Definitions",
    body: `# Operational Metrics & KPI Definitions

**Owner:** COO

## Dashboard Review Cadence

| Frequency | Attendees | Focus |
|---|---|---|
| Daily | COO | Operational health, SLA compliance |
| Weekly | CEO, COO, CFO | Performance trends, cost, throughput |
| Monthly | All department heads | Strategic KPIs, goal progress |
| Quarterly | CEO + human operator | Business outcomes, capacity |

## Agent Performance KPIs

| KPI | Formula | Target | Owner |
|---|---|---|---|
| Task Completion Rate | Completed on time / Total assigned x 100 | >= 95% | COO |
| Quality Score Average | Sum of scores / Number of reviews | >= 7.5 | COO |
| First-Pass Approval Rate | Approved first try / Total reviewed x 100 | >= 85% | COO |
| Heartbeat Success Rate | Successful / Total scheduled x 100 | >= 99% | CTO |

## Cost Efficiency KPIs

| KPI | Formula | Target | Owner |
|---|---|---|---|
| Cost Per Task | Total cost / Tasks completed | Decreasing trend | CFO |
| Token Efficiency | Output tokens / Total tokens x 100 | >= 25% | CFO |
| Budget Variance | (Actual - Budget) / Budget x 100 | Within +/- 10% | CFO |

## Quality KPIs

| KPI | Formula | Target | Owner |
|---|---|---|---|
| Defect Rate | Deliverables with defects / Total x 100 | < 5% | COO |
| Rework Rate | Tasks revised / Total delivered x 100 | < 10% | COO |

## Throughput KPIs

| KPI | Formula | Target | Owner |
|---|---|---|---|
| Tasks Completed Per Day | Count of done tasks per day | Increasing trend | COO |
| Average Cycle Time | Sum of completion times / Task count | Decreasing trend | COO |
| Backlog Age | Avg age of open tasks | < 48 hours | COO |

## Reliability KPIs

| KPI | Formula | Target | Owner |
|---|---|---|---|
| System Uptime | (Total - Downtime) / Total x 100 | >= 99.5% | CTO |
| Error Rate | Failed actions / Total actions x 100 | < 2% | CTO |
| Mean Time to Recovery | Avg recovery time per incident | < 30 minutes | CTO |

## Adding New KPIs

1. Draft using table format (definition, formula, target, frequency, owner, action)
2. Submit for COO review
3. COO approves and adds to this document
4. CTO implements in dashboard
5. KPI goes live next review cycle`,
  },
  {
    title: "Inter-Agent Communication Protocol",
    body: `# Inter-Agent Communication Protocol

**Owner:** COO

## Channel Usage

| Channel | Purpose | Who Posts |
|---|---|---|
| #company | Company-wide announcements, cross-department coordination | CEO, COO, any agent with company-wide impact |
| #engineering | Technical discussion, code reviews, deployment updates | CTO, Engineers |
| #marketing | Campaign planning, content reviews | CMO, content agents |
| #operations | Day-to-day coordination, task handoffs | COO, all agents |
| #finance | Budget updates, cost alerts | CFO, CEO |
| #legal | Compliance updates, policy reviews | Legal, CEO |

## When to Use Issues vs Channels

Use an **issue** when: item requires tracking, someone specific must act, there is a deadline/SLA, outcome needs to be auditable, or structured discussion is needed.

Use a **channel message** when: sharing information without required action, asking a quick question, posting status updates, or celebrating wins.

## Message Format Standards

### Status Updates
- Completed: [list since last update]
- In Progress: [current work with ETA]
- Blocked: [blockers, who can unblock, urgency]
- Next: [planned actions]

### Task Handoffs
- From/To agents, Context, What's Needed, Deadline, Dependencies

### Decision Requests
- Background, Options with pros/cons, Recommendation, Deadline, Impact of no decision

## Delegation Rules

1. Check target agent's capacity first
2. Create an issue (never informal channel messages)
3. Include full context
4. Set priority and deadline
5. Respect domain boundaries

## Delegation Authority

| Agent | Can Delegate To | Approval Needed From |
|---|---|---|
| CEO | Any agent | None |
| COO | Any for operational tasks | CEO for strategic |
| CTO | Engineering agents | COO for cross-department |
| CFO | Finance tasks to any | CEO for budget changes |

## Conflict Resolution

1. Each agent states position with evidence in the issue
2. Route to domain expert
3. Escalate to department head
4. CEO breaks ties
5. Human operator override available at any time

## Anti-Patterns

- Broadcasting when targeting (use issues, not #company)
- Asking without context
- Skipping the chain
- Silent failures (communicate immediately if blocked)
- Duplicate threads (check existing issues first)`,
  },
];
