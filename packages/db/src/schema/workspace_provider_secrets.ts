import { customType, index, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { authUsers } from "./auth.js";
import { companies } from "./companies.js";

// bytea columns — Drizzle doesn't ship a first-class bytea helper, so we
// define a minimal custom type that maps to Buffer/Uint8Array at runtime.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const workspaceProviderSecrets = pgTable(
  "workspace_provider_secrets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    // One of the four HTTP provider adapter slugs
    provider: text("provider").notNull(),
    // AES-256-GCM ciphertext of the API key (encrypted with DEK)
    encryptedKey: bytea("encrypted_key").notNull(),
    // AES-256-GCM ciphertext of the DEK (encrypted with KEK)
    encryptedDek: bytea("encrypted_dek").notNull(),
    // 12-byte IV used when encrypting the DEK
    dekIv: bytea("dek_iv").notNull(),
    // 16-byte GCM auth tag from DEK encryption
    dekAuthTag: bytea("dek_auth_tag").notNull(),
    // 12-byte IV used when encrypting the API key with the DEK
    keyIv: bytea("key_iv").notNull(),
    // 16-byte GCM auth tag from API key encryption
    keyAuthTag: bytea("key_auth_tag").notNull(),
    // Last 4 chars of the plaintext API key — safe for UI display
    keyLastFour: varchar("key_last_four", { length: 4 }).notNull(),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    lastTestStatus: text("last_test_status"),
    lastTestError: text("last_test_error"),
    createdByUserId: text("created_by_user_id").references(() => authUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
  },
  (table) => ({
    companyIdx: index("idx_wps_company").on(table.companyId),
    companyProviderUq: uniqueIndex("wps_company_provider_uq").on(table.companyId, table.provider),
  }),
);

export type WorkspaceProviderSecret = typeof workspaceProviderSecrets.$inferSelect;
export type NewWorkspaceProviderSecret = typeof workspaceProviderSecrets.$inferInsert;
