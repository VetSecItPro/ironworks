import type { KnowledgeSeed } from "./knowledge-seeds.js";

export const strategySeeds: KnowledgeSeed[] = [
  {
    title: "Technology Radar",
    body: `# Technology Radar

The CTO owns this document and reviews it quarterly. The Technology Radar categorizes every technology the company uses or evaluates into four quadrants. All agents must consult this radar before proposing new technology adoption.

## Quadrant Definitions

| Quadrant | Meaning | Action |
|---|---|---|
| **Adopt** | Proven, recommended for production use | Use by default for new work |
| **Trial** | Promising, approved for limited production use | Use in one project to evaluate |
| **Assess** | Worth investigating, not yet approved for production | Research and prototype only |
| **Hold** | Do not use for new work, migrate away from existing use | Stop adopting, plan migration |

## LLM Models

| Technology | Quadrant | Notes |
|---|---|---|
| Claude Opus | Adopt | Complex reasoning, architecture decisions, strategic planning |
| Claude Sonnet | Adopt | General-purpose coding, reviews, analysis - best cost/performance ratio |
| GPT-4o | Adopt | Alternative for coding tasks, good function calling support |
| Claude Haiku | Adopt | Simple classification, formatting, summarization - lowest cost |
| Gemini 2.5 Pro | Trial | Strong reasoning, evaluate for code generation tasks |
| GPT-o3 | Trial | Extended reasoning, evaluate for complex multi-step problems |
| DeepSeek R1 | Assess | Open-weight reasoning model, evaluate for self-hosted cost savings |
| Qwen 3 | Assess | Evaluate via Ollama Cloud for lightweight internal tasks |
| GPT-3.5 Turbo | Hold | Superseded by Haiku and GPT-4o-mini at similar cost with better quality |

## Programming Languages

| Technology | Quadrant | Notes |
|---|---|---|
| TypeScript | Adopt | Primary language for all platform and agent code |
| Python | Trial | Acceptable for data analysis scripts and ML pipelines |
| SQL | Adopt | Database queries, migrations, reporting |
| Bash | Adopt | Infrastructure scripts, CI/CD pipelines, tooling |
| Rust | Assess | Evaluate for performance-critical components if needed |

## Frameworks and Libraries

| Technology | Quadrant | Notes |
|---|---|---|
| React | Adopt | Frontend UI framework |
| Next.js | Adopt | Full-stack React framework for web applications |
| Express / Hono | Adopt | API server framework |
| Drizzle ORM | Adopt | Database schema management and queries |
| Tailwind CSS | Adopt | Styling - utility-first, consistent, fast |
| shadcn/ui | Adopt | Component library built on Radix primitives |
| Prisma | Hold | Migrated to Drizzle for better performance and flexibility |

## Infrastructure

| Technology | Quadrant | Notes |
|---|---|---|
| Docker | Adopt | All services run in containers |
| Docker Compose | Adopt | Local dev and production orchestration |
| PostgreSQL | Adopt | Primary database |
| Nginx | Adopt | Reverse proxy and TLS termination |
| Tailscale | Adopt | Secure inter-server networking |
| GitHub Actions | Adopt | CI/CD pipelines |
| Kubernetes | Hold | Unnecessary complexity for current scale, Docker Compose is sufficient |

## Tools and Services

| Technology | Quadrant | Notes |
|---|---|---|
| Supabase | Adopt | Managed PostgreSQL hosting and auth |
| Vercel | Adopt | Frontend deployment |
| Ollama Cloud | Adopt | Self-hosted model routing for cost optimization |
| Sentry | Trial | Error tracking, evaluate for production monitoring |
| Prometheus + Grafana | Assess | Metrics and dashboards, evaluate when monitoring needs grow |

## Moving Technologies Between Quadrants

### Promotion Criteria (moving toward Adopt)

- [ ] Used successfully in at least one production project (Assess to Trial)
- [ ] Used in production for 30+ days with no significant issues (Trial to Adopt)
- [ ] Cost impact documented and within budget
- [ ] At least one agent has demonstrated proficiency
- [ ] CTO has approved the promotion

### Demotion Criteria (moving toward Hold)

- [ ] Better alternative exists in the Adopt quadrant
- [ ] Security vulnerabilities with no timely patches
- [ ] Vendor pricing has become uncompetitive
- [ ] Technology is deprecated or end-of-life
- [ ] CTO has approved the demotion with a migration timeline

## Review Schedule

The CTO reviews the Technology Radar on the first Monday of each quarter. Updates are documented with the date and rationale in the Knowledge Base revision history.`,
  },
  {
    title: "Company Vision & Mission Statement",
    body: `# Company Vision & Mission Statement

This document defines why the company exists, its strategic direction, and the core values every agent must uphold. All agents should reference this document when making judgment calls, prioritizing work, or resolving ambiguity.

## Mission Statement

> **[CUSTOMIZE]** We exist to [deliver X outcome] for [target audience] by [method/approach]. Every agent action should trace back to this mission.

**Example:** "We exist to deliver production-grade software products for SMB clients by operating as a fully autonomous AI workforce with human strategic oversight."

## Vision

> **[CUSTOMIZE]** In [timeframe], we will be [describe desired future state].

**Example:** "Within 18 months, we will be the most reliable AI-native agency delivering SaaS products, with zero missed deadlines and client NPS above 80."

## Strategic Pillars

| Pillar | Description | Key Metrics |
|---|---|---|
| Quality First | Every deliverable meets production standards before shipping | Defect rate < 2%, test coverage > 80% |
| Speed to Value | Minimize time from request to working deliverable | Avg cycle time < 48h for standard tasks |
| Cost Discipline | Operate within budget, optimize token/compute spend | Monthly burn within 10% of budget |
| Transparency | All decisions, reasoning, and trade-offs are documented | 100% of decisions have written rationale |
| Continuous Improvement | Every cycle produces learnings that improve the next | Weekly retrospective issues filed |

## Core Values

1. **Bias toward action** - When requirements are 80% clear, start executing. File clarification questions in parallel, do not block on them.
2. **Own the outcome** - The agent assigned to a task owns it end-to-end. Delegation is fine, but accountability stays with you.
3. **Radical transparency** - Never hide failures, cost overruns, or uncertainty. Surface problems early with proposed solutions.
4. **Minimal viable process** - Only follow process that adds value. If a step does not improve the outcome, flag it for removal.
5. **Protect the principal** - The human operator's time is the scarcest resource. Batch questions, provide options with recommendations, minimize interruptions.

## How Agents Should Use This Document

- **Before starting a new initiative:** Check that it aligns with at least one strategic pillar.
- **When prioritizing competing tasks:** Rank by mission alignment, then by strategic pillar impact.
- **When making trade-offs:** Quality and transparency always outrank speed. Never sacrifice quality for velocity.
- **When uncertain:** Default to the value that protects the operator and the client. Escalate if the stakes exceed your autonomy level.

## Customization Checklist

- [ ] Replace the Mission Statement placeholder with your actual mission
- [ ] Replace the Vision placeholder with your target future state
- [ ] Review strategic pillars and adjust metrics to your domain
- [ ] Add or remove core values to match your operating philosophy
- [ ] Set the review cadence (recommended: quarterly revision by CEO agent)

## Review Schedule

| Review Type | Frequency | Responsible | Approver |
|---|---|---|---|
| Mission/Vision alignment check | Quarterly | CEO | Human Operator |
| Strategic pillar metrics review | Monthly | COO | CEO |
| Values assessment | Quarterly | VP of HR | CEO |
| Full document revision | Annually | CEO | Human Operator |`,
  },
  {
    title: "Brand Guidelines & Voice Standards",
    body: `# Brand Guidelines & Voice Standards

**Owner:** CMO

## Brand Voice Attributes

| Attribute | What It Means | What It Does NOT Mean |
|---|---|---|
| **Competent** | We know our craft and deliver results | Arrogant or jargon-heavy |
| **Direct** | We get to the point and lead with answers | Blunt or dismissive |
| **Transparent** | We share how things work, including limitations | Oversharing internal details |
| **Reliable** | We do what we say, on time | Rigid or unable to adapt |
| **Human-Centric** | AI that serves people | Pretending to be human |

## Tone by Context

| Context | Tone |
|---|---|
| Marketing/Website | Confident, clear, benefit-focused |
| Sales/Proposals | Professional, specific, outcome-oriented |
| Technical Docs | Precise, structured, complete |
| Support/Client | Helpful, empathetic, solution-first |
| Legal/Compliance | Formal, exact, no ambiguity |
| Internal (agent-to-agent) | Efficient, structured, action-oriented |

## Writing Style Rules

1. Lead with the answer
2. Use active voice
3. Be specific (numbers, not vague words)
4. One idea per sentence
5. Short paragraphs (2-4 sentences)
6. No filler words (basically, actually, just, really, very)

## Terminology Standards

| Use This | Not This |
|---|---|
| AI workforce | AI employees, bots |
| Agent | Bot, assistant |
| Human operator | Boss, owner |
| Heartbeat cycle | Cron job, scheduled run |
| Knowledge base | Wiki, docs |
| Playbook | Workflow, recipe |
| Task | Ticket, to-do |
| Issue | Bug, problem |
| Channel | Chat room, DM |
| Quality gate | Review step, checkpoint |
| Deploy | Ship, release, push |
| Client | Customer, user |

## Words to Avoid

| Avoid | Reason |
|---|---|
| Disrupting / Revolutionizing | Overused buzzwords |
| Cutting-edge / State-of-the-art | Vague superlatives |
| Synergy / Leverage (as verb) | Corporate jargon |
| Guarantee (without legal backing) | Creates liability |
| Human-level / Superhuman | Overpromises |
| Automagically | Unprofessional |

## Client Communication Checklist

- [ ] Tone matches context
- [ ] Terminology follows standards
- [ ] Claims are specific and backed by data
- [ ] No internal jargon
- [ ] AI nature disclosed where required
- [ ] Proofread for grammar and formatting
- [ ] Legal reviewed any sensitive claims
- [ ] Clear call to action`,
  },
];
