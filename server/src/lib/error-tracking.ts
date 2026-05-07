/**
 * Lightweight error tracking for self-hosted deployments.
 * Captures unhandled errors, logs structured context, and provides
 * a foundation for future Sentry/Datadog integration.
 */
import { logger } from "../middleware/logger.js";
import { postAlert } from "../observability/alerter.js";

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
    // Off-box alert (no-op when IRONWORKS_ALERT_WEBHOOK_URL is unset). Rate-
    // limited inside the alerter so a flapping rejection loop can't drown
    // the channel. .catch() guards against any future alerter regression
    // throwing into the global handler.
    postAlert({
      severity: "error",
      source: "uncaught",
      message: reason instanceof Error ? reason.message : String(reason),
      details: { type: "unhandledRejection" },
    }).catch(() => undefined);
  });

  process.on("uncaughtException", (err) => {
    captureError(err, { extra: { type: "uncaughtException" } });
    postAlert({
      severity: "error",
      source: "uncaught",
      message: err instanceof Error ? err.message : String(err),
      details: { type: "uncaughtException", stack: err instanceof Error ? err.stack : undefined },
    }).catch(() => undefined);
    // Give logger + alerter time to flush, then exit (uncaught exceptions
    // are fatal). The 1s window is the same delay used pre-alerter so we
    // don't slow shutdown — alerter has a 5s internal timeout but practice
    // shows Slack/Discord respond well under 1s.
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
