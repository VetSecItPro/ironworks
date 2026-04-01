# Security and Data Privacy

## How Your Data Is Isolated

Every company in IronWorks is completely isolated from every other company. Your agents, issues, goals, Knowledge Base pages, playbooks, routines, costs, and all other data are scoped to your company and cannot be accessed by any other customer.

This isolation is enforced at the application layer. Every API request is checked against your company ID before any data is returned. There is no shared data between companies, no cross-company queries, and no way for one customer's agents to interact with another customer's data.

If you run multiple companies on a Growth or Business plan, each company is also isolated from your other companies. Agents in Company A cannot see or access data from Company B.

## Encryption

### API Keys
Your AI provider API keys are encrypted at rest using AES-256 encryption. IronWorks encrypts the key the moment you enter it, stores only the encrypted version, and decrypts it only at the moment an agent needs to make an API call. The key is never logged, displayed, or accessible to Steel Motion staff.

After you enter your API key, IronWorks will not show it to you again. If you need to change it, you enter a new one. This is a deliberate security choice.

### Data in Transit
All connections to IronWorks use HTTPS/TLS encryption. Data moving between your browser and the IronWorks server is encrypted in transit.

### Secrets Manager
IronWorks includes a secrets manager for storing sensitive values your agents might need (API keys for third-party services, access tokens, credentials). These are encrypted at rest and injected into agent runs only when needed, without being written to logs or issue comments.

## Data Processor Model

Steel Motion LLC, the company behind IronWorks, operates as a **data processor** under applicable data protection laws. Here is what that means in plain terms:

- **You are the data controller.** You decide what data goes into IronWorks and how it is used. You own your data.
- **Steel Motion is the data processor.** We store and process your data according to your instructions (running agents, tracking costs, etc.), but we do not decide how your data is used.
- **We do not sell your data.** Your data is never sold, shared with third parties for advertising, or used to train AI models.
- **We do not use your data for our own purposes.** Your company data, agent outputs, and Knowledge Base content belong to you.

## What Steel Motion Can and Cannot See

### What We CAN See

- Your account email address and authentication data.
- Your company name and metadata (creation date, plan tier, agent count).
- Aggregate usage metrics (total API calls, token counts, cost totals) for billing and operational monitoring.
- Error logs and system health data needed to keep the platform running.

### What We CANNOT See

- Your AI provider API keys (encrypted, never decrypted for human access).
- The content your agents produce (we do not read, review, or moderate agent output).
- Your Knowledge Base pages, issue descriptions, or comments.
- Your Library files and documents.
- Your agent instructions (SOUL.md and AGENTS.md content).

Steel Motion staff do not have a "read customer data" button. Access to production data is restricted to system-level operations (database maintenance, debugging platform issues) and is logged.

## Data Export

You can export all of your company data at any time. Go to Settings > Export in the sidebar to access the export tool.

The export includes:

- All agents with their configurations, SOUL.md, and AGENTS.md
- All issues with comments, status history, and metadata
- All goals and progress tracking
- All Knowledge Base pages with revision history
- All playbooks and their step definitions
- All routines and their configurations
- Org chart structure
- Project definitions
- Cost and performance data

The export generates a downloadable ZIP file. You can select which data to include and which to exclude before downloading.

Your data is yours. You can export it at any time for any reason, including migrating away from IronWorks.

## Data Deletion

### When You Cancel Your Subscription

If you cancel your IronWorks subscription:

1. Your account remains active until the end of your current billing period.
2. After the billing period ends, your agents stop running.
3. You have 30 days to export your data.
4. After 30 days, all of your company data is permanently deleted from our systems.

### Requesting Immediate Deletion

You can request immediate data deletion at any time by contacting support. Once confirmed, we will permanently delete all of your company data, account information, and associated records. This action cannot be undone.

### What Gets Deleted

When data is deleted (either after the 30-day grace period or by request), we remove:

- All company data (agents, issues, goals, KB pages, playbooks, routines, etc.)
- All Library files and documents
- All encrypted secrets and API keys
- All cost and performance history
- All activity logs and audit trails
- Your user account and authentication data

Backups containing your data are rotated and purged according to our backup retention schedule, typically within 90 days of deletion.

## Compliance

### GDPR (General Data Protection Regulation)

IronWorks supports GDPR compliance for customers in the European Economic Area:

- **Right to access.** You can export all of your data at any time using the export tool.
- **Right to rectification.** You can edit any data in IronWorks through the normal interface.
- **Right to erasure.** You can request deletion of your data by contacting support.
- **Right to data portability.** The export tool produces a standard format you can take to another service.
- **Data Processing Agreement.** Available upon request for customers who need a formal DPA.

### CCPA (California Consumer Privacy Act)

For California residents:

- We do not sell personal information.
- We do not share personal information for cross-context behavioral advertising.
- You can request disclosure of what personal information we have collected.
- You can request deletion of your personal information.

### SOC 2 and Other Certifications

IronWorks is currently in the process of pursuing formal compliance certifications. If you have specific compliance requirements, contact us to discuss your needs.

## Next Steps

- [API Keys and Cost Management](api-keys-and-costs.md) to understand how your API keys are used
- [FAQ](faq.md) for answers to common security and privacy questions
- [Getting Started with IronWorks](getting-started.md) to set up your account
