import { logger } from "../middleware/logger.js";

/**
 * Minimal email service interface.
 *
 * Ironworks ships without a baked-in transactional email provider — operators
 * choose at deploy time. The default `console` transport logs the email body
 * (including any verification URL) to stdout/structured logs and is safe for
 * dev/local. Production deployments should set IRONWORKS_EMAIL_TRANSPORT to
 * an integrated provider once one is wired in (Resend / SES / Postmark).
 *
 * The service is intentionally tiny so it can be re-exported from a single
 * spot and mocked in tests via `setEmailService`.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Optional structured tag for log correlation (e.g. "verify-email"). */
  tag?: string;
}

export interface EmailService {
  sendEmail(input: SendEmailInput): Promise<void>;
  /** True when a real (non-console) transport is configured. */
  readonly isConfigured: boolean;
  /** Identifier of the active transport ("console" | "resend" | ...). */
  readonly transport: string;
}

class ConsoleEmailService implements EmailService {
  readonly isConfigured = false;
  readonly transport = "console";

  async sendEmail(input: SendEmailInput): Promise<void> {
    logger.warn(
      {
        to: input.to,
        subject: input.subject,
        tag: input.tag ?? "email",
        // The text body is logged verbatim so dev/local users can copy the
        // verification URL. Production must NOT use this transport.
        body: input.text,
      },
      "[email:console] no transport configured — logging email body. Set IRONWORKS_EMAIL_TRANSPORT for real delivery.",
    );
  }
}

let activeService: EmailService = new ConsoleEmailService();

export function getEmailService(): EmailService {
  return activeService;
}

/** Test/runtime hook to swap the service. */
export function setEmailService(svc: EmailService): void {
  activeService = svc;
}

/** Reset to the console default. Intended for tests. */
export function resetEmailService(): void {
  activeService = new ConsoleEmailService();
}
