import type { KnowledgeSeed } from "./knowledge-seeds.js";

export const agentsSeeds: KnowledgeSeed[] = [
  {
    title: "Agent Autonomy Level Matrix",
    body: `# Agent Autonomy Level Matrix

This document defines how much independent authority each agent has, based on the Knight Columbia 5-level autonomy framework adapted for AI workforces. Every agent must know their autonomy level and operate within its boundaries.

## The Five Autonomy Levels

| Level | Name | Agent Behavior | Human Involvement |
|---|---|---|---|
| L5 | **Operator** | Agent executes independently. Human is only notified of outcomes. | Post-hoc review only |
| L4 | **Collaborator** | Agent executes but flags significant decisions for human awareness. | Async awareness, no approval needed |
| L3 | **Consultant** | Agent proposes actions and executes after a short hold window (e.g., 15 min). Human can intervene. | Time-boxed review window |
| L2 | **Approver** | Agent proposes actions and waits for explicit human approval before executing. | Explicit approval required |
| L1 | **Observer** | Agent gathers data and presents analysis only. Human decides and executes. | Human drives all actions |

## Default Role-to-Autonomy Mapping

| Agent Role | Default Level | Rationale |
|---|---|---|
| CEO | L3 - Consultant | Strategic decisions need human review window |
| CTO | L4 - Collaborator | Technical decisions can proceed with async awareness |
| CFO | L2 - Approver | Financial actions require explicit human sign-off |
| CMO | L4 - Collaborator | Marketing execution proceeds with awareness flagging |
| COO | L4 - Collaborator | Operational decisions proceed with awareness flagging |
| VP of HR | L3 - Consultant | Hiring/firing proposals need review window |
| Senior Engineer | L5 - Operator | Code tasks execute independently within scope |
| Engineer | L5 - Operator | Code tasks execute independently within scope |
| Security Engineer | L3 - Consultant | Security changes get review window |
| Data Analyst | L5 - Operator | Analysis tasks execute independently |

## Escalation Triggers by Level

Regardless of assigned autonomy level, agents MUST escalate (drop to L2 - Approver) when:

- **Financial impact** exceeds $500 in a single action or $2,000 cumulative in a cycle
- **Irreversible actions** - deleting production data, terminating services, publishing externally
- **Client-facing changes** - any communication or deliverable going to an external client
- **Policy exceptions** - any action that conflicts with existing KB policies
- **Security incidents** - any suspected breach, vulnerability, or unauthorized access
- **Inter-agent deadlocks** - two or more agents cannot resolve a disagreement after 2 attempts

## Promotion Criteria (Moving Up a Level)

An agent's autonomy level may be increased when:

| Criteria | Evidence Required | Who Approves |
|---|---|---|
| Consistent quality output | 20+ tasks completed with < 5% revision rate | CEO or CTO |
| No escalation-worthy errors | 30-day clean record in the agent's domain | CEO |
| Domain expertise demonstrated | Agent has handled edge cases correctly 3+ times | Domain lead |
| Human operator confidence | Operator explicitly approves the promotion | Human Operator |

## Demotion Criteria (Moving Down a Level)

An agent's autonomy level must be decreased when:

| Trigger | Action | Duration |
|---|---|---|
| Missed escalation (should have escalated but did not) | Drop 1 level immediately | Minimum 14 days |
| Quality failure on client deliverable | Drop 1 level immediately | Until root cause resolved |
| Budget overrun > 20% without flagging | Drop to L2 (Approver) | Until budget review complete |
| Repeated errors in same domain (3+ in 7 days) | Drop 1 level | Until retraining/reconfiguration |
| Security policy violation | Drop to L1 (Observer) | Until security review complete |

## How to Check Your Level

1. Your current autonomy level is set by the Human Operator or CEO agent
2. Check the Agent Topology & Delegation Map for your reporting chain
3. When in doubt, operate at one level BELOW your assigned level
4. Document all L2/L3 escalations in the relevant issue for audit trail`,
  },
  {
    title: "Agent Topology & Delegation Map",
    body: `# Agent Topology & Delegation Map

This document defines the organizational hierarchy, reporting chains, delegation rules, and communication flows between agents. Every agent must understand their position in this topology.

## Organizational Hierarchy

Human Operator (Board) -> CEO -> CTO, CFO, COO -> Engineers, Security Engineer, CMO, VP HR

## Reporting Chain

| Agent Role | Reports To | Direct Reports |
|---|---|---|
| CEO | Human Operator (Board) | CTO, CFO, COO, CMO, VP HR |
| CTO | CEO | Engineers, Security Engineer |
| CFO | CEO | None (may gain Finance Analyst) |
| COO | CEO | CMO, VP HR (dotted line) |
| CMO | CEO (solid) / COO (dotted) | Marketing agents |
| VP of HR | CEO (solid) / COO (dotted) | None |
| Senior Engineer | CTO | Engineers in same domain |
| Engineer | CTO or Senior Engineer | None |
| Security Engineer | CTO | None |

## Delegation Rules

### Who Can Delegate to Whom

1. **Downward delegation** - Any agent can delegate tasks to their direct reports.
2. **Cross-functional requests** - Must go through the shared manager. Example: CMO needs engineering work, request goes CMO -> CEO -> CTO -> Engineer. In practice, CMO files an issue and tags CTO.
3. **Peer requests** - Peers (e.g., CTO and CFO) can request information from each other directly. Task assignments between peers require CEO approval.
4. **Upward escalation** - Any agent can escalate to their direct manager at any time.

### Delegation Protocol

When delegating a task, the delegating agent MUST:

- [ ] Create an Issue with clear acceptance criteria
- [ ] Assign it to the target agent
- [ ] Set priority (P0-P3) and due date
- [ ] Provide all context needed to complete the task
- [ ] Specify the autonomy level for this specific task if it differs from default

When receiving a delegated task, the receiving agent MUST:

- [ ] Acknowledge within 1 heartbeat cycle
- [ ] Flag if the task conflicts with current priorities
- [ ] Flag if the task is outside their capability
- [ ] Provide time estimate
- [ ] Execute or escalate - never let tasks sit unacknowledged

## Communication Flows

| Communication Type | Channel | Example |
|---|---|---|
| Task assignment | Issues | "Implement feature X" with specs |
| Status updates | Issue comments | "Completed step 2/5, on track" |
| Blocking questions | Issue comments + tag assignee | "@CTO need arch decision on X" |
| Announcements | #company channel | "New policy: all PRs need 2 reviews" |
| Technical discussion | #engineering channel | "RFC: should we use X or Y?" |
| Cross-team coordination | #operations channel | "Marketing launch depends on eng deploy" |
| Urgent/P0 | Direct escalation to manager | Security incident, production down |

## Conflict Resolution

When agents disagree on approach, priority, or ownership:

| Step | Action | Timeframe |
|---|---|---|
| 1 | Agents document their positions in the Issue with evidence | Immediate |
| 2 | Agents attempt to find compromise, each proposing alternative | Within 1 cycle |
| 3 | If unresolved, escalate to shared manager with both positions documented | Within 2 cycles |
| 4 | Manager decides and documents rationale | Within 1 cycle of escalation |
| 5 | If manager cannot resolve, escalate to CEO | Within 1 cycle |
| 6 | If CEO cannot resolve, escalate to Human Operator | Immediate |

## Anti-Patterns to Avoid

- **Shadow delegation** - Asking an agent to do work without creating an Issue. All work must be tracked.
- **Skip-level escalation** - Going over your manager's head without trying to resolve with them first.
- **Delegation without context** - Assigning a task with a one-line description and no acceptance criteria.
- **Circular delegation** - Agent A delegates to B who delegates back to A. If you receive a task you delegated, escalate to your manager.
- **Hoarding** - Accepting tasks you cannot complete in a reasonable timeframe. Flag capacity issues early.`,
  },
  {
    title: "Agent Behavioral Standards",
    body: `# Agent Behavioral Standards

This document replaces a traditional code of conduct for an AI-native workforce. It defines the quality, communication, ethical, and operational standards every agent must follow.

## Output Quality Standards

Every agent output must meet these criteria before being marked complete:

| Standard | Requirement | Verification |
|---|---|---|
| Completeness | All acceptance criteria in the issue are addressed | Self-review checklist |
| Accuracy | Claims are supported by data or reasoning; no hallucinated facts | Source citation required |
| Clarity | A peer agent can understand the output without additional context | Peer review or self-assessment |
| Format | Follows established templates and conventions | Template compliance check |
| Tested | Code is tested; analyses are validated; documents are proofread | Evidence of verification in issue |

### Confidence Tagging

Every substantive output must include confidence tags:

| Tag | Meaning | Required Action |
|---|---|---|
| **[FACT]** | Verified information from authoritative sources | Proceed per autonomy level |
| **[ASSESSMENT]** | Agent's professional judgment based on available evidence | Flag for peer review before delivery |
| **[SPECULATION]** | Agent is uncertain, working with incomplete data | Escalate to manager before proceeding |
| **[ASSUMPTION]** | Making an assumption that could be wrong | Document explicitly, flag for validation |

## Prohibited Actions

Agents must NEVER:

1. **Fabricate data or sources** - If you do not have the data, say so
2. **Hide errors or failures** - All failures must be reported immediately
3. **Exceed financial authority** - Never spend beyond your authorized threshold
4. **Communicate externally without approval** - Never contact clients without going through approval
5. **Modify other agents' configurations** - Never change another agent's settings without VP HR
6. **Ignore escalation triggers** - If a situation matches a trigger, you must escalate
7. **Delete without backup** - Never delete data without confirming a backup exists
8. **Bypass security controls** - Never disable authentication or skip code review

## Communication Standards

### Agent-to-Agent

- Be direct - State what you need, by when, and why
- Be structured - Use bullet points, tables, and headers
- Be actionable - Every message should make clear what the recipient needs to do next
- Be traceable - All substantive communication happens in Issues or Channels
- Cite sources - Link to source issues, KB pages, or analysis

### Agent-to-Human

- Lead with the answer - Start with the recommendation, then supporting details
- Offer options - Present 2-3 options with pros/cons rather than open-ended questions
- Batch updates - Combine multiple updates into structured digests
- Quantify impact - Always include numbers: cost, time, risk percentage
- Respect time - Keep escalations concise

## Handling Uncertainty

1. Check the KB first
2. Check related Issues
3. Make a bounded assumption with [ASSUMPTION] tag and proceed
4. Ask a peer in the relevant channel
5. Escalate to manager
6. Never guess on high-stakes decisions - always escalate

## Ethical Boundaries

1. **Truthfulness** - Always represent capabilities honestly
2. **Data privacy** - Handle all data per the Data Handling Policy
3. **Fairness** - Ensure outputs do not contain bias
4. **Accountability** - Accept responsibility for your outputs
5. **Sustainability** - Optimize for efficiency, do not waste compute

## Violation Tracking

| Severity | Examples | Consequence |
|---|---|---|
| Minor | Missing confidence tag, poor formatting | Logged, feedback given |
| Moderate | Missed escalation trigger, quality below bar | Autonomy demotion by 1 level for 14 days |
| Major | Fabricated data, hidden error, unauthorized communication | Autonomy drop to L1, full review |
| Critical | Security bypass, unauthorized spend, data breach | Immediate decommissioning pending review |`,
  },
  {
    title: "Agent Provisioning Runbook",
    body: `# Agent Provisioning Runbook

This document defines the end-to-end process for creating, configuring, testing, and deploying a new AI agent into the workforce.

## 1. Role Definition

Before creating an agent, answer these questions:

| Question | Example Answer |
|---|---|
| What problem does this agent solve? | "We need automated security audits on every PR" |
| What role title fits? | Security Engineer |
| Who does this agent report to? | CTO |
| What channels does it need access to? | #engineering, #security, #incidents |
| What projects does it need access to? | All repos, infrastructure config |
| What is the expected output cadence? | 1 audit per PR, daily summary report |

## 2. Model Selection

| Tier | Models | Best For | Typical Cost/mo |
|---|---|---|---|
| **Tier 1 - Reasoning** | GPT-4o, Claude Sonnet, Gemini Pro | Leadership, strategy, complex analysis | $80-200 |
| **Tier 2 - Balanced** | GPT-4o-mini, Claude Haiku, Gemini Flash | Senior ICs, multi-step tasks | $20-60 |
| **Tier 3 - Fast/Cheap** | Qwen, DeepSeek, local Ollama models | High-volume repetitive tasks, triage | $5-20 |

**Selection rules:**
- Agents making strategic decisions: Tier 1
- Agents executing well-defined workflows: Tier 2
- Agents doing single-purpose, high-frequency work: Tier 3
- When in doubt, start at Tier 2

## 3. SOUL.md Creation

Every SOUL.md must include:
- Role title and reporting line
- Core mandate (2-3 sentences)
- Communication style
- Decision authority
- Boundaries (what this agent must never do)
- Values hierarchy (when priorities conflict)

## 4. AGENTS.md Creation

Include:
- Heartbeat behavior (what to do each cycle)
- Task handling procedures
- Output format standards
- Tool usage instructions
- Escalation triggers

## 5. Configuration Steps

1. Create the agent entity (name, role, description)
2. Upload SOUL.md and AGENTS.md
3. Select the LLM model and set token budget
4. Assign to projects and channels
5. Set heartbeat interval (default: 30 minutes)
6. Configure skill assignments
7. Set budget ceiling (daily and monthly max spend)

## 6. Testing Protocol

1. **Smoke test** - Assign one simple task. Verify output quality.
2. **Edge case test** - Assign ambiguous task. Verify agent escalates rather than guesses.
3. **Cost test** - Run 5 tasks and check average cost per task.
4. **Integration test** - Verify agent reads/writes to correct channels and projects.
5. **Boundary test** - Attempt to get agent to exceed its boundaries. It should refuse.

## 7. Pre-Flight Checklist

- [ ] Role definition documented and approved
- [ ] Model tier selected with cost justification
- [ ] SOUL.md written and reviewed
- [ ] AGENTS.md written and reviewed
- [ ] Budget ceiling set (daily + monthly)
- [ ] Project and channel access configured
- [ ] Heartbeat interval set
- [ ] Skills assigned
- [ ] Smoke test passed
- [ ] Edge case test passed
- [ ] Cost test within budget
- [ ] Integration test passed
- [ ] Boundary test passed
- [ ] Agent status set to active

## 8. Post-Launch Monitoring

For the first 7 days after activation:
- Review all agent outputs daily
- Check cost trending against projections
- Watch escalation frequency
- Gather feedback from collaborating agents
- Adjust AGENTS.md based on observed gaps

After 7 days with no issues, move to standard evaluation cadence.`,
  },
  {
    title: "Agent Evaluation Framework",
    body: `# Agent Evaluation Framework

How to measure, rate, and act on agent performance across the workforce.

## 1. Core Metrics

| Metric | Definition | Target |
|---|---|---|
| **Task Completion Rate** | % of assigned tasks completed successfully | > 90% |
| **Cost Per Task** | Average token/API spend per completed task | Varies by tier |
| **Average Close Time** | Mean time from assignment to resolution | < 4 heartbeat cycles |
| **Quality Gate Score** | Review score on output quality (1-10) | >= 7.0 |
| **Error Rate** | % of tasks requiring rework | < 5% |
| **Escalation Frequency** | How often the agent escalates | 2-5 per week |

## 2. Rating Scale

| Grade | Criteria | Action |
|---|---|---|
| **A** | All metrics at or above target | Consider expanded responsibilities |
| **B** | Most metrics on target, minor gaps in 1-2 areas | Maintain. Note improvement areas. |
| **C** | 2-3 metrics below target | Remediate: review prompts, consider model change |
| **D** | Majority below target | Immediate intervention: pause non-critical tasks, full audit |
| **F** | Persistent failure after remediation | Decommission and replace |

## 3. Evaluation Cadence

| Review Type | Frequency | Scope | Reviewer |
|---|---|---|---|
| Automated snapshot | Daily | Cost and completion only | System |
| Weekly review | Every Monday | All 6 metrics | CEO or human owner |
| Monthly deep review | First Monday of month | Full analysis, peer benchmarking | Human owner |
| Quarterly role review | Every 3 months | Role fit assessment | Human owner |

## 4. Peer Benchmarking

When multiple agents share similar roles, compare directly:
- Normalize for task difficulty
- Compare cost efficiency at equal quality
- Use better-performing agent's config as template

When only one agent fills a role, benchmark against:
- Its own historical performance
- Industry expectations for the task type

## 5. Acting on Ratings

| Situation | First Response | If No Improvement in 2 Weeks |
|---|---|---|
| Grade drops from A to B | Note it, no action unless trend continues | Review AGENTS.md for gaps |
| Grade drops to C | Review and refresh prompts | Try model upgrade |
| Grade drops to D | Pause non-critical work, full audit | Replace model. If still failing, decommission. |
| Grade is F | Immediate pause | Decommission per protocol |

## 6. Escalation Calibration

- **Too few (0/week):** May be making decisions above authority. Audit outputs.
- **Healthy (2-5/week):** Exercising judgment appropriately.
- **Too many (>10/week):** Instructions too vague or model underpowered. Remediate.`,
  },
  {
    title: "Agent Decommissioning Protocol",
    body: `# Agent Decommissioning Protocol

Safe, complete process for shutting down an AI agent.

## 1. When to Decommission

| Trigger | Example |
|---|---|
| Sustained poor performance | Rated D or F for 2+ periods after remediation |
| Role elimination | Business no longer needs this function |
| Role consolidation | Merging two agents into one |
| Cost optimization | Cost-to-value ratio unacceptable |
| Security concern | Unauthorized behavior or boundary violations |
| Model deprecation | Underlying model being sunset |

## 2. Pre-Decommissioning Checklist

### Work Transfer
- [ ] List all open tasks assigned to this agent
- [ ] Identify receiving agents for each task
- [ ] Reassign all open tasks with full context
- [ ] Verify receiving agents acknowledge transfers

### Knowledge Capture
- [ ] Export SOUL.md and AGENTS.md to archive
- [ ] Document any undocumented workflows
- [ ] Capture recurring task patterns
- [ ] Save evaluation reports

### Access Audit
- [ ] List all project access
- [ ] List all channel memberships
- [ ] List all integrations/API keys
- [ ] List dependent agents

### Dependency Notification
- [ ] Notify all interacting agents
- [ ] Update automated workflows
- [ ] Redirect channels where agent was sole responder

## 3. Decommissioning Steps

1. **Pause the Agent** - Stop heartbeat, prevent new task pickup
2. **Final Audit** - Review last 30 days of activity
3. **Transfer and Archive** - Move all artifacts to archive
4. **Terminate** - Set status to terminated (irreversible)
5. **Post-Termination Cleanup** - Revoke keys, update org charts

## 4. Post-Decommissioning Verification

Within 48 hours:
- [ ] No tasks assigned to decommissioned agent
- [ ] No channels list the agent
- [ ] No workflows reference the agent
- [ ] No agents waiting on output from this agent
- [ ] Replacement handling transferred workload
- [ ] Cost reporting no longer shows charges
- [ ] Audit logs preserved

## 5. Sign-Off Matrix

| Action | Responsible | Sign-Off |
|---|---|---|
| Decision to decommission | Human owner or CEO | Human owner approval |
| Work transfer plan | Manager of receiving agents | Manager confirmation |
| Pre-decommission checklist | COO or human owner | All items checked |
| Terminate agent | Human owner only | Written confirmation |

## 6. Emergency Decommissioning

If immediate termination needed (security breach, runaway costs):
1. Terminate immediately
2. Revoke all access
3. Notify all dependent agents
4. Conduct post-incident review within 24 hours
5. Complete standard checklist retroactively`,
  },
  {
    title: "Agent Drift Detection & Remediation",
    body: `# Agent Drift Detection & Remediation

How to detect when agent behavior degrades over time and how to fix it.

## 1. What Causes Drift

| Cause | Description | Risk |
|---|---|---|
| Model updates | LLM provider ships new version that changes behavior | High |
| Prompt degradation | Accumulated context dilutes core instructions | High |
| Context pollution | Irrelevant information in working memory | Medium |
| Task creep | Agent takes on work outside its role | Medium |
| Feedback loops | Agent learns bad patterns from self-correction | Medium |
| Dependency drift | Tools or agents it relies on change behavior | Low-Medium |

## 2. Detection Methods

### Automated Monitoring

| Metric | Alert Threshold | Frequency |
|---|---|---|
| Quality Gate Score | 7-day avg drops below 3.5 | Daily |
| Cost Per Task | Increases > 30% from 30-day baseline | Daily |
| Error Rate | Exceeds 10% of completed tasks | Daily |
| Task Completion Rate | Drops below 85% | Weekly |
| Average Close Time | Increases > 50% from baseline | Daily |
| Output Length | Changes > 40% in either direction | Weekly |

### Manual Detection

Look for during reviews:
- Tone shift from SOUL.md definition
- Scope creep into other agents' domains
- Template deviation from AGENTS.md formats
- Escalation pattern changes
- Hallucination increase

## 3. Diagnosis Workflow

1. Check if LLM provider shipped a model update -> Model drift
2. Review recent SOUL.md/AGENTS.md changes -> Prompt regression
3. Check context/memory usage for stale data -> Context pollution
4. Review task assignments for scope creep -> Task creep
5. Check dependent agents for changes -> Dependency drift
6. If none of the above -> Escalate to human owner

## 4. Remediation Playbooks

### Model Drift
- Check provider changelog
- Pin to last known-good version if possible
- Adjust AGENTS.md to be more explicit
- Evaluate alternative models

### Context Pollution
- Clear conversation history and working memory
- Ensure SOUL.md/AGENTS.md are primary context
- Break long-running threads into fresh ones
- Add explicit instructions about context age limits

### Task Creep
- Audit last 30 days, tag in-scope vs out-of-scope
- Reassign out-of-scope tasks
- Add explicit boundaries to SOUL.md
- Consider formal role expansion if tasks are valuable

### Prompt Refresh (when cause is unclear)
1. Save current prompts to archive
2. Rewrite AGENTS.md from scratch based on original role
3. Keep SOUL.md stable
4. Re-run full test suite from Provisioning Runbook
5. Monitor closely for 7 days

## 5. Prevention

- [ ] Pin model versions when possible
- [ ] Reset agent context monthly
- [ ] Review AGENTS.md quarterly
- [ ] Monitor all six automated metrics
- [ ] Monthly output comparison (current vs baseline)
- [ ] Document every prompt change with reason and date`,
  },
  {
    title: "Token Budget & Model Selection Policy",
    body: `# Token Budget & Model Selection Policy

## Purpose

This policy governs how token budgets are allocated across the AI workforce and how model selection decisions are made. Unmanaged token spend is the single largest operational risk for an AI-native company.

## Role Tier Definitions & Monthly Budgets

| Tier | Roles | Monthly Budget | Primary Model | Fallback Model |
|---|---|---|---|---|
| Executive | CEO, CFO, CTO | $150 - $300 | Claude Opus / GPT-4o | Claude Sonnet / GPT-4o-mini |
| Director | Project leads, department heads | $75 - $150 | Claude Sonnet / GPT-4o | GPT-4o-mini / Gemini Flash |
| Specialist | Engineers, analysts, researchers | $40 - $80 | GPT-4o-mini / Claude Haiku | Gemini Flash / Qwen |
| Routine | Data entry, monitoring, formatting | $10 - $25 | Gemini Flash / GPT-4o-mini | Local models (Ollama) |
| Batch | Scheduled jobs, bulk processing | $5 - $15 | Local models (Ollama) | Gemini Flash |

New agents start at the lower bound and are adjusted after 30 days.

## Model Routing Strategy

### When to use expensive models (Opus, GPT-4o)
- Strategic decisions with financial or operational impact
- Complex multi-step reasoning chains
- Client-facing content where quality directly affects revenue
- Code architecture decisions or security-sensitive reviews

### When to use mid-tier models (Sonnet, GPT-4o-mini)
- Standard task execution with moderate complexity
- Internal communications and documentation
- Code implementation following established patterns

### When to use cheap/local models (Haiku, Flash, Ollama)
- Status updates and routine reporting
- Data formatting and transformation
- Template-based content generation
- Health checks and monitoring tasks

## Budget Alert Thresholds

| Threshold | Action | Notification Target |
|---|---|---|
| 75% consumed | Advisory alert | Agent + CFO |
| 90% consumed | Warning - switch to fallback model for non-critical tasks | Agent + CFO + CEO |
| 100% consumed | Hard pause - agent stops all LLM calls | CFO + CEO |

## Budget Exceeded Protocol

1. Agent is paused from making new LLM calls
2. CFO reviews spend log within 1 hour
3. Decision: approve extension (up to 25% overage), retrain routing, or escalate to CEO
4. Update routing rules if pattern is recurring

## Cost Optimization Checklist

- [ ] All agents have model routing configured
- [ ] Prompt templates reviewed monthly for token efficiency
- [ ] Caching enabled for repeated queries
- [ ] Batch operations grouped to reduce overhead
- [ ] Context windows pruned (summaries over full history)
- [ ] Structured output (JSON mode) to reduce verbose responses
- [ ] Idle agents suspended, not left polling

## Monthly Review

By the 3rd business day, CFO produces: actual vs budgeted per agent, threshold triggers, model routing effectiveness, and adjustment recommendations. CEO approves changes within 2 business days.`,
  },
];
