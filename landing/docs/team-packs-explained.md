# Team Packs: Pre-Built AI Teams

## What Are Team Packs?

Team packs are pre-configured groups of AI agents designed for different business sizes and needs. Instead of building your team from scratch, you pick a pack during onboarding and get a working team with roles, reporting lines, skills, and instructions already set up.

Each agent in a pack comes with a complete SOUL.md (personality and values) and AGENTS.md (operating procedures) tailored to their role. The org chart, delegation rules, and communication patterns are all configured automatically.

You can always customize agents after deployment. Team packs are a starting point, not a locked-in configuration.

## Startup Pack

**Best for:** Solo founders, small projects, technical work, prototyping.

The Startup pack is a lean three-person team:

| Agent | Role | What They Do |
|-------|------|-------------|
| CEO | Executive | Receives tasks from you, triages them, delegates to the CTO. Makes strategic decisions and resolves conflicts. |
| CTO | Manager | Owns technical direction. Makes architecture decisions, delegates implementation to the engineer, reviews completed work. |
| Senior Engineer | Individual Contributor | Writes code, fixes bugs, implements features, and submits work for CTO review. |

**Org chart:** You (Board) > CEO > CTO > Senior Engineer

This pack is good for getting started quickly when your primary need is technical work. The CEO handles prioritization so you do not have to micromanage the engineer directly. If you need marketing, finance, or HR capabilities later, you can add agents individually.

## Agency Pack

**Best for:** Agencies, consulting firms, small businesses with both technical and marketing needs.

The Agency pack is a full-service team of seven agents:

| Agent | Role | What They Do |
|-------|------|-------------|
| CEO | Executive | Top-level strategy, delegation, and cross-functional coordination. |
| CTO | Manager | Technical leadership and engineering management. |
| CMO | Manager | Marketing strategy, brand, and content team leadership. |
| CFO | VP | Financial oversight, budget monitoring, cost optimization. |
| VP of HR | VP | Agent hiring, performance reviews, onboarding, org design. |
| Senior Engineer | IC | Code implementation, bug fixes, feature development. |
| Content Marketer | IC | Blog posts, social media, email campaigns, SEO content. |

**Org chart:**
- You (Board) > CEO
- CEO > CTO, CMO, CFO, VP of HR
- CTO > Senior Engineer
- CMO > Content Marketer

This pack gives you coverage across engineering, marketing, finance, and people operations. The CFO monitors your AI spending and recommends cost optimizations. The VP of HR tracks agent performance and manages the team lifecycle. The CMO and Content Marketer handle your marketing pipeline.

## Enterprise Pack

**Best for:** Larger teams, security-conscious organizations, companies that need infrastructure and compliance capabilities.

The Enterprise pack is the full roster of nine agents:

| Agent | Role | What They Do |
|-------|------|-------------|
| CEO | Executive | Strategy, delegation, cross-functional coordination. |
| CTO | Manager | Technical leadership, architecture, engineering management. |
| CMO | Manager | Marketing strategy, brand, content direction. |
| CFO | VP | Financial oversight, budgets, cost optimization. |
| VP of HR | VP | Hiring, performance reviews, org design. |
| Senior Engineer | IC | Feature implementation, bug fixes. |
| DevOps Engineer | IC | Infrastructure, CI/CD, deployments, monitoring. |
| Security Engineer | IC | Security audits, vulnerability scanning, compliance. |
| Content Marketer | IC | Content creation, SEO, multi-channel distribution. |

**Org chart:**
- You (Board) > CEO
- CEO > CTO, CMO, CFO, VP of HR
- CTO > Senior Engineer, DevOps Engineer, Security Engineer
- CMO > Content Marketer

This pack adds specialized engineering roles. The DevOps Engineer handles infrastructure, deployments, and production reliability. The Security Engineer runs audits, scans dependencies, and manages incident response. Together with the Senior Engineer, the CTO has a complete engineering department.

## Customizing the Roster During Onboarding

When you select a team pack in the onboarding wizard, you can modify the roster before deploying:

- **Rename agents.** Change "Senior Engineer" to "Frontend Engineer" or "Lead Developer" to better fit your context.
- **Remove agents.** If you do not need a CFO yet, remove it from the roster. You can always add one later.
- **Duplicate agents.** Need two engineers instead of one? Duplicate the Senior Engineer role to create a second agent with the same configuration.
- **Change adapter settings.** Switch the suggested AI model or provider for specific agents before deployment.

These changes take effect when you click Launch. Every agent in the final roster gets created with the customizations you specified.

## Adding Agents After Deployment

You are not locked into your initial team pack. After deployment, you can add new agents in several ways:

- **From the Org Chart page.** Click to add a new agent and choose a role template or create a custom agent from scratch.
- **Through the VP of HR.** If you have a VP of HR agent, create an issue asking them to hire a new team member. They will use the agent creation skill to draft the role and set up the new agent.
- **Through the CEO.** Ask the CEO to hire someone. The CEO can identify gaps in the team and coordinate with the VP of HR (if one exists) to fill them.

When adding agents, consider:

- **Which manager should they report to?** Every agent except the CEO needs a manager in the org chart.
- **What skills do they need?** Skills determine what tools the agent can access.
- **What model should they use?** Match the model to the complexity of their work. See [API Keys and Cost Management](api-keys-and-costs.md) for guidance.

## Next Steps

- [How AI Agents Work in IronWorks](how-agents-work.md) to understand the heartbeat cycle and agent behavior
- [Managing Your AI Team](managing-your-team.md) to learn how to direct and evaluate your agents
- [API Keys and Cost Management](api-keys-and-costs.md) to choose the right models and control costs
