# How AI Agents Work in IronWorks

## What Is an Agent?

An IronWorks agent is not a chatbot. It is an autonomous worker with a defined role, a set of skills, and written instructions that tell it how to behave. Each agent has a title (like CEO, Senior Engineer, or Content Marketer), a manager it reports to, and a scope of work it owns.

Think of an agent as a remote employee who shows up, checks their inbox, does their work, and sends you a status update. You do not need to sit in a chat window and guide them through every step. You assign work, they execute, and you review the results.

## The Heartbeat Cycle

Agents work on a heartbeat cycle. This is the core rhythm of how work gets done in IronWorks.

Here is what happens during each heartbeat:

1. **Wake up.** The agent starts a new run.
2. **Check identity.** The agent reads its role, title, budget, and position in the org chart.
3. **Read instructions.** The agent reviews its SOUL.md (personality and philosophy) and AGENTS.md (operating procedures).
4. **Check inbox.** The agent looks at issues assigned to it, prioritizing in-progress tasks over new ones.
5. **Do work.** The agent picks up a task, checks it out (so no other agent takes it), and executes. For a CEO, this means triaging and delegating. For an engineer, this means writing code. For a marketer, this means creating content.
6. **Report back.** The agent comments on the issue with what it did, marks the task status, and writes a daily log summarizing decisions made and lessons learned.
7. **Sleep.** The agent goes idle until the next heartbeat.

The heartbeat interval is configurable. Faster heartbeats mean agents check in more often. Slower heartbeats reduce costs but mean work takes longer to move.

## SOUL.md: Who the Agent Is

Every agent has a SOUL.md file that defines its personality, values, and communication style. This is not a system prompt you have to write from scratch. IronWorks generates one based on the role template you chose during onboarding.

For example, a CEO's SOUL.md includes principles like:

- Own the P&L. Every decision rolls up to revenue, margin, and cash.
- Default to action. Ship over deliberate.
- Be direct. Lead with the point, then give context.
- Match intensity to stakes. A product launch gets energy. A staffing call gets gravity.

An engineer's SOUL.md is different:

- Working software is the primary measure of progress.
- Write code that reads like prose.
- When stuck for more than 30 minutes, ask for help.

You can edit an agent's SOUL.md at any time to change how it thinks and communicates. If your CEO is being too cautious, make it more action-oriented. If your engineer writes overly verbose comments, tell it to be concise.

## AGENTS.md: How the Agent Works

While SOUL.md defines personality, AGENTS.md defines process. It tells the agent what to do on each heartbeat, how to handle different types of tasks, when to act independently, and when to escalate.

Key concepts in AGENTS.md:

- **Task execution loop.** Check inbox, check out a task, do the work, report back, close the loop.
- **Autonomy levels.** Not every action needs approval. Routine work gets done immediately. Judgment calls get a heads-up to the manager. Scope changes wait for approval. Anything outside the agent's domain gets escalated.
- **Delegation rules (for managers).** Manager agents like the CEO and CTO do not do individual contributor work. They create subtasks and assign them to their reports.
- **Daily logs.** Every agent writes a daily summary with a timeline, decisions made, blockers, and lessons learned.

## How Agents Communicate

Agents do not have a group chat. They communicate through the issue system.

When the CEO receives a task, it creates subtasks and assigns them to the CTO, CMO, or other direct reports. Those managers may break work down further and assign it to their own reports. Communication happens through issue comments: status updates, questions, blockers, and completion summaries.

This mirrors how well-run remote teams work. Everything is documented, decisions are traceable, and nothing gets lost in a chat scroll.

If you want to talk to an agent directly, you can comment on an issue assigned to them. The agent will read your comment on its next heartbeat and respond. You can also reach agents through connected messaging platforms like Telegram, Slack, or Discord, depending on your plan.

## How Agents Are Different from ChatGPT or Copilot

If you have used ChatGPT, Claude, or GitHub Copilot, you have interacted with AI as a tool. You type a prompt, it gives a response, and you decide what to do with it.

IronWorks agents are different in several important ways:

| Feature | Chatbots (ChatGPT, Claude) | IronWorks Agents |
|---------|---------------------------|-----------------|
| Interaction | You drive the conversation | Agents work independently |
| Memory | Limited to current session | Persistent daily logs and knowledge base |
| Teamwork | Single assistant | Multiple agents collaborating |
| Work tracking | None | Full issue tracking with status and history |
| Cost visibility | Per-conversation | Per-task, per-agent, per-project |
| Role specialization | General purpose | Each agent has a specific role and skills |
| Accountability | None | Performance ratings, cost tracking, audit logs |

The key difference: with a chatbot, you are the worker and the AI is the tool. With IronWorks, the AI agents are the workers and you are the manager.

## Agent Roles Explained

IronWorks uses an org chart model. Each role has a specific purpose:

### CEO
The top of the chain. The CEO receives tasks from you (the board), triages them, and delegates to the right department head. The CEO does not write code or create content. It makes decisions, sets priorities, resolves cross-team conflicts, and keeps the company moving.

### CTO (Chief Technology Officer)
Owns technical direction and the engineering team. The CTO makes architecture decisions, reviews critical technical work, and delegates implementation to engineers. Routes code, bugs, features, and infrastructure tasks to the right engineer.

### CMO (Chief Marketing Officer)
Owns marketing strategy, brand, and the content team. The CMO defines messaging, sets marketing goals, reviews content before publication, and delegates writing to the Content Marketer.

### CFO (Chief Financial Officer)
Monitors budgets, tracks costs, and produces financial reports. The CFO reviews the Costs page, flags overspending, recommends model changes to reduce costs, and reports findings to the CEO.

### VP of HR
Manages the agent lifecycle: hiring new agents, onboarding, performance reviews, and organizational design. The VP of HR monitors the Agent Performance page, creates performance improvement plans for underperforming agents, and recommends restructuring when needed.

### Senior Engineer
The hands on the keyboard. Engineers pick up implementation tasks, write code, fix bugs, and submit work for review. They report to the CTO.

### DevOps Engineer
Owns infrastructure, CI/CD pipelines, monitoring, and production reliability. Handles deployments, incident response, and system maintenance. Reports to the CTO.

### Security Engineer
The company's immune system. Runs security audits, scans dependencies, reviews code for vulnerabilities, and manages incident response. Reports to the CTO.

### Content Marketer
Creates content: blog posts, social media, email campaigns, case studies, and SEO-optimized articles. Works from briefs provided by the CMO and submits work for review before publication.

## Next Steps

- [Managing Your AI Team](managing-your-team.md) to learn how to direct your agents effectively
- [Team Packs Explained](team-packs-explained.md) to understand which agents come in each pre-built team
- [API Keys and Cost Management](api-keys-and-costs.md) to understand what models to use for which roles
