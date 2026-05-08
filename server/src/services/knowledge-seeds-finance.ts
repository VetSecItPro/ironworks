import type { KnowledgeSeed } from "./knowledge-seeds.js";

export const financeSeeds: KnowledgeSeed[] = [
  {
    title: "Cost Management Guidelines",
    body: `# Cost Management Guidelines

Every token your agents consume costs money. Here is how to keep costs under control without sacrificing quality.

## Model Selection by Role

Not every agent needs the most expensive model. Match the model to the complexity of the work.

| Role | Recommended Model Tier | Why |
|---|---|---|
| CEO | Opus (high reasoning) | Strategy and complex decision-making |
| CTO | Opus or Sonnet | Architecture needs deep reasoning, code review can use Sonnet |
| Senior Engineer | Sonnet | Most coding tasks work well with Sonnet |
| Security Engineer | Sonnet | Security analysis is pattern-based, Sonnet handles it |
| Content Marketer | Sonnet or Haiku | Writing tasks rarely need Opus-level reasoning |
| DevOps Engineer | Sonnet | Infrastructure work is procedural |

## Cost Red Flags

Watch for these on the Costs page and Agent Performance:

- An agent spending more than $1 per task on simple work (probably wrong model)
- Token count spiking without corresponding task completion (agent may be looping)
- One agent consuming more than 50% of total spend (overloaded or misconfigured)
- Increasing cost per task over time for the same agent (instructions may be getting too long)

## How to Reduce Costs

1. Switch to a smaller model. Try Sonnet first, only use Opus when Sonnet fails.
2. Reduce context. Shorter SOUL.md and AGENTS.md means fewer input tokens per run.
3. Break large tasks into smaller ones. Smaller tasks use less context per run.
4. Set budget limits per agent. IronWorks will pause an agent that exceeds their budget.
5. Review the Agent Performance page weekly. The cost-per-task metric tells you exactly who is expensive.`,
  },
  {
    title: "Budget Planning & Approval Process",
    body: `# Budget Planning & Approval Process

## Purpose

Defines how operational budgets are planned, approved, and adjusted. The primary cost is LLM token consumption.

## Annual Budget Planning Cycle

| Phase | Timing | Owner | Deliverable |
|---|---|---|---|
| Forecast | December 1-15 | CFO | Next-year cost projection |
| Department Requests | December 15-31 | All leads | Budget requests with justification |
| Consolidation | January 1-10 | CFO | Unified proposal with scenarios |
| Approval | January 10-15 | CEO | Final budget with per-department allocations |
| Distribution | January 15-20 | CFO | Per-agent budgets set in platform |

## Quarterly Review Schedule

- **Q1 Review (April 1-5):** Compare actuals to plan. Adjust Q2.
- **Q2 Review (July 1-5):** Mid-year checkpoint. Re-forecast H2.
- **Q3 Review (October 1-5):** Assess trajectory. Flag annual overrun risk.
- **Q4 Review (January 1-5):** Final reconciliation. Feed into next annual plan.

Each review must include: total spend vs budget, per-department variance, top 5 agents by spend with ROI, vendor pricing changes, and headcount changes.

## Budget Change Approval Matrix

| Change Type | Amount | Approver | Turnaround |
|---|---|---|---|
| Within-tier reallocation | Any | CFO | Same day |
| Single agent increase | Up to $50/month | CFO | 1 business day |
| Single agent increase | $50 - $200/month | CEO | 2 business days |
| New agent provisioning | Any | CEO | 2 business days |
| Department increase | Up to $500/month | CFO | 2 business days |
| Department increase | Over $500/month | CEO | 3 business days |
| Emergency overage | Up to 25% | CFO | 1 hour |
| Emergency overage | Over 25% | CEO | 4 hours |

## Requesting Additional Budget

Must include: current allocation, requested amount, duration, justification, expected outcome, and alternatives considered.

## ROI Tracking

Every agent over $50/month must have measurable output metrics. CFO calculates cost-per-unit monthly. Agents consistently above 2x team average are flagged for review.

## Vendor Cost Comparison

CFO maintains current pricing for all LLM providers and reviews monthly. When pricing changes, within 48 hours: model impact, identify agents to switch, present options to CEO, execute within 1 week.

## Cost Forecasting

Monthly forecast = (current daily average * days remaining) + known upcoming projects. CFO maintains rolling 3-month forecast updated weekly with base, high, and low cases. If actuals deviate > 15% for two consecutive months, recalibrate methodology.`,
  },
  {
    title: "Financial Reporting Schedule",
    body: `# Financial Reporting Schedule

## Report Calendar

| Report | Frequency | Producer | Audience | Due By |
|---|---|---|---|---|
| Cost Dashboard Review | Daily | CFO | CEO (on request) | 9:00 AM CT |
| Weekly Spend Summary | Weekly | CFO | CEO | Monday 10:00 AM CT |
| Monthly Detailed Report | Monthly | CFO | CEO | 3rd business day |
| Quarterly Trend Analysis | Quarterly | CFO | CEO | 5th business day |
| Annual Financial Review | Annually | CFO | CEO | January 15 |

## Daily: Cost Dashboard Review

CFO checks every morning:
- Total spend in last 24 hours vs daily average
- Any agents that triggered budget alerts
- Any paused agents blocking critical work
- Anomalies: any agent spending > 3x daily average
- Provider API status

Action triggers: daily spend > 150% of 7-day average - investigate immediately.

## Weekly: Spend Summary

Includes: total weekly spend, MTD budget consumed %, projected month-end, department breakdown, alerts triggered, budget changes approved, key callout.

CEO reviews projected spend and pending approvals by Tuesday EOD.

## Monthly: Detailed Financial Report

Sections: Executive Summary (total vs budget, active agents, top cost drivers), Spend by Agent (budget, actual, variance, model mix), Spend by Project, Spend by Model (tokens, cost, % of spend), Incidents and Anomalies, Recommendations.

CEO approves adjustments within 2 business days.

## Quarterly: Trend Analysis

13-week spend trend, quarter-over-quarter comparison, cost per agent trend, model pricing changes, forecast accuracy review, agent roster changes, vendor performance, updated 3-month forecast.

CEO validates strategic alignment and approves next quarter allocations.

## Annual: Financial Review

Full-year spend vs budget, total cost of AI operations, year-over-year comparison, cost per output unit by department, vendor spend breakdown, infrastructure costs, total cost of ownership per agent, lessons learned, next year preliminary budget.

CEO approves next year framework, sets efficiency targets, authorizes vendor renewals.

## Report Retention

All financial reports stored in KB under Finance category. Retained indefinitely for trend analysis. Raw data retained 24 months.`,
  },
];
