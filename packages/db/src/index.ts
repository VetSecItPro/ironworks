export {
  formatDatabaseBackupResult,
  type RunDatabaseBackupOptions,
  type RunDatabaseBackupResult,
  type RunDatabaseRestoreOptions,
  runDatabaseBackup,
  runDatabaseRestore,
} from "./backup-lib.js";
export {
  type BackupRetentionPolicy,
  pruneBackupsWithPolicy,
  resolveRetentionPolicy,
} from "./backup-retention.js";
export {
  applyPendingMigrations,
  createDb,
  type Db,
  ensurePostgresDatabase,
  getPostgresDataDirectory,
  inspectMigrations,
  type MigrationBootstrapResult,
  type MigrationHistoryReconcileResult,
  type MigrationState,
  migratePostgresIfEmpty,
  reconcilePendingMigrationHistory,
} from "./client.js";
export {
  createEmbeddedPostgresLogBuffer,
  formatEmbeddedPostgresError,
} from "./embedded-postgres-error.js";
export * from "./schema/index.js";
export {
  type EmbeddedPostgresTestDatabase,
  type EmbeddedPostgresTestSupport,
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./test-embedded-postgres.js";
