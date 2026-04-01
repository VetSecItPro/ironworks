import { and, eq, gte, ilike, lt, ne, sql } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import { agents, companies, companySubscriptions, issues } from "@ironworksai/db";
import { logActivity } from "./activity-log.js";
import { logger } from "../middleware/logger.js";

function currentUtcMonthWindow(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0)),
  };
}

function daysRemainingInMonth(now = new Date()) {
  const { end } = currentUtcMonthWindow(now);
  const msRemaining = end.getTime() - now.getTime();
  return Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
}

function formatDollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Check company monthly budget thresholds and take action when they are crossed.
 *
 * Only runs for companies whose subscription uses `llm_auth_method = "api_key"`.
 * OAuth customers manage their own billing and are excluded.
 *
 * Thresholds:
 *   80%  — create a high-priority issue assigned to the CFO (or CEO) agent.
 *           Deduped: only one alert per calendar month.
 * 100%  — create a critical issue and pause all non-CEO agents.
 */
export async function checkBudgetAlerts(db: Db, companyId: string): Promise<void> {
  // --- 1. Gate: only run for api_key customers ---
  const subscription = await db
    .select({ llmAuthMethod: companySubscriptions.llmAuthMethod })
    .from(companySubscriptions)
    .where(eq(companySubscriptions.companyId, companyId))
    .then((rows) => rows[0] ?? null);

  if (!subscription || subscription.llmAuthMethod !== "api_key") {
    return;
  }

  // --- 2. Get company's monthly budget and current spend ---
  const company = await db
    .select({
      budgetMonthlyCents: companies.budgetMonthlyCents,
      spentMonthlyCents: companies.spentMonthlyCents,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .then((rows) => rows[0] ?? null);

  if (!company || company.budgetMonthlyCents <= 0) {
    // No budget configured — nothing to check.
    return;
  }

  const { budgetMonthlyCents, spentMonthlyCents } = company;
  const ratio = spentMonthlyCents / budgetMonthlyCents;

  // --- 3. Resolve month window for dedup queries ---
  const now = new Date();
  const { start: monthStart } = currentUtcMonthWindow(now);
  const daysLeft = daysRemainingInMonth(now);

  // --- 4. Find CFO or CEO agent to assign alert issues ---
  async function findAssigneeAgent(): Promise<string | null> {
    const allAgents = await db
      .select({ id: agents.id, role: agents.role })
      .from(agents)
      .where(eq(agents.companyId, companyId));

    const cfo = allAgents.find((a) => a.role === "cfo");
    if (cfo) return cfo.id;

    const ceo = allAgents.find((a) => a.role === "ceo");
    return ceo?.id ?? null;
  }

  // --- 5. 100% exceeded: pause agents + create critical issue ---
  if (ratio >= 1.0) {
    // Dedup: check if a "budget exceeded" issue already exists this month.
    const existingExceeded = await db
      .select({ id: issues.id })
      .from(issues)
      .where(
        and(
          eq(issues.companyId, companyId),
          ilike(issues.title, "%[System] Monthly budget exceeded%"),
          gte(issues.createdAt, monthStart),
        ),
      )
      .then((rows) => rows[0] ?? null);

    if (!existingExceeded) {
      const assigneeAgentId = await findAssigneeAgent();

      // Increment issue counter and create the issue manually.
      const [updatedCompany] = await db
        .update(companies)
        .set({ issueCounter: sql`${companies.issueCounter} + 1` })
        .where(eq(companies.id, companyId))
        .returning({ issueCounter: companies.issueCounter, issuePrefix: companies.issuePrefix });

      const identifier = `${updatedCompany.issuePrefix}-${updatedCompany.issueCounter}`;

      const [createdIssue] = await db
        .insert(issues)
        .values({
          companyId,
          title: `[System] Monthly budget exceeded — all agents paused`,
          description: `Monthly budget of ${formatDollars(budgetMonthlyCents)} has been reached. Spend: ${formatDollars(spentMonthlyCents)}. All non-CEO agents have been paused automatically.`,
          status: "todo",
          priority: "urgent",
          originKind: "system",
          assigneeAgentId,
          issueNumber: updatedCompany.issueCounter,
          identifier,
        })
        .returning({ id: issues.id });

      await logActivity(db, {
        companyId,
        actorType: "system",
        actorId: "budget-alerts",
        action: "budget.exceeded",
        entityType: "issue",
        entityId: createdIssue.id,
        details: {
          spentMonthlyCents,
          budgetMonthlyCents,
          utilizationPercent: Math.round(ratio * 100),
        },
      });

      logger.warn(
        { companyId, spentMonthlyCents, budgetMonthlyCents },
        "budget.exceeded: company monthly budget exceeded, pausing agents",
      );
    }

    // Pause all non-CEO agents regardless of whether the issue was just created.
    const nonCeoAgents = await db
      .select({ id: agents.id })
      .from(agents)
      .where(
        and(
          eq(agents.companyId, companyId),
          ne(agents.role, "ceo"),
          ne(agents.status, "paused"),
        ),
      );

    if (nonCeoAgents.length > 0) {
      await db
        .update(agents)
        .set({
          status: "paused",
          pauseReason: "budget_exceeded",
          pausedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(agents.companyId, companyId),
            ne(agents.role, "ceo"),
            ne(agents.status, "paused"),
          ),
        );
    }

    return; // Don't also fire the 80% alert.
  }

  // --- 6. 80% warning: create CFO alert issue if not already issued this month ---
  if (ratio >= 0.8) {
    const existingAlert = await db
      .select({ id: issues.id })
      .from(issues)
      .where(
        and(
          eq(issues.companyId, companyId),
          ilike(issues.title, "%[CFO Alert] Budget 80%%"),
          gte(issues.createdAt, monthStart),
          lt(issues.createdAt, new Date(monthStart.getTime() + 32 * 24 * 60 * 60 * 1000)),
        ),
      )
      .then((rows) => rows[0] ?? null);

    if (existingAlert) {
      return; // Already alerted this month.
    }

    const assigneeAgentId = await findAssigneeAgent();

    const [updatedCompany] = await db
      .update(companies)
      .set({ issueCounter: sql`${companies.issueCounter} + 1` })
      .where(eq(companies.id, companyId))
      .returning({ issueCounter: companies.issueCounter, issuePrefix: companies.issuePrefix });

    const identifier = `${updatedCompany.issuePrefix}-${updatedCompany.issueCounter}`;

    const [createdIssue] = await db
      .insert(issues)
      .values({
        companyId,
        title: `[CFO Alert] Budget 80% consumed — ${formatDollars(spentMonthlyCents)}/${formatDollars(budgetMonthlyCents)} with ${daysLeft} days remaining`,
        description: `The company has consumed ${Math.round(ratio * 100)}% of its monthly LLM budget (${formatDollars(spentMonthlyCents)} of ${formatDollars(budgetMonthlyCents)}). ${daysLeft} days remain in the current billing month.`,
        status: "todo",
        priority: "high",
        originKind: "system",
        assigneeAgentId,
        issueNumber: updatedCompany.issueCounter,
        identifier,
      })
      .returning({ id: issues.id });

    await logActivity(db, {
      companyId,
      actorType: "system",
      actorId: "budget-alerts",
      action: "budget.alert_80_percent",
      entityType: "issue",
      entityId: createdIssue.id,
      details: {
        spentMonthlyCents,
        budgetMonthlyCents,
        utilizationPercent: Math.round(ratio * 100),
        daysRemaining: daysLeft,
      },
    });

    logger.warn(
      { companyId, spentMonthlyCents, budgetMonthlyCents, daysLeft },
      "budget.alert_80_percent: company monthly budget 80% consumed",
    );
  }
}
