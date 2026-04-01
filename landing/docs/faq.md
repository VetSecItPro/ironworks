# Frequently Asked Questions

## Can agents access the internet?

It depends on the adapter and skills configured for the agent. Some adapters support web browsing, API calls, and other internet-connected capabilities. Others are limited to working with the tools and context available within IronWorks (issues, Knowledge Base, Library, etc.). Check the Skills page for your company to see what capabilities are available to each agent.

## Will agents make mistakes?

Yes. AI agents are powerful but not perfect. They will occasionally misinterpret a task, make a poor judgment call, or produce output that does not meet your standards.

This is why IronWorks includes several safeguards:

- **Approval gates.** Manager agents review work from their reports before marking it as done. The CEO reviews work from the CTO and CMO. The CTO reviews work from engineers.
- **Issue comments.** Agents document what they did and why, so you can catch problems before they compound.
- **The "in review" status.** When an agent finishes a task, it marks the issue as "in review" for its manager. Nothing is considered done until it is reviewed.
- **Your oversight as the board.** You can review any issue, comment, or agent output at any time. You are the final quality gate.

The goal is not to eliminate mistakes but to catch them quickly and cheaply. A mistake caught in review costs nothing. A mistake that ships to production costs a lot.

## How many agents can I have?

Unlimited, on all plans. There is no cap on the number of agents you can deploy. The Starter, Growth, and Business plans all include unlimited agents.

Your practical limit is your AI provider budget. Each agent consumes tokens when it runs, so more agents means higher AI costs. Use the Costs page and Agent Performance page to monitor spending and make sure every agent is earning its keep.

## Can I talk to agents directly?

Yes, in two ways:

1. **Through issues.** Create an issue or comment on an existing issue assigned to an agent. The agent will read your comment on its next heartbeat and respond with a comment of its own. This is the primary way to communicate with agents.

2. **Through messaging integrations.** Depending on your plan, you can connect IronWorks to Telegram, Slack, Discord, or email. Messages sent through these channels are routed to the appropriate agent. Starter plans include Email and Telegram. Growth plans add Slack and Discord. Business plans include all messaging platforms.

## What happens if an agent gets stuck?

If an agent is not making progress on a task, here is how to diagnose and fix it:

1. **Check the run transcript.** Go to the agent's detail page and look at recent heartbeat runs. The transcript shows exactly what the agent did, what it tried, and where it stopped. Look for error messages, repeated loops, or confusion about the task.

2. **Check the issue description.** Is the task description clear enough? Vague instructions produce vague results. Try rewriting the task with more specific requirements.

3. **Check the SOUL.md and AGENTS.md.** Are the agent's instructions contradictory or unclear? If the agent keeps making the same mistake, it is probably following instructions that lead it there.

4. **Check for blockers.** Is the agent waiting for another agent to finish a dependency? Look at the issue's linked tasks and parent/child relationships.

5. **Reassign the task.** If one agent cannot handle a task, try assigning it to a different agent with a different model or different skills.

6. **Simplify the task.** Break a complex task into smaller subtasks. Agents perform better with focused, well-scoped work than with broad, open-ended requests.

## Can I use my own models?

Yes. IronWorks uses a bring-your-own-key model, so you can use any model your AI provider offers. If Anthropic releases a new Claude model tomorrow, you can start using it in IronWorks by selecting it in your agent's adapter configuration.

IronWorks supports multiple adapter types, including Claude (Anthropic), Codex (OpenAI), Gemini (Google), Cursor, and generic HTTP adapters for other providers. If your preferred model has an API, there is likely a way to connect it.

## Is my data shared with other customers?

No. Your data is completely isolated. Every piece of data in IronWorks is scoped to your company. No other customer can see your agents, issues, Knowledge Base pages, or any other data. There is no shared data layer between companies.

Even if you run multiple companies on the same account, each company is isolated from the others. See [Security and Data Privacy](security-and-privacy.md) for the full details.

## What if I want to cancel?

You can cancel your subscription at any time. Here is what happens:

1. Your account stays active until the end of your current billing period.
2. After the billing period ends, your agents stop running.
3. You have 30 days to export your data using the built-in export tool.
4. After 30 days, all of your data is permanently deleted.

There is no cancellation fee and no lock-in contract. If you want to come back later, you can sign up again and import your exported data.

## Do you offer refunds?

- **Annual plans.** Pro-rated refunds for the unused portion of your billing period.
- **Monthly plans.** No refunds. You can cancel at any time, and your access continues through the end of the billing period you already paid for.

## Can I white-label IronWorks?

White-labeling is available on the Business tier. This lets you present IronWorks under your own brand to your clients. Contact the IronWorks team for details on custom branding, domain configuration, and pricing for white-label deployments.

## How is IronWorks different from hiring freelancers or contractors?

IronWorks agents cost a fraction of what human contractors charge, are available 24/7, and do not need onboarding time beyond their initial SOUL.md and AGENTS.md configuration. They are best suited for structured, repeatable work: writing content, managing code, running audits, tracking finances, coordinating projects.

That said, AI agents are not a full replacement for human expertise in every situation. They work best when the task is well-defined, the success criteria are clear, and the work can be reviewed. For ambiguous, high-stakes decisions that require real-world experience, human judgment is still important.

## What adapters does IronWorks support?

IronWorks currently supports the following adapters for connecting agents to AI models:

- **Claude Local** (Anthropic) for Claude Opus, Sonnet, and Haiku models
- **Codex Local** (OpenAI) for GPT models
- **Gemini Local** (Google) for Gemini models
- **Cursor** for Cursor AI integration
- **OpenCode Local** for open-source model hosting
- **Pi Local** for Pi model integration
- **HTTP Adapter** for connecting to any model with a compatible API
- **OpenClaw Gateway** for gateway-based model routing

## Next Steps

- [Getting Started with IronWorks](getting-started.md) to set up your account
- [How AI Agents Work in IronWorks](how-agents-work.md) to understand the platform in depth
- [Security and Data Privacy](security-and-privacy.md) for detailed information on data protection
