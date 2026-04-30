import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../errors.js";
import { captureError } from "../lib/error-tracking.js";
import { sanitizeRecord } from "../redaction.js";

export interface ErrorContext {
  error: { message: string; stack?: string; name?: string; details?: unknown; raw?: unknown };
  method: string;
  url: string;
  reqBody?: unknown;
  reqParams?: unknown;
  reqQuery?: unknown;
}

/**
 * SEC-LOG-001: redact request body/params/query before they're attached for downstream
 * loggers. Without this, POSTs to /api/setup, /api/secrets, /api/providers etc. would
 * leak password/token/apiKey/authorization fields into error logs. `sanitizeRecord`
 * (server/src/redaction.ts) matches secret-ish key names case-insensitively and also
 * redacts JWT-shaped values regardless of key name.
 */
function redactForLogging(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactForLogging);
  // Plain object: feed through the secret-key sanitizer
  return sanitizeRecord(value as Record<string, unknown>);
}

function attachErrorContext(req: Request, res: Response, payload: ErrorContext["error"], rawError?: Error) {
  // biome-ignore lint/suspicious/noExplicitAny: attaching custom props to Express Response not in its type definitions
  (res as any).__errorContext = {
    error: payload,
    method: req.method,
    url: req.originalUrl,
    reqBody: redactForLogging(req.body),
    reqParams: redactForLogging(req.params),
    reqQuery: redactForLogging(req.query),
  } satisfies ErrorContext;
  if (rawError) {
    // biome-ignore lint/suspicious/noExplicitAny: attaching custom props to Express Response not in its type definitions
    (res as any).err = rawError;
  }
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    if (err.status >= 500) {
      attachErrorContext(
        req,
        res,
        { message: err.message, stack: err.stack, name: err.name, details: err.details },
        err,
      );
    }
    res.status(err.status).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    // Zod 4 removed the `.errors` alias; `.issues` is the canonical property.
    res.status(400).json({ error: "Validation error", details: err.issues });
    return;
  }

  const rootError = err instanceof Error ? err : new Error(String(err));
  attachErrorContext(
    req,
    res,
    err instanceof Error
      ? { message: err.message, stack: err.stack, name: err.name }
      : { message: String(err), raw: err, stack: rootError.stack, name: rootError.name },
    rootError,
  );

  captureError(err, { route: req.originalUrl, method: req.method });
  res.status(500).json({ error: "Internal server error" });
}
