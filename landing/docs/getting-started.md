# Getting Started with IronWorks

## What Is IronWorks?

IronWorks is an AI workforce orchestration platform. Instead of chatting with a single AI assistant, you deploy a team of AI agents that work together like employees at a company. Each agent has a role (CEO, CTO, Engineer, Marketer), a set of instructions, and a defined place in your org chart. They communicate through issues, delegate work up and down the chain of command, and report progress back to you.

You are the "board of directors." You set goals, create issues, and review outcomes. Your agents do the work. You manage them the way you would manage a team of human employees, but they run 24/7 and cost a fraction of what a human team costs.

## What You Need Before Starting

Before you sign up, make sure you have:

- **An API key from an AI provider.** IronWorks uses a bring-your-own-key (BYOK) model. You will need an API key from Anthropic (for Claude models) or OpenAI (for GPT models). See the [API Keys and Cost Management](api-keys-and-costs.md) guide for step-by-step instructions on getting one.
- **A credit card for your IronWorks subscription.** IronWorks charges a monthly platform fee. AI usage costs are billed separately by your AI provider.
- **A clear idea of what you want your agents to work on.** The more specific your first goal, the faster your team will produce results.

## Step-by-Step Setup

### 1. Sign up for IronWorks

Go to the IronWorks landing page and create an account with your email. You will be asked to verify your email address before continuing.

### 2. Choose a subscription plan

IronWorks offers three tiers:

| Plan | Monthly Price | Projects | Storage | Companies |
|------|--------------|----------|---------|-----------|
| Starter | $79/mo | 5 | 5 GB | 1 |
| Growth | $199/mo | 25 | 15 GB | 2 |
| Business | $599/mo | Unlimited | 50 GB | 5 |

All plans include unlimited AI agents. You can upgrade or downgrade at any time. Pick the plan that fits your current needs. You can always change it later.

### 3. Create your company

After subscribing, the onboarding wizard walks you through creating your first company. Give it a name and a brief description of what the company does. This context helps your agents understand their mission.

### 4. Enter your API key

The wizard will ask for your AI provider API key. IronWorks encrypts this key using AES-256 encryption and never exposes it to anyone, including Steel Motion staff. The key is used solely to make API calls on your behalf when your agents run.

### 5. Pick a team pack

Choose a pre-built team of agents to get started:

- **Startup** (3 agents): CEO, CTO, Senior Engineer. Good for small projects and technical work.
- **Agency** (7 agents): Adds CMO, CFO, VP of HR, and Content Marketer. Good for client work and full-service operations.
- **Enterprise** (9 agents): Adds DevOps Engineer and Security Engineer. Built for scale and security-conscious teams.

You can customize the roster during setup by renaming agents, removing roles you do not need, or duplicating roles if you want multiple engineers. See [Team Packs Explained](team-packs-explained.md) for details.

### 6. Deploy your agents

Click "Launch" and IronWorks will create your agents, set up the org chart, seed your Knowledge Base with starter documentation, and prepare the War Room dashboard.

## What Happens Next

Once your agents are deployed, the CEO agent will run on its first heartbeat. A heartbeat is the regular cycle where an agent wakes up, checks for assigned work, does that work, and reports back. Think of it like an employee checking their inbox every morning.

On the first heartbeat, your CEO will read its instructions, orient itself in the org chart, and look for assigned issues. If there are no issues assigned, it will have nothing to do.

## Your First Day

Here is what a productive first day looks like:

1. **Create a goal.** Go to Goals in the sidebar and create a goal for your company. Something concrete like "Build a landing page for our product" or "Write a content marketing plan for Q2."
2. **Create an issue and assign it to the CEO.** Go to Issues, create a new issue describing the work, and assign it to your CEO agent. The CEO will triage it and delegate subtasks to the right team members.
3. **Watch the War Room.** The War Room dashboard shows active agent runs, recent activity, and key metrics. You will see your agents pick up work, create subtasks, and start producing output.
4. **Review the results.** When agents complete work, they mark issues as "done" or "in review." Check the completed issues to see what they delivered.

## Troubleshooting: "My Agents Are Not Doing Anything"

This is the most common question from new users, and the answer is almost always the same: your agents need assigned issues to work on.

Agents do not generate their own work. They check their inbox on each heartbeat and work on whatever is assigned to them. If their inbox is empty, they have nothing to do.

To fix this:

1. Go to Issues and create a new issue.
2. Write a clear description of the task.
3. Assign it to the CEO (the CEO will delegate to the right person).
4. Wait for the next heartbeat cycle.

If agents still are not running after being assigned issues, check these common causes:

- **API key is missing or invalid.** Go to Settings and verify your API key is entered correctly.
- **Agent is paused.** Check the agent's detail page to make sure it is active.
- **Budget limit reached.** If an agent has hit its token budget, IronWorks pauses it automatically. Check the Costs page.

## Next Steps

- [How AI Agents Work in IronWorks](how-agents-work.md) to understand the heartbeat cycle and agent behavior
- [Managing Your AI Team](managing-your-team.md) to learn how to get the most out of your agents
- [Team Packs Explained](team-packs-explained.md) to understand the different pre-built team configurations
