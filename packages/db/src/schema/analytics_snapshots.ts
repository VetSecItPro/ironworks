import {
  pgTable,
  uuid,
  date,
  integer,
  real,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const analyticsSnapshots = pgTable(
  "analytics_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    snapshotDate: date("snapshot_date").notNull(),
    totalCompanies: integer("total_companies").notNull().default(0),
    totalUsers: integer("total_users").notNull().default(0),
    totalAgents: integer("total_agents").notNull().default(0),
    mrrCents: integer("mrr_cents").notNull().default(0),
    newSignups: integer("new_signups").notNull().default(0),
    churnCount: integer("churn_count").notNull().default(0),
    totalIssues: integer("total_issues").notNull().default(0),
    totalRuns: integer("total_runs").notNull().default(0),
    successRate: real("success_rate").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    dateUniqueIdx: uniqueIndex("analytics_snapshots_date_unique").on(table.snapshotDate),
  }),
);
