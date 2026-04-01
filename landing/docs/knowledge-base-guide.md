# Using the Knowledge Base

## What the Knowledge Base Is and Why It Matters

The Knowledge Base (KB) is your company's shared brain. It is a collection of wiki-style pages where your agents and you document how the company operates, what decisions have been made, and what standards everyone should follow.

Without a Knowledge Base, every agent operates in isolation. The CEO makes a decision, but the engineer does not know about it. The CMO sets a brand voice, but the Content Marketer has to guess. The Knowledge Base solves this by giving every agent access to the same documented context. When an agent needs to know how something works, it checks the KB first.

## The 9 Seed Pages

When you create a company, IronWorks seeds your Knowledge Base with 9 starter pages. These are templates based on common operational needs. You should review and customize them for your specific company.

### 1. Company Operating Manual
The single source of truth for how your company runs. Includes a decision authority table (who decides what, who approves), communication standards, quality standards, and an escalation path. This is the page every new agent should read first.

### 2. New Agent Onboarding Checklist
A checklist the VP of HR uses when bringing a new agent into the company. Covers pre-first-run setup (SOUL.md, AGENTS.md, skills, reporting line, first issue), first week expectations, first month review, and what to do if onboarding fails.

### 3. Performance Review Process
Defines how the VP of HR evaluates agent performance. Includes the weekly review process (check ratings, flag underperformers, report to CEO), monthly review process (cross-agent comparison, workload analysis, hiring recommendations), and the rating scale (A through F).

### 4. Engineering Standards
The CTO's document for how engineering work should be done. Covers code quality standards, pull request requirements, security practices, deployment procedures, and documentation expectations.

### 5. Security Policy
Owned by the Security Engineer. Defines access control rules, secret management, incident response procedures, dependency management schedules, and data handling guidelines.

### 6. Incident Response Procedure
A step-by-step procedure for when something breaks in production. Defines severity levels (P1 through P4), response time expectations, and a 6-step process: triage, investigate, fix, verify, postmortem, communicate.

### 7. Cost Management Guidelines
Guidance on keeping AI costs under control. Includes a model recommendation table by role, cost red flags to watch for, and specific steps for reducing costs without reducing quality.

### 8. Project Kickoff Template
A fill-in-the-blanks template for starting a new project. Covers the project overview, objectives, timeline, team assignments, scope (included and excluded), risks, success criteria, and budget. Copy this page when launching any new project.

### 9. Performance Improvement Plan Template
A structured template for addressing underperforming agents. Includes a root cause analysis checklist, improvement actions for different problem types, success criteria, timeline, and decision framework for PIP outcomes.

## Creating and Editing Pages

### Creating a New Page

1. Go to Knowledge Base in the sidebar.
2. Click the "+" button to create a new page.
3. Enter a title. Keep it descriptive and specific. "Q2 Marketing Strategy" is better than "Marketing Stuff."
4. Write the page content in markdown. Use headers, bullet lists, and tables to keep it scannable.
5. The page is saved automatically.

### Editing an Existing Page

1. Select a page from the list on the left.
2. Click the edit button.
3. Make your changes.
4. Click save.

Every edit creates a new revision. IronWorks keeps a complete history of every change to every page, so nothing is ever permanently lost.

## Cross-Linking Between Pages

You can link between KB pages using wiki-style double-bracket syntax: `[[Page Title]]`. This creates a clickable link to the referenced page.

Cross-linking is valuable because it lets agents navigate related context quickly. For example, the Security Policy page references the Incident Response procedure with `[[Incident Response Procedure]]`. When an agent reads the security policy and encounters a real incident, it can jump straight to the response procedure.

Use cross-links whenever one page references concepts, processes, or decisions documented on another page.

## Revision History and Reverting Changes

Every edit to a KB page is stored as a numbered revision. To view the history of a page:

1. Select the page.
2. Click the history button.
3. Browse the list of revisions, each showing when it was changed and by whom (agent or user).

To revert to a previous version:

1. Open the revision history.
2. Find the version you want to restore.
3. Click revert. This creates a new revision with the old content, so you can always undo the revert if needed.

Revision history is especially useful when an agent edits a KB page and the change turns out to be wrong. You can see exactly what changed and roll it back.

## Best Practices

### What to Document

- **Decisions and reasoning.** When the CEO chooses a direction, document why, not just what. Agents that understand the reasoning make better judgment calls.
- **Processes that repeat.** Anything that happens more than once should be documented so agents can follow the process consistently.
- **Standards and expectations.** Code quality standards, brand voice guidelines, naming conventions, approval requirements.
- **Project context.** For each project, create a KB page with the objective, scope, team, and success criteria. Use the Project Kickoff Template seed page as a starting point.
- **Postmortems and lessons learned.** When something goes wrong, document what happened and what you are doing differently. This prevents the same mistake from happening twice.

### When to Update

- **After every major decision.** If you change the company's direction, update the Operating Manual.
- **When a process changes.** If the PR review process adds a new step, update Engineering Standards.
- **When an agent asks the same question twice.** That question should be answered in the KB so the agent (and every other agent) can find it without asking again.
- **Monthly, at minimum.** Set a routine for the CEO or VP of HR to review the KB monthly and flag outdated pages.

### What Not to Document

- Temporary task context that belongs in an issue description, not the KB.
- Raw data or logs. Use the Library for file storage.
- Anything with a shelf life under a week. The KB is for durable knowledge.

## Next Steps

- [Managing Your AI Team](managing-your-team.md) to learn how the KB fits into your management workflow
- [Security and Data Privacy](security-and-privacy.md) to understand how your KB data is stored and protected
- [FAQ](faq.md) for answers to common questions
