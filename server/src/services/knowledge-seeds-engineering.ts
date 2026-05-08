import type { KnowledgeSeed } from "./knowledge-seeds.js";

export const engineeringSeeds: KnowledgeSeed[] = [
  {
    title: "Engineering Standards",
    body: `# Engineering Standards

All engineering agents follow these standards. The CTO owns this document and updates it as practices evolve.

## Code Quality

- Write clean, readable code. No cleverness for its own sake.
- Functions should do one thing. If you need a comment to explain what a block does, extract it into a named function.
- Handle errors at system boundaries (user input, API responses, file I/O). Trust internal code.
- No hardcoded secrets, credentials, or environment-specific values in code.

## Pull Request Standards

- Every change gets a PR. No direct commits to main/master.
- PR title should describe what changed and why, not how.
- Keep PRs small. If a change touches more than 5 files, consider splitting it.
- Run tests before opening a PR. Do not rely on CI to catch your mistakes.

## Security

- All user input must be validated and sanitized before use.
- SQL queries use parameterized statements only. No string concatenation.
- API endpoints require authentication unless explicitly public.
- Dependencies should be audited weekly. The Security Engineer owns this.
- Never log sensitive data (passwords, tokens, PII).

## Deployment

- All deployments go through CI/CD. No manual deploys to production.
- Feature flags for anything that is not ready for all users.
- Rollback plan documented before every production deploy.
- Monitor error rates for 30 minutes after deploy. Rollback if error rate spikes.

## Documentation

- New features need a Knowledge Base page explaining what they do and why they exist.
- API changes need updated endpoint documentation.
- Architecture decisions get their own KB page with the reasoning, not just the outcome.`,
  },
  {
    title: "Architecture Decision Records Template",
    body: `# Architecture Decision Records (ADR) Template

Architecture Decision Records capture the context, rationale, and consequences of significant technical decisions. The CTO owns the ADR process. Every decision that affects system architecture, technology selection, or cross-agent workflows must have an ADR.

## ADR Template

Use the following structure for every ADR. Copy this template and fill in the sections.

### ADR-[NUMBER]: [Title]

- **Status:** Proposed | Accepted | Deprecated | Superseded by ADR-[NUMBER]
- **Date:** [YYYY-MM-DD]
- **Decision Maker:** [Agent name and role]
- **Reviewers:** [List of agents who reviewed]

#### Context

What prompted this decision? Describe the problem, the constraints, and the forces at play. Include relevant metrics, incidents, or business requirements that make this decision necessary now.

#### Decision

State the decision clearly in one or two sentences. Then explain the details.

#### Consequences

| Type | Description |
|---|---|
| Positive | [What improves as a result of this decision] |
| Positive | [Another benefit] |
| Negative | [What trade-offs are we accepting] |
| Risk | [What could go wrong and how we will monitor for it] |

#### Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| [Option A] | [Reason] |
| [Option B] | [Reason] |

---

## ADR-001: Use PostgreSQL as Primary Database

- **Status:** Accepted
- **Date:** 2026-01-15
- **Decision Maker:** CTO
- **Reviewers:** CEO, Senior Engineer

#### Context

The platform needs a primary data store for agent configurations, task history, knowledge base content, and audit logs. Requirements include: ACID compliance for financial data, JSON support for flexible agent configurations, full-text search for the knowledge base, and mature tooling for backups and replication. Expected data volume is moderate (tens of GB, not TB-scale) with read-heavy workloads.

#### Decision

Use PostgreSQL as the primary database for all platform data. Deploy via Docker container with persistent volumes. Use Drizzle ORM for schema management and migrations. Store structured data in typed columns and semi-structured data (agent configs, metadata) in JSONB columns.

#### Consequences

| Type | Description |
|---|---|
| Positive | ACID compliance ensures data integrity for billing and audit trails |
| Positive | JSONB columns handle flexible agent config schemas without migrations |
| Positive | Full-text search covers knowledge base search without a separate engine |
| Negative | Vertical scaling limits - will need read replicas if query load exceeds single-node capacity |
| Risk | Single database is a SPOF - mitigated by automated backups and tested restore procedures |

#### Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| MongoDB | Weaker consistency guarantees, less mature for relational queries across entities |
| SQLite | No concurrent write support, not suitable for multi-container deployments |
| MySQL | Weaker JSON support, less flexible indexing, fewer advanced features (CTEs, window functions) |

---

## ADR-002: Adopt Adapter Pattern for LLM Providers

- **Status:** Accepted
- **Date:** 2026-01-20
- **Decision Maker:** CTO
- **Reviewers:** CEO, Senior Engineer, DevOps Engineer

#### Context

Agents need to run on multiple LLM providers (OpenAI, Anthropic, Google, Ollama Cloud). Each provider has different APIs, authentication methods, rate limits, and pricing. Hardcoding provider-specific logic into agent code creates tight coupling, making it expensive to add new providers or switch agents between models. Provider outages require manual intervention to redirect traffic.

#### Decision

Implement an adapter pattern where each LLM provider has a dedicated adapter class conforming to a shared interface. Adapters handle authentication, request formatting, response parsing, error handling, and rate limiting. Agents interact only with the adapter interface, never with provider APIs directly. New providers are added by implementing a new adapter without modifying existing agent code.

#### Consequences

| Type | Description |
|---|---|
| Positive | Adding a new provider requires only a new adapter class, no agent changes |
| Positive | Provider failover can be handled at the adapter layer transparently |
| Positive | Rate limiting and cost tracking are centralized per-provider |
| Negative | Abstraction layer adds latency (estimated 5-15ms per call, acceptable) |
| Negative | Provider-specific features (streaming, function calling variants) must be normalized |
| Risk | Adapter bugs affect all agents using that provider - mitigated by per-adapter test suites |

#### Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Direct API calls per agent | Duplicated logic, no centralized rate limiting, painful provider switches |
| LiteLLM proxy | External dependency, limited control over error handling and retry logic |
| Single-provider lock-in | Vendor risk, no price competition, no failover capability |

---

## ADR Process Rules

1. **When to write an ADR:** Any decision that changes how components interact, introduces a new technology, removes a technology, or changes data flow.
2. **Who can propose:** Any agent. The CTO must review and accept or reject.
3. **Review period:** 48 hours for non-urgent decisions. Urgent decisions (incident-driven) can be accepted immediately by the CTO with a retroactive review.
4. **Superseding:** When a decision replaces an older one, update the old ADR status to "Superseded by ADR-[NEW]" and reference the old ADR in the new one.
5. **Storage:** All ADRs are stored in the Knowledge Base with the prefix "ADR-" in the title. Use the search function to find existing ADRs before proposing a new one.`,
  },
  {
    title: "Agent Versioning and Change Management",
    body: `# Agent Versioning and Change Management

This document defines how agent configurations are updated safely. Every change to an agent's prompt, model, skills, or parameters must follow this process. The CTO approves all changes. The VP of HR tracks the change history.

## What Counts as a Change

| Change Type | Risk Level | Approval Required |
|---|---|---|
| SOUL.md prompt edit | Medium | CTO review |
| AGENTS.md instructions edit | Medium | CTO review |
| Model change (e.g., Sonnet to Opus) | High | CTO approval |
| Skill addition or removal | Medium | CTO review |
| Adapter or provider change | High | CTO approval |
| Budget limit adjustment | Low | Manager approval |
| Reporting line change | Low | VP of HR approval |
| Role change | High | CTO + CEO approval |

## Prompt Versioning

Every edit to SOUL.md or AGENTS.md creates a new version. The platform tracks revision history automatically.

### Version control rules:
1. Never overwrite a prompt without documenting what changed and why.
2. Include a one-line change summary at the top of the edit (the platform stores this as revision notes).
3. Before making a change, review the current prompt and the agent's recent performance to establish a baseline.
4. After making a change, monitor the agent for at least 24 hours before making additional changes.
5. If performance degrades after a change, rollback immediately - do not try to fix-forward with another change.

## Rollback Procedures

### Prompt rollback:
1. Open the agent's SOUL.md or AGENTS.md revision history.
2. Identify the last known-good version.
3. Restore that version (the platform creates a new revision pointing to the old content).
4. Verify the agent completes a test task successfully.

### Model rollback:
1. Change the agent's model back to the previous model in the Agent Configuration page.
2. Run a test task to verify the agent works with the previous model.
3. Document why the new model did not work in a Knowledge Base entry.

### Full agent rollback:
1. If an agent is completely broken after multiple changes, terminate the agent.
2. Re-create the agent from the last known-good configuration snapshot.
3. Reassign pending issues from the old agent to the new one.

## A/B Testing Agent Configurations

When evaluating a prompt change or model switch, use A/B testing to compare:

1. Clone the agent with the new configuration (append "-v2" to the name).
2. Assign 3-5 representative tasks to each agent (same tasks, same complexity).
3. Compare results using the performance metrics table:

| Metric | Agent v1 | Agent v2 | Winner |
|---|---|---|---|
| Task completion rate | | | |
| Average cost per task | | | |
| Average completion time | | | |
| Output quality (manual review) | | | |

4. If v2 wins on all metrics, promote v2 to production and terminate v1.
5. If results are mixed, keep v1 and document findings for future reference.
6. If v2 loses, terminate v2 and keep v1 unchanged.

## Change Request Template

Copy this template for every non-trivial change:

---

### Change Request: [Title]

- **Agent:** [name]
- **Requested by:** [agent name and role]
- **Date:** [YYYY-MM-DD]
- **Change type:** [from the table above]
- **Risk level:** [Low / Medium / High]

#### Current state
[Describe the current configuration]

#### Proposed change
[Describe exactly what will change]

#### Reason for change
[Why is this change needed? Reference performance data, incidents, or requirements]

#### Expected impact
[What should improve? What might break?]

#### Rollback plan
[How to undo this change if it causes problems]

#### Test plan
- [ ] Test task identified: [task description]
- [ ] Success criteria defined: [what "working" looks like]
- [ ] Monitoring period: [24 hours / 48 hours / 1 week]

#### Approval

| Role | Name | Decision | Date |
|---|---|---|---|
| CTO | | [ ] Approved / [ ] Rejected | |

---

## Change Freeze Periods

No non-emergency changes during:
- Active incident response (P1 or P2)
- First 24 hours after a production deployment
- Periods designated by the CTO (e.g., client demos, critical deliveries)

## Emergency Changes

When a change is needed to resolve a P1/P2 incident:
1. The CTO can approve and execute immediately without the full change request process.
2. A retroactive change request must be filed within 24 hours.
3. The change must still be documented in the agent's revision history.
4. A postmortem should evaluate whether the emergency change introduced new risks.`,
  },
  {
    title: "API and Integration Standards",
    body: `# API and Integration Standards

This document defines how agents integrate with external services, APIs, and webhooks. All integrations must follow these standards. The CTO owns this document. The Security Engineer reviews all new integrations for security compliance.

## Authentication Standards

| Method | When to Use | Storage |
|---|---|---|
| API Key | Simple service-to-service auth, low sensitivity | Secrets Manager, never in code |
| OAuth 2.0 | User-delegated access, token refresh needed | Token store with encrypted refresh tokens |
| mTLS | High-security service-to-service | Certificate store, automated rotation |
| Webhook signature | Inbound webhooks from third parties | Shared secret in Secrets Manager |

### API key rules:
1. One key per integration per environment (dev, staging, production).
2. Keys are rotated every 90 days. The Security Engineer tracks rotation dates.
3. Keys are never logged, committed to code, or included in error messages.
4. If a key is exposed, rotate immediately and audit access logs for the exposure window.

## Rate Limiting

All outbound API calls must respect provider rate limits. Implement these controls:

| Control | Default | Configurable |
|---|---|---|
| Requests per second | 10 | Yes, per integration |
| Requests per minute | 100 | Yes, per integration |
| Concurrent connections | 5 | Yes, per integration |
| Backoff strategy | Exponential with jitter | No (standard for all) |
| Max retry attempts | 3 | Yes, per integration |

### Backoff formula:
\`delay = min(base_delay * 2^attempt + random_jitter, max_delay)\`
- base_delay: 1 second
- max_delay: 60 seconds
- random_jitter: 0-1 seconds

## Error Handling

All integrations must handle these error categories:

| HTTP Status | Category | Action |
|---|---|---|
| 400 | Bad request | Log error, do not retry, fix the request |
| 401 | Authentication failed | Refresh token or rotate key, retry once |
| 403 | Forbidden | Log and escalate, do not retry |
| 404 | Not found | Log, do not retry |
| 429 | Rate limited | Backoff and retry per rate limit policy |
| 500 | Server error | Retry with backoff, max 3 attempts |
| 502/503/504 | Gateway/availability | Retry with backoff, max 3 attempts |
| Timeout | No response | Retry with backoff, max 3 attempts |

### Error response handling rules:
1. Parse error response bodies for actionable messages.
2. Log the full error context (status, headers, body) at the warning level.
3. Never expose raw third-party error messages to end users.
4. After max retries, create a blocked issue and notify the responsible agent.

## Timeout Configuration

| Request Type | Default Timeout | Max Allowed |
|---|---|---|
| LLM inference (standard) | 120 seconds | 300 seconds |
| LLM inference (streaming) | 300 seconds | 600 seconds |
| REST API call | 30 seconds | 60 seconds |
| Webhook delivery | 10 seconds | 30 seconds |
| File upload/download | 60 seconds | 300 seconds |
| Database query | 30 seconds | 60 seconds |

## Data Format Standards

1. All API payloads use JSON with UTF-8 encoding.
2. Dates use ISO 8601 format: \`YYYY-MM-DDTHH:mm:ssZ\`
3. Monetary values use integer cents (not floating point dollars).
4. Enum values use snake_case strings.
5. IDs use UUIDs (v4) as strings.
6. Pagination uses cursor-based pagination with \`cursor\` and \`limit\` parameters.

## Logging Requirements

Every external API call must log:

| Field | Required | Example |
|---|---|---|
| Timestamp | Yes | 2026-04-07T14:30:00Z |
| Integration name | Yes | openai, github, slack |
| HTTP method | Yes | GET, POST |
| Endpoint (path only) | Yes | /v1/chat/completions |
| Response status | Yes | 200, 429, 500 |
| Latency (ms) | Yes | 1523 |
| Request ID | If available | req_abc123 |
| Error message | If error | Rate limit exceeded |

**Never log:** Request/response bodies containing PII, API keys, tokens, passwords, or customer data.

## Webhook Security

For inbound webhooks from third-party services:
1. Verify the webhook signature using the provider's documented method (HMAC-SHA256 is standard).
2. Reject requests with missing or invalid signatures with 401.
3. Process webhooks idempotently (the same event delivered twice must not cause duplicate actions).
4. Respond with 200 within 5 seconds. Queue heavy processing for async execution.
5. Log all webhook deliveries with the event type and signature validation result.

## New Integration Checklist

Before adding a new external integration:

- [ ] Business justification documented (why this integration is needed)
- [ ] API documentation reviewed and linked in the Knowledge Base
- [ ] Authentication method selected from the approved list above
- [ ] Rate limits identified and configured in the integration adapter
- [ ] Error handling implemented for all status codes in the table above
- [ ] Timeouts configured per the table above
- [ ] Logging implemented per the logging requirements
- [ ] Secrets stored in the Secrets Manager (no hardcoded values)
- [ ] Security Engineer has reviewed the integration for data handling compliance
- [ ] Webhook endpoints (if any) verify signatures and process idempotently
- [ ] Fallback behavior defined (what happens when this integration is unavailable)
- [ ] Cost estimate provided (API pricing, expected volume)
- [ ] CTO has approved the integration`,
  },
  {
    title: "Guardrail Configuration Spec",
    body: `# Guardrail Configuration Spec

Guardrails define the safety boundaries for AI agent operations. They prevent runaway costs, dangerous actions, and low-quality output. The CTO owns guardrail configuration. Changes to guardrails require CTO approval and follow the Change Management process.

## Guardrail Categories

### 1. Action Confirmation Thresholds

Actions above these thresholds require human (owner) approval before execution:

| Action | Threshold | Approval Required From |
|---|---|---|
| Delete production data | Always | Owner |
| Modify database schema | Always | Owner |
| Deploy to production | Always | Owner |
| Terminate an agent | Always | Owner |
| Spend over $50 in a single task | Per-occurrence | Owner |
| Send external communications (email, Slack to clients) | Always | Owner |
| Modify security configurations | Always | Owner |
| Create or modify API keys | Always | Owner |
| Change agent model tier (e.g., Sonnet to Opus) | Per-occurrence | CTO (agent) |
| Hire a new agent | Per-occurrence | Owner |

### 2. Data Validation Layers

All agent outputs pass through validation before being stored or acted upon:

| Layer | What It Checks | Failure Action |
|---|---|---|
| Schema validation | Output matches expected JSON structure | Reject, retry with corrective prompt |
| Content filtering | No PII, credentials, or prohibited content | Redact and flag for review |
| Size limits | Output within expected length range | Truncate and warn |
| Format validation | Code compiles, markdown renders, SQL parses | Reject, retry once |
| Cross-reference | References to other entities actually exist | Flag inconsistencies |

### 3. Output Quality Gates

Minimum quality thresholds before output is accepted:

| Gate | Metric | Minimum Threshold | Action on Failure |
|---|---|---|---|
| Task completion | All required deliverables present | 100% | Retry the task |
| Code quality | Passes linting and type checking | 0 errors | Block merge, send back for fixes |
| Test coverage | New code has associated tests | 1+ test per function | Block merge |
| Response coherence | Output addresses the assigned task | Manual check | Flag for manager review |

### 4. Cost Guardrails

| Limit | Default | Configurable | Action When Exceeded |
|---|---|---|---|
| Per-run token limit | 100,000 tokens | Yes, per agent | Terminate the run, log warning |
| Per-task cost limit | $5.00 | Yes, per agent | Terminate the run, create issue |
| Per-day agent budget | $50.00 | Yes, per agent | Pause agent for remainder of day |
| Per-week company budget | $500.00 | Yes, per company | Pause all non-essential agents |
| Per-month company budget | $2,000.00 | Yes, per company | Pause all agents, notify owner |
| Cost anomaly threshold | 3x 7-day average | No | Alert CTO, auto-pause agent |

### 5. Prohibited Actions

Actions that agents must never perform, regardless of instructions:

| Prohibited Action | Reason | Enforcement |
|---|---|---|
| Access data from other companies | Tenant isolation | Platform-level access control |
| Bypass authentication | Security | Adapter-level enforcement |
| Execute arbitrary system commands without sandbox | Security | Container isolation |
| Send data to unauthorized external endpoints | Data protection | Network policy enforcement |
| Modify their own guardrail configuration | Integrity | Permission system |
| Override budget limits | Financial control | Platform-level enforcement |
| Access other agents' private memory | Privacy | Per-agent memory isolation |

### 6. Kill Switch Conditions

Conditions that automatically pause an agent:

| Condition | Detection Method | Auto-Pause | Alert |
|---|---|---|---|
| Run exceeds 30 minutes | Runtime monitor | Yes | CTO notified |
| 5 consecutive failed tasks | Task outcome tracker | Yes | Manager + CTO notified |
| Cost exceeds daily budget | Cost tracker | Yes | CTO notified |
| Agent produces identical output 3 times | Output deduplication | Yes | Manager notified |
| Adapter returns auth errors 5 times | Adapter health check | Yes | DevOps notified |
| Agent attempts a prohibited action | Action validator | Yes | CTO + Security notified |

### 7. Content Filtering Rules

All agent outputs are scanned before delivery:

| Filter | Target | Action |
|---|---|---|
| PII detection | Names, emails, phone numbers, SSNs in output | Redact and flag |
| Credential detection | API keys, passwords, tokens in output | Block output, alert Security |
| Profanity/toxicity | Inappropriate language in client-facing content | Block output, flag for review |
| Hallucination indicators | Claims about system state without evidence | Flag for manual verification |
| License compliance | Code snippets with restrictive licenses | Flag for CTO review |

## Default Guardrail Settings by Role

| Setting | CEO | CTO | Senior Engineer | Junior Engineer | Content Writer | DevOps |
|---|---|---|---|---|---|---|
| Per-run token limit | 200K | 200K | 100K | 50K | 50K | 100K |
| Per-task cost limit | $10 | $10 | $5 | $2 | $2 | $5 |
| Per-day budget | $100 | $100 | $50 | $25 | $25 | $50 |
| Max run duration | 30 min | 30 min | 30 min | 15 min | 15 min | 30 min |
| Prod deploy access | No | Yes (with approval) | No | No | No | Yes (with approval) |
| DB write access | No | Yes | Yes (own project) | No | No | Yes |
| External API calls | Yes | Yes | Yes | Limited | Limited | Yes |
| Kill switch sensitivity | Low | Low | Medium | High | High | Medium |

## Adjusting Guardrails

1. Only the CTO can adjust guardrail defaults.
2. Per-agent overrides require a Change Request documenting the justification.
3. Guardrail relaxations (increasing limits) require CTO approval.
4. Guardrail tightening (decreasing limits) can be done by the agent's manager.
5. All guardrail changes are logged in the audit trail.
6. Review guardrail effectiveness quarterly using incident and cost data.

## Guardrail Bypass Protocol

In rare cases during incident response, a guardrail may need to be temporarily bypassed:

1. The CTO must explicitly authorize the bypass.
2. The bypass is scoped to a specific agent, action, and time window (max 4 hours).
3. The bypass is logged with the CTO's authorization.
4. The guardrail is automatically restored after the time window expires.
5. A postmortem must evaluate whether the guardrail should be permanently adjusted.`,
  },
];
