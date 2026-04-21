/**
 * Lightweight error tracking for self-hosted deployments.
 * Captures unhandled errors, logs structured context, and provides
 * a foundation for future Sentry/Datadog integration.
 */
import { logger } from "../middleware/logger.js";

interface ErrorContext {
  route?: string;
  method?: string;
  userId?: string;
  agentId?: string;
  companyId?: string;
  extra?: Record<string, unknown>;
}

let errorCount = 0;
let lastErrorAt: Date | null = null;

/**
 * Track an error with structured context.
 * Currently logs via pino; can be extended to forward to Sentry/Datadog.
 */
export function captureError(err: unknown, context?: ErrorContext): void {
  errorCount++;
  lastErrorAt = new Date();

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  logger.error(
    {
      err: { message, stack },
      errorTracking: true,
      ...context,
    },
    `[error-tracking] ${message}`,
  );
}

/**
 * Get error tracking stats for the status bar / health endpoint.
 */
export function getErrorStats(): { totalErrors: number; lastErrorAt: string | null } {
  return {
    totalErrors: errorCount,
    lastErrorAt: lastErrorAt?.toISOString() ?? null,
  };
}

/**
 * Install global error handlers for unhandled rejections and uncaught exceptions.
 * Call once at server startup.
 */
export function installGlobalErrorHandlers(): void {
  process.on("unhandledRejection", (reason) => {
    captureError(reason, { extra: { type: "unhandledRejection" } });
  });

  process.on("uncaughtException", (err) => {
    captureError(err, { extra: { type: "uncaughtException" } });
    // Give logger time to flush, then exit (uncaught exceptions are fatal)
    setTimeout(() => process.exit(1), 1000);
  });

  logger.info("[error-tracking] Global error handlers installed");
}

/**
 * Reset accumulated error counters between tests so assertions on error count
 * do not depend on the execution order of other test files. Called by the
 * global beforeEach in setup-singletons.ts.
 */
export function _resetSingletonsForTest(): void {
  errorCount = 0;
  lastErrorAt = null;
}
