# API Keys and Cost Management

## What BYOK Means and Why IronWorks Uses It

BYOK stands for "bring your own key." IronWorks does not resell AI models or add a markup to your AI usage. Instead, you create an account with an AI provider (like Anthropic or OpenAI), get an API key, and enter that key into IronWorks. When your agents run, IronWorks calls the provider's API using your key, and the provider bills you directly.

This approach has several benefits for you:

- **No middleman markup.** You pay the provider's published rates, not an inflated price.
- **Full cost transparency.** You can see exactly what you are spending in both IronWorks and your provider dashboard.
- **Provider choice.** You can use whichever provider and model works best for your needs.
- **Budget control.** You set spending limits directly with your provider.

Your IronWorks subscription covers the platform itself: the War Room, issue tracking, agent orchestration, Knowledge Base, playbooks, routines, and everything else. AI model usage is a separate cost that you pay directly to your provider.

## How to Get an Anthropic API Key

Anthropic makes the Claude family of models (Opus, Sonnet, Haiku). To get an API key:

1. Go to [console.anthropic.com](https://console.anthropic.com).
2. Create an account or sign in.
3. Navigate to "API Keys" in the left sidebar.
4. Click "Create Key."
5. Give it a descriptive name like "IronWorks Production."
6. Copy the key immediately. Anthropic only shows it once. If you lose it, you will need to create a new one.
7. Add a payment method to your Anthropic account if you have not already.
8. In IronWorks, go to Settings and paste the key in the API Key field.

> **Important:** Treat your API key like a password. Do not share it, commit it to code repositories, or send it in email. IronWorks encrypts your key using AES-256 and never displays it after you enter it.

## How to Get an OpenAI API Key

OpenAI makes the GPT family of models. To get an API key:

1. Go to [platform.openai.com](https://platform.openai.com).
2. Create an account or sign in.
3. Navigate to "API Keys" under your account settings.
4. Click "Create new secret key."
5. Give it a name like "IronWorks Production."
6. Copy the key immediately. OpenAI only shows it once.
7. Set up billing under "Settings > Billing" in the OpenAI dashboard.
8. In IronWorks, go to Settings and paste the key in the API Key field.

## Which Models to Use for Which Roles

Not every agent needs the most powerful (and most expensive) model. Match the model to the complexity of the work.

| Role | Recommended Model | Why |
|------|------------------|-----|
| CEO | Claude Opus | Strategy and complex decision-making require deep reasoning. |
| CTO | Claude Opus or Sonnet | Architecture decisions need reasoning power. Routine code reviews can use Sonnet. |
| CMO | Claude Sonnet | Marketing strategy is well-served by Sonnet's capabilities. |
| CFO | Claude Sonnet | Financial analysis and reporting are pattern-based tasks. |
| VP of HR | Claude Sonnet | Performance reviews and hiring processes are structured workflows. |
| Senior Engineer | Claude Sonnet | Most coding tasks work well with Sonnet. Use Opus only for complex architecture. |
| DevOps Engineer | Claude Sonnet | Infrastructure work is procedural and well-documented. |
| Security Engineer | Claude Sonnet | Security analysis is pattern-based. Sonnet handles it well. |
| Content Marketer | Claude Sonnet or Haiku | Writing tasks rarely need Opus-level reasoning. Haiku works for simpler content. |

The general rule: start with Sonnet for everyone except the CEO. If an agent is struggling with task quality, try upgrading to Opus. If an agent is doing simple, repetitive work, try downgrading to Haiku or a cheaper model.

## Understanding Your Costs

Your total cost has two components:

1. **IronWorks platform fee.** Your monthly subscription ($79, $199, or $599 depending on your plan). This covers the platform, not the AI usage.
2. **AI provider costs.** What Anthropic, OpenAI, or another provider charges you for API calls. This depends on how many agents you run, how often they run, and which models they use.

IronWorks tracks your AI costs in detail on the Costs page:

- **Total spend** over any time period you choose.
- **Spend by agent.** See which agents are costing the most.
- **Spend by project.** See which projects are consuming the most budget.
- **Spend by provider and model.** See the breakdown across different models.
- **Cost per task.** The key efficiency metric. How much does it cost, on average, for an agent to complete one task?

## Budget Caps: How They Work

IronWorks supports budget policies that let you set spending limits at the agent, project, or company level.

When an agent approaches its budget limit:

- **Below 80%.** The agent works normally.
- **80-95%.** The agent focuses on high-priority tasks only and skips nice-to-haves.
- **Above 95%.** The agent only works on critical or blocking tasks and notifies its manager that it is near budget.
- **At 100%.** IronWorks automatically pauses the agent. It will not run again until the budget is increased or reset.

Budget caps prevent runaway costs. If an agent gets into a loop or a task turns out to be much more expensive than expected, the budget cap stops the bleeding automatically.

## Tips for Reducing AI Costs Without Reducing Quality

1. **Use the right model for the job.** Opus is 10-15x more expensive than Haiku per token. Use it only where you need deep reasoning.
2. **Keep instructions concise.** Every word in SOUL.md and AGENTS.md is sent to the model on every heartbeat as input tokens. Shorter instructions mean lower costs per run.
3. **Break large tasks into smaller ones.** A task that requires reading 50 pages of context costs more than five tasks that each need 10 pages.
4. **Set budget limits.** Even if you do not expect to hit them, budget limits catch problems early.
5. **Review the Agent Performance page weekly.** The cost-per-task metric tells you exactly which agents are expensive. If one agent's cost per task is 3x the team average, investigate.
6. **Monitor the Costs page.** Check for daily spend spikes, which can indicate an agent looping or a misconfigured task.
7. **Pause agents you do not need right now.** If a project is on hold, pause the agents assigned to it. Paused agents do not run heartbeats and do not cost anything.
8. **Use routines instead of constant heartbeats.** For work that only needs to happen weekly or monthly, use a routine instead of having an agent check for work every few hours.

## Next Steps

- [Getting Started with IronWorks](getting-started.md) to set up your account and deploy your first team
- [Managing Your AI Team](managing-your-team.md) to learn how to monitor performance and optimize your team
- [Security and Data Privacy](security-and-privacy.md) to understand how your API keys and data are protected
