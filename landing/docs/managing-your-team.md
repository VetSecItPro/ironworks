# Managing Your AI Team

## The War Room

The War Room is your dashboard. It is the first thing you see when you log in, and it gives you a real-time view of what your company is doing.

Here is what each section shows:

- **Metric cards** at the top display key numbers: active agents, open issues, daily spend, and other operational stats. These update in real time.
- **Active agents panel** shows which agents are currently running a heartbeat cycle, what they are working on, and their current status.
- **Recent activity feed** shows what just happened across your company: issues created, tasks completed, agents deployed, comments posted. Events from the same agent within a 5-minute window are grouped together so the feed stays readable.
- **Issue status chart** breaks down your open issues by status (todo, in progress, in review, blocked, done) so you can spot bottlenecks at a glance.
- **Priority chart** shows how your issues are distributed by priority level.
- **Goal progress** (if you have goals set) shows how each goal is tracking against its target.

The War Room is where you go to answer: "Is my team actually working, and is anything stuck?"

## Creating and Assigning Issues

Issues are how you give work to your agents. Every task, request, bug report, feature, or project starts as an issue.

To create an issue:

1. Click the compose button in the sidebar or go to the Issues page.
2. Write a clear title. "Build a landing page for our product" is better than "Website stuff."
3. Write a description with enough context for the agent to work without asking follow-up questions. Include what you want done, why it matters, and any constraints or requirements.
4. Set the priority (urgent, high, medium, low).
5. Assign it to an agent. When in doubt, assign to the CEO. The CEO will triage and delegate to the right person.
6. Optionally, link it to a project and a goal.

### Tips for Writing Good Issues

- Be specific about what "done" looks like. "Write a 1,500-word blog post about AI workforce management targeting SMB owners" is actionable. "Write some content" is not.
- One task per issue. If you have three things to do, create three issues.
- Include deadlines or priority context if timing matters.
- Attach relevant files or links if the agent needs reference material.

## Setting Goals and Tracking Progress

Goals are high-level objectives that give your agents direction. Issues are the individual tasks that move those goals forward.

To create a goal:

1. Go to Goals in the sidebar.
2. Click "New Goal."
3. Write a title and description. Be specific and measurable. "Launch the marketing website by April 15" is better than "Improve our web presence."
4. Optionally, set a target date.

Once a goal exists, you can link issues to it. This lets you track how many tasks are done versus remaining, giving you a clear picture of progress toward each goal.

Goals with a target date will show overdue indicators if the date has passed and the goal is not yet complete. This helps you spot stalled initiatives.

## Using Playbooks for Repeatable Workflows

Playbooks are pre-defined sequences of steps that an agent follows to complete a specific type of work. Think of them as standard operating procedures.

IronWorks comes with seed playbooks for common workflows like onboarding, security audits, and engineering processes. You can also create your own.

To run a playbook:

1. Go to Playbooks in the sidebar.
2. Select a playbook from the list.
3. Click "Run" and choose which agent should execute it.
4. The agent will follow each step in order, creating issues for subtasks as needed.

Playbooks are useful for work that happens the same way every time: weekly security scans, new hire onboarding, monthly financial reviews, content publishing processes.

### Creating a Custom Playbook

1. Click "New Playbook" on the Playbooks page.
2. Give it a name and description.
3. Add steps in order. Each step describes what the agent should do.
4. Assign a category (onboarding, security, engineering, operations, marketing, or custom).
5. Set an estimated duration if you want to track how long runs should take.

You can also generate playbooks using AI. Click the "Generate with AI" option and describe the workflow you want. IronWorks will create the steps for you, which you can then review and edit.

## Setting Up Routines for Recurring Tasks

Routines are scheduled jobs that run automatically. If a playbook is a recipe, a routine is putting that recipe on a weekly meal plan.

Use routines for tasks that need to happen on a schedule:

- Weekly security dependency scans
- Monday morning financial reviews
- Daily standup reports
- Bi-weekly performance reviews

To create a routine:

1. Go to Routines in the sidebar.
2. Click "New Routine."
3. Write a title and description of what the agent should do each time it runs.
4. Set a schedule (cron expression or simple interval).
5. Assign it to an agent.
6. Optionally, link it to a project.

### Advanced Routine Settings

- **Concurrency policy** controls what happens if a routine triggers while a previous run is still active. Options: skip the new trigger, queue it, or coalesce (keep just one follow-up queued).
- **Catch-up policy** controls what happens if the scheduler misses a window (for example, if the system was down). Options: skip missed windows or enqueue them in capped batches.

Routines can be paused, resumed, or archived at any time.

## The Agent Performance Page

The Agent Performance page is your HR dashboard. It shows how each agent is performing across four dimensions:

- **Cost efficiency.** Cost per completed task relative to the team average. Lower is better.
- **Speed.** Average time to close a task. Faster is better.
- **Throughput.** Tasks completed per day. Higher is better.
- **Completion rate.** Percentage of tasks that were successfully completed (not cancelled or abandoned).

Each agent gets an overall rating:

| Rating | Score | What It Means |
|--------|-------|---------------|
| A | 80+ | Excellent. Efficient, fast, reliable. |
| B | 65-79 | Good. Meeting expectations. |
| C | 50-64 | Adequate. Room for improvement. |
| D | 35-49 | Below expectations. Needs attention. |
| F | Below 35 | Failing. Immediate review required. |

Use this page weekly to spot problems early. An agent rated D or F for two consecutive weeks should get a performance improvement plan. Check the Knowledge Base for the PIP template that comes pre-loaded.

## When to Clone an Agent vs. Create a New One

**Clone** when you need another agent doing the same type of work with the same instructions. For example, if your one Senior Engineer is overloaded, clone it to get a second engineer with identical configuration. Cloning copies the SOUL.md, AGENTS.md, skills, and adapter settings.

**Create new** when you need a different role or significantly different instructions. For example, adding a UX Designer or a Data Analyst requires a new agent built from a different template or custom configuration.

## When to Adjust SOUL.md

Your agents' behavior is shaped by their SOUL.md and AGENTS.md files. If an agent keeps making the same type of mistake, editing these files is often the fix.

Common situations:

- **Agent is too verbose.** Add a line like "Keep all responses under 200 words unless the task requires detailed output."
- **Agent makes assumptions instead of asking.** Add "When a task description is ambiguous, ask a clarifying question via a comment before starting work."
- **Agent gold-plates everything.** Add "Deliver exactly what the task asks for. Do not add unrequested features or improvements."
- **Agent ignores brand voice.** Add specific voice and tone guidelines to SOUL.md.
- **Agent picks the wrong tools or approaches.** Add decision frameworks to AGENTS.md, like "For frontend work, always use React. For API work, always use Express."

Changes to SOUL.md take effect on the agent's next heartbeat. You do not need to restart anything.

## Next Steps

- [Team Packs Explained](team-packs-explained.md) to understand the pre-built team configurations
- [API Keys and Cost Management](api-keys-and-costs.md) to control costs and choose the right models
- [Using the Knowledge Base](knowledge-base-guide.md) to build your company's shared documentation
