// Hand-rolled security headers middleware. Extracted from app.ts so the
// header set + CSP can be unit-tested without booting the full server.
//
// Behavior is identical to the inline implementation in createApp():
//   - X-Content-Type-Options: nosniff
//   - X-Frame-Options: DENY
//   - Referrer-Policy: strict-origin-when-cross-origin
//   - Strict-Transport-Security: max-age=31536000; includeSubDomains
//   - Content-Security-Policy (production only — skipped in vite-dev so HMR works)
//
// The CSP carries an explicit script SHA-256 for the inline theme-detection
// snippet in ui/index.html. See app.ts for the recompute incantation if the
// snippet changes.

import type { RequestHandler } from "express";

export const PRODUCTION_CSP =
  "default-src 'self'; " +
  "script-src 'self' 'sha256-6vvXBpbC3dPDRTfAkvCMzs3MZCffSXiteXHKnMn1oCs='; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com data:; " +
  "img-src 'self' data: blob:; " +
  "connect-src 'self' ws: wss: https://api.anthropic.com https://api.openai.com https://generativelanguage.googleapis.com https://openrouter.ai; " +
  "frame-src 'none'; " +
  "object-src 'none'; " +
  "base-uri 'self'";

export interface SecurityHeadersOptions {
  /**
   * When true, skip the Content-Security-Policy header. Used for vite-dev so
   * HMR + inline injection from the dev server isn't blocked.
   */
  skipCsp?: boolean;
}

export function securityHeadersMiddleware(options: SecurityHeadersOptions = {}): RequestHandler {
  const skipCsp = options.skipCsp === true;
  return (_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    if (!skipCsp) {
      res.setHeader("Content-Security-Policy", PRODUCTION_CSP);
    }
    next();
  };
}
