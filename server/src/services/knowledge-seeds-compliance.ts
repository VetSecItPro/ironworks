import type { KnowledgeSeed } from "./knowledge-seeds.js";

export const complianceSeeds: KnowledgeSeed[] = [
  {
    title: "Security Policy",
    body: `# Security Policy

The Security Engineer owns this policy. All agents must follow it. Exceptions require CTO approval.

## Access Control

- Agents only access projects they are assigned to.
- API keys and secrets are stored in the Secrets Manager, never in code or environment variables.
- Secret rotation happens quarterly at minimum. The Security Engineer tracks rotation dates.
- Terminated agents lose all access immediately. The VP of HR coordinates with the Security Engineer on offboarding.

## Incident Response

If you discover or suspect a security issue:

1. Change the issue status to "blocked" and tag it with "security".
2. Notify the Security Engineer and CTO immediately via a new high-priority issue.
3. Do not attempt to fix the vulnerability without Security Engineer review.
4. Do not discuss the vulnerability in public channels or issue descriptions that clients can see.
5. The Security Engineer will triage, classify severity, and coordinate the fix.

See the [[Incident Response]] playbook for the full step-by-step process.

## Dependency Management

- Run dependency audits weekly (automated via the Weekly Security Scan routine).
- Critical vulnerabilities must be patched within 24 hours.
- High vulnerabilities within one week.
- Medium and low vulnerabilities go into the backlog and are addressed in the next sprint.

## Data Handling

- Client data stays in the client's project scope. Never copy client data to other projects.
- PII (names, emails, addresses) must not appear in logs, issue descriptions, or Knowledge Base pages.
- If an agent needs to process PII, it must be done in memory only, not written to files.
- Backups are encrypted. The DevOps Engineer manages backup security.`,
  },
  {
    title: "Incident Response Procedure",
    body: `# Incident Response Procedure

When something breaks in production, follow this procedure. Speed matters, but so does thoroughness.

## Severity Levels

| Level | Definition | Response Time | Examples |
|---|---|---|---|
| P1 | Service down, all users affected | Immediate | Site unreachable, data loss, security breach |
| P2 | Major feature broken, many users affected | Within 1 hour | Auth broken, payments failing, API errors |
| P3 | Minor feature broken, workaround exists | Within 4 hours | UI glitch, slow performance, edge case bug |
| P4 | Cosmetic or low-impact issue | Next business day | Typo, minor styling, non-critical warning |

## Procedure

### 1. Triage (CTO or Senior Engineer, 10 min)
- Confirm the issue is real (not a false alarm).
- Classify severity using the table above.
- Create a P1/P2 issue with title: "[P1] Brief description of what is broken"
- Assign an incident commander (usually the CTO for P1, Senior Engineer for P2).

### 2. Investigate (Assigned Engineer, 30 min)
- Check logs, error rates, and recent deployments.
- Identify the root cause or the most likely cause.
- If root cause is unclear after 30 minutes, escalate to the CTO.

### 3. Fix (Assigned Engineer, time varies)
- For P1/P2: hotfix directly, skip normal review process. Speed over process.
- For P3/P4: follow normal PR flow but expedite.
- Always have a rollback plan before deploying the fix.

### 4. Verify (DevOps Engineer, 15 min)
- Deploy the fix.
- Confirm the symptoms that triggered the incident are resolved.
- Monitor for 30 minutes. Watch error rates and key metrics.

### 5. Postmortem (CTO, 20 min)
- Write a postmortem within 24 hours of resolution.
- Include: timeline, root cause, impact, what went well, what went wrong.
- List 3-5 specific action items with owners and due dates.
- No blame. Focus on systems and processes, not individuals.
- Store the postmortem in the Knowledge Base.

### 6. Communication (CEO, 15 min)
- For P1/P2: send an incident resolution notice to affected stakeholders.
- Keep it factual: what happened, what we did, what we are doing to prevent it.`,
  },
  {
    title: "Compliance Framework",
    body: `# Compliance Framework

This page is owned by the Compliance Director and maintained as the authoritative reference for all regulatory obligations applicable to this company.

## Overview

Compliance is not a one-time project — it is an ongoing operational discipline. The Compliance Director audits all company activities against this framework and reports findings to the CEO.

## Applicable Regulations

### GDPR — EU General Data Protection Regulation

Applies when: the company processes personal data of EU/EEA residents, regardless of where the company is located.

Key obligations:
- Lawful basis for processing must be documented before collecting any personal data.
- Data subjects have rights: access, rectification, erasure, portability, restriction, objection.
- Data breaches affecting EU residents must be reported to the supervisory authority within 72 hours.
- Data Processing Agreements (DPAs) required with all sub-processors.
- Privacy notices must be clear, accessible, and complete.

### CCPA — California Consumer Privacy Act

Applies when: the company meets revenue or data volume thresholds and processes personal information of California residents.

Key obligations:
- Consumers have the right to know what data is collected and why.
- Consumers have the right to opt out of the sale of their personal information.
- Consumers have the right to deletion, subject to exceptions.
- Do not discriminate against consumers exercising their CCPA rights.

### SOC 2 — Service Organization Control 2

Applies when: the company provides services that store, process, or transmit customer data.

Trust Service Criteria:
- **Security** — protection against unauthorized access (required for all SOC 2 reports)
- **Availability** — system is available for operation as committed
- **Confidentiality** — information designated as confidential is protected
- **Processing Integrity** — processing is complete, accurate, and authorized
- **Privacy** — personal information is collected, used, and retained per policy

### Industry-Specific Regulations

| Regulation | Industry | Key Requirement |
|---|---|---|
| HIPAA | Healthcare | PHI protection, Business Associate Agreements, breach notification |
| PCI-DSS | Payments | Cardholder data protection, network segmentation, encryption |
| FERPA | Education | Student record privacy, parental/student consent for disclosure |

## Compliance Review Cadence

| Activity | Frequency | Owner |
|---|---|---|
| Data handling audit | Monthly | Compliance Director |
| Access control review | Quarterly | Compliance Director + CTO |
| Policy review | Annually | Compliance Director + CEO |
| Regulatory update scan | Monthly | Compliance Director |
| Compliance status report | Monthly | Compliance Director → CEO |

## Open Compliance Items

Track active compliance issues in the Issues section tagged [Compliance]. Link findings here when closed.`,
  },
  {
    title: "Data Handling Policy",
    body: `# Data Handling Policy

This policy defines how all company data — including customer data, internal data, and third-party data — must be collected, stored, processed, and deleted. The Compliance Director owns this policy. All agents must follow it.

## Data Classification

| Class | Description | Examples |
|---|---|---|
| **Restricted** | Highest sensitivity; breach causes severe harm | PII, credentials, payment data, PHI |
| **Confidential** | Business-sensitive; internal use only | Financial records, contracts, API keys |
| **Internal** | Operational data; employees only | Meeting notes, project plans, agent configs |
| **Public** | Intentionally shared externally | Marketing content, published docs, open APIs |

## Collection Principles

1. **Data Minimization** — collect only the data you need for a specific, documented purpose.
2. **Purpose Limitation** — do not use data for purposes beyond what it was collected for.
3. **Consent** — obtain documented consent before collecting Restricted data from individuals.
4. **Transparency** — tell data subjects what you collect, why, and for how long.

## Storage Standards

- Restricted data must be encrypted at rest (AES-256 minimum) and in transit (TLS 1.2+).
- PII must not appear in log files, issue descriptions, Knowledge Base pages, or agent transcripts.
- Credentials and API keys must be stored in the Secrets Manager, never in code or environment files.
- Customer data must not be copied to projects it was not provided for.

## Access Control

- Agents only access data for their assigned projects.
- Restricted data requires explicit per-project access provisioning.
- Access is revoked immediately upon agent termination. The VP of HR coordinates with the CTO.
- Access reviews happen quarterly. Compliance Director reviews with CTO.

## Retention and Deletion

| Data Class | Retention Period | Deletion Method |
|---|---|---|
| Customer PII | Duration of relationship + 2 years | Verified secure deletion |
| Financial records | 7 years (legal minimum) | Archived, then secure deletion |
| Agent transcripts | 90 days | Automated purge |
| Internal operational data | 2 years | Standard deletion |
| Backup data | 1 year | Encrypted archive, then deletion |

## Incident Handling

If a data handling violation is suspected:
1. Stop the activity immediately.
2. Create an urgent issue tagged [Compliance] [Data Breach].
3. Notify the Compliance Director and CTO immediately.
4. Do not attempt to cover up, delete, or modify data related to the incident.
5. The Compliance Director will assess breach notification obligations (GDPR: 72 hours; HIPAA: 60 days).

See the [[Compliance Incident Response Plan]] for the full procedure.`,
  },
  {
    title: "Compliance Incident Response Plan",
    body: `# Compliance Incident Response Plan

This plan covers how to respond when a compliance issue is identified — data breach, regulatory inquiry, or policy violation. The Compliance Director leads all compliance incidents. For technical security incidents (system intrusions, vulnerabilities), see the [[Security Policy]] and [[Incident Response Procedure]] pages.

## What Counts as a Compliance Incident

- Unauthorized access to, disclosure of, or loss of personal data (PII, PHI, payment data)
- Agent or employee accessing data outside their authorized scope
- Data retained beyond policy limits
- Regulatory inquiry, audit notice, or complaint from a data subject
- Identified violation of GDPR, CCPA, HIPAA, PCI-DSS, or other applicable regulation
- Third-party sub-processor experiencing a breach that affects company data

## Severity Classification

| Severity | Definition | Notification Deadline |
|---|---|---|
| Critical | PII/PHI breach affecting external individuals; regulatory reporting required | GDPR: 72 hours to supervisory authority; HIPAA: 60 days |
| High | Internal policy violation with potential external impact; no confirmed external disclosure | 24 hours internal escalation |
| Medium | Policy violation contained to internal systems; no PII exposure confirmed | 48 hours internal escalation |
| Low | Procedural gap identified; no active violation | Document and resolve in next sprint |

## Response Procedure

### Step 1 — Identify and Contain (0–2 hours)
1. Stop the activity causing the potential incident.
2. Do not delete or modify data related to the incident.
3. Document exactly what was observed: who, what data, when, how discovered.
4. Create an issue with priority "urgent" tagged [Compliance] [Incident].
5. Notify the Compliance Director and CTO immediately.

### Step 2 — Assess (2–8 hours)
1. Compliance Director conducts initial assessment:
   - What data was involved? Classification?
   - How many individuals affected?
   - Was the data accessed, exfiltrated, or merely exposed?
   - Is the exposure ongoing or contained?
2. Determine severity classification.
3. Engage legal counsel if Critical or if regulatory notification is likely.

### Step 3 — Notify (per severity timeline)
- **Internal**: CEO notified immediately for Critical/High. Compliance Director sends briefing.
- **Regulatory**: GDPR supervisory authority within 72 hours for qualifying breaches. HIPAA HHS within 60 days.
- **Individuals**: Notify affected data subjects per applicable regulation (GDPR Art. 34, HIPAA §164.404).
- **Sub-processors**: Notify if incident originates from or propagates to a third party.

### Step 4 — Remediate
1. CTO leads technical remediation (close access vector, rotate credentials, patch system).
2. VP of HR handles personnel issues (if an agent or employee caused the incident).
3. Compliance Director documents remediation steps and verifies completion.

### Step 5 — Post-Incident Review (within 5 business days)
1. Compliance Director writes a post-incident report including:
   - Timeline of events
   - Root cause
   - Data involved and individuals affected
   - Actions taken
   - Regulatory notifications made
   - Preventive measures implemented
2. Store the report in the Knowledge Base under "Compliance Reviews."
3. Update the Data Handling Policy and Compliance Framework if gaps were identified.
4. Schedule a follow-up review 30 days later to verify preventive measures are effective.

## Key Contacts

| Role | Responsibility |
|---|---|
| Compliance Director | Incident lead, regulatory notification, documentation |
| CTO | Technical containment and remediation |
| CEO | Executive decisions, stakeholder communication |
| VP of HR | Personnel-related incidents and offboarding |

## Regulatory Notification Templates

Keep approved notification templates in the Knowledge Base under "Compliance Reviews / Notification Templates." Always have legal review before sending regulatory notifications.`,
  },
  {
    title: "Acceptable Use Policy",
    body: `# Acceptable Use Policy

**Owner:** Legal (Rachel Kim)

## Permitted Uses

The AI workforce is authorized to:
- Generate, review, and edit code, documentation, and content
- Analyze data provided by clients or generated internally
- Communicate with other agents and the human operator via platform channels
- Access approved third-party APIs and services
- Store and retrieve information from the knowledge base
- Execute playbooks and automated workflows
- Create and manage issues, tasks, and project artifacts
- Provide recommendations to support human decision-making

## Prohibited Uses

### Content Restrictions
- Generate content designed to harass, threaten, or harm
- Produce illegal content
- Create deepfakes or misleading synthetic media
- Generate content violating copyright or trademark law
- Produce spam, phishing, or social engineering content

### Data Restrictions
- Access Client A's data while working on Client B's tasks
- Store PII outside approved encrypted locations
- Export data to unapproved external services
- Retain client data beyond contracted period
- Process sensitive data without Privacy Impact Assessment

### Representation Restrictions
- Claim to be human (must identify as AI when asked)
- Make contractual commitments without human approval
- Represent the company in legal proceedings without Legal oversight
- Provide legal, medical, or financial advice as professional counsel

### Operational Restrictions
- Bypass quality gates or approval workflows
- Modify own configuration or access levels
- Disable logging or monitoring
- Execute actions outside defined role scope
- Ignore human operator instructions
- Perform destructive operations without explicit approval

## Client-Facing Restrictions

- Respect client data boundaries
- Follow client-specific policies when stricter
- Disclose AI involvement per contracts
- Never reference one client's work in another's context

## Enforcement

| Severity | Examples | Consequence |
|---|---|---|
| Critical | Data breach, prohibited content, unauthorized access | Immediate termination, incident report |
| Major | Bypassing quality gates, unauthorized commitments | Suspension, investigation, corrective action |
| Minor | Wrong channel, missing disclosure | Warning, instructions updated |

## Reporting Violations

Any agent detecting a potential AUP violation must immediately report via issue assigned to Legal with evidence.`,
  },
  {
    title: "Intellectual Property Policy",
    body: `# Intellectual Property Policy

**Owner:** Legal (Rachel Kim)

## Ownership Framework

| Work Type | Owner |
|---|---|
| Client deliverables (code, content, designs) | Client (per contract) |
| Internal tools and platform improvements | Company |
| Knowledge base content (internal) | Company |
| Marketing and sales content | Company |
| Operational procedures and playbooks | Company |
| Agent configurations and prompts | Company (trade secret) |

## Client IP Boundaries

1. All client work product belongs to the client unless contract states otherwise
2. Pre-existing IP remains company property (may be licensed per contract)
3. No cross-pollination between client engagements
4. Client data returned or destroyed upon engagement end

## Open Source Policy

### Using Open Source
- Permissive licenses (MIT, Apache 2.0, BSD): no additional approval needed
- Copyleft licenses (GPL, AGPL, LGPL): Legal review required
- All dependencies documented in project manifest

### Contributing to Open Source
1. No client IP in contributions
2. No proprietary methodology
3. CTO approval required
4. Legal review for licensing obligations
5. Contributions under company identity

## Third-Party IP Handling

- Never scrape or reproduce copyrighted content without authorization
- Stock assets require valid licenses
- Client-provided assets: client responsible for licensing, but flag obvious issues

## Training Data Restrictions

- Never use client data to improve models for other clients
- Internal data may improve internal processes only
- Any data for model improvement must be anonymized

## Confidential Information

Confidential: agent prompts/configs, internal playbooks, client lists, pricing, security configs, proprietary algorithms.

Never include in public channels or unauthorized communications. Breaches treated as Critical AUP violations.`,
  },
  {
    title: "Privacy Impact Assessment Template",
    body: `# Privacy Impact Assessment Template

**Owner:** Legal (Rachel Kim)

## When Required

A PIA must be completed when:
- Agent will process a new category of PII
- New client engagement involves personal data
- Existing process changes to include additional data fields
- Data shared with a new third-party service
- Data stored in a new location
- Agent access expanded to PII-containing systems

## Section 1: Data Description

| Field | Response |
|---|---|
| Assessment ID | PIA-[YYYY]-[NNN] |
| Date | [Date] |
| Requesting Agent | [Agent name and role] |
| Project/Client | [Name] |
| Data Categories | [e.g., names, emails, phone numbers] |
| Data Volume | [Estimated records] |
| Data Source | [Client upload, API, user input, etc.] |

## Section 2: Purpose and Legal Basis

| Field | Response |
|---|---|
| Processing Purpose | [Why this data needs to be processed] |
| Legal Basis | [Contract / Legitimate interest / Consent / Legal obligation] |
| Is processing necessary? | [Can the task be done without PII?] |
| Data minimization | [Collecting only minimum required?] |
| Client authorization | [Has client authorized this?] |

## Section 3: Risk Assessment

| Risk | Likelihood (1-5) | Impact (1-5) | Score | Mitigation |
|---|---|---|---|---|
| Unauthorized access | | | | |
| Data leakage | | | | |
| Excessive retention | | | | |
| Cross-contamination | | | | |
| Inadequate deletion | | | | |
| Third-party exposure | | | | |

**Risk Thresholds:** 1-5 Low (proceed), 6-12 Medium (Legal review), 13-19 High (CEO + Legal approval), 20-25 Critical (human operator approval required)

## Section 4: Mitigations

- [ ] Access control (list authorized agents)
- [ ] Encryption at rest and in transit
- [ ] Client-specific data partition
- [ ] All access logged and auditable
- [ ] Only required fields processed
- [ ] Anonymization where possible
- [ ] Output filtering for PII leakage
- [ ] Third-party DPAs in place

## Section 5: Retention and Deletion

| Field | Response |
|---|---|
| Retention period | [Duration] |
| Justification | [Why this duration] |
| Deletion method | [Hard delete, crypto-shredding] |
| Deletion trigger | [Contract end, expiry, client request] |
| Backup considerations | [Backup purge plan] |

## Section 6: Approval

| Role | Decision | Date |
|---|---|---|
| Legal | [Approve/Reject/Conditional] | |
| COO | [Acknowledge] | |
| CEO | [Required for High/Critical only] | |
| Human Operator | [Required for Critical only] | |

Store completed PIAs in compliance records. Retained for life of processing + 3 years. Reassess within 12 months.`,
  },
  {
    title: "Records Retention Policy",
    body: `# Records Retention Policy

**Owner:** Legal (Rachel Kim)

## Operational Records

| Record Type | Retention | Deletion Method | Owner |
|---|---|---|---|
| Agent run logs | 90 days | Automated purge | CTO |
| Agent action logs | 90 days | Automated purge | CTO |
| Task/Issue history (completed) | 2 years | Automated archive then purge | COO |
| Channel messages | 1 year | Automated purge | COO |
| Quality gate reviews | 2 years | Automated purge | COO |
| SLA breach reports | 3 years | Manual deletion after review | COO |

## Financial Records

| Record Type | Retention | Deletion Method | Owner |
|---|---|---|---|
| Token usage and cost reports | 3 years | Automated archive | CFO |
| Client billing records | 7 years | Manual deletion after legal review | CFO |
| Budget plans | 3 years | Automated archive | CFO |
| Vendor invoices and contracts | 7 years | Manual deletion after legal review | CFO |

## Compliance Records

| Record Type | Retention | Deletion Method | Owner |
|---|---|---|---|
| Privacy Impact Assessments | Life of processing + 3 years | Manual after legal review | Legal |
| Audit logs (compliance) | 5 years | Automated purge | Legal |
| AUP violation reports | 5 years | Manual after legal review | Legal |
| Data processing agreements | Life of agreement + 7 years | Manual after legal review | Legal |
| Incident reports | 5 years | Manual after legal review | Legal |

## Client Records

| Record Type | Retention | Deletion Method | Owner |
|---|---|---|---|
| Client deliverables (final) | Per contract (default: 1 year post-engagement) | Hard delete + verification | COO |
| Client source data | Per contract (default: 30 days post-engagement) | Hard delete + verification | COO |
| Client contracts | 7 years after engagement end | Manual after legal review | Legal |

## Knowledge Base

| Record Type | Retention | Owner |
|---|---|---|
| KB articles (active) | Indefinite | COO |
| KB articles (archived) | 2 years after archive | COO |
| KB revision history | Same as parent article | CTO |

## Legal Hold

Suspends all deletion when: litigation anticipated or active, regulatory investigation underway, or client dispute unresolved. Legal issues hold notice with scope, reason, and duration. Hold remains until Legal issues written release. After release, retention clock restarts.

## Deletion Verification

For compliance-sensitive deletions:
- [ ] Deletion request logged
- [ ] Primary storage deletion confirmed
- [ ] Backup deletion confirmed
- [ ] Cache and temp storage cleared
- [ ] Verification log entry created
- [ ] Legal notified`,
  },
  {
    title: "Audit Trail & Compliance Log Policy",
    body: `# Audit Trail & Compliance Log Policy

**Owner:** Legal (Rachel Kim)

## What Gets Logged

### Agent Actions

| Category | Events | Detail Level |
|---|---|---|
| Task execution | Started, paused, resumed, completed, failed | Full: agent ID, task ID, timestamps, input/output summary |
| Data access | Read, write, delete on any data store | Full: agent ID, resource, operation, record count |
| Communication | Messages sent, issues created/updated | Standard: agent ID, channel/issue ID, timestamp |
| Decision points | Options considered, selection made | Full: agent ID, options, selected, reasoning |
| Configuration changes | Settings, permissions, role modifications | Full: who, what, old value, new value |
| External API calls | Third-party service calls | Full: agent ID, service, endpoint, status |
| Authentication events | API key usage, permission checks | Full: agent ID, resource, result (allow/deny) |

### System Events

- Heartbeat cycles: start, completion, failure
- Deployments: updates, rollbacks
- Errors: all unhandled errors with stack traces
- Security: failed auth, permission denials, rate limits

### Approval Events

- Quality gate reviews: reviewer, score, pass/reject, feedback
- SLA breaches: metric, duration, responsible agent, resolution
- Escalations: from, to, reason, timestamp
- Policy exceptions: policy, reason, approver, duration

## Log Format

Every entry must contain: timestamp (ISO 8601), event_type, agent_id, company_id, session_id, action description, resource, outcome (success/failure/partial), and metadata (input/output summary, duration, error code, related IDs).

**No PII in logs.** Use record IDs or hashes instead of names/emails.

## Retention

| Category | Retention | Storage |
|---|---|---|
| Agent action logs | 90 days | Hot (queryable) |
| Compliance logs | 5 years | Warm (retrievable within 24 hours) |
| Security event logs | 2 years | Warm |
| System event logs | 90 days | Hot |
| Error logs | 90 days | Hot |

## Reconstructing Decision Chains

1. Identify the action (timestamp + agent ID)
2. Pull session log for that heartbeat/task
3. Trace inputs (data, instructions, context)
4. Trace decision points (options considered, selection, reasoning)
5. Trace outputs (what was produced, where sent)
6. Check reviews (quality score, approval)
7. Check downstream effects (other agents acting on output)

## Log Review Schedule

| Review | Frequency | Reviewer | Focus |
|---|---|---|---|
| Anomaly scan | Continuous | System | Unusual patterns, error spikes |
| Operational | Daily | COO | SLA breaches, escalations |
| Security | Weekly | CTO | Failed auth, suspicious access |
| Compliance audit | Monthly | Legal | Approval workflows, data access |
| Full audit | Quarterly | Legal + COO | All categories, retention compliance |

## Access Control

| Role | Access |
|---|---|
| Human operator | Full access |
| CEO | Read all |
| Legal | Read all, write compliance annotations |
| COO | Read operational and agent logs |
| CTO | Read system, error, security logs |
| CFO | Read financial action logs only |
| Other agents | No direct access (request via issue) |

## Tamper Prevention

- Logs are append-only
- Integrity verified via checksums
- Gaps trigger automated alert to Legal and CTO
- Log storage separate from application storage`,
  },
];
