import type { IncomingHttpHeaders } from "node:http";
import type { Db } from "@ironworksai/db";
import { authAccounts, authSessions, authUsers, authVerifications } from "@ironworksai/db";
import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { toNodeHandler } from "better-auth/node";
import type { Request, RequestHandler } from "express";
import type { Config } from "../config.js";
import { logger } from "../middleware/logger.js";
import { getEmailService } from "../services/email.js";

export type BetterAuthSessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  emailVerified?: boolean;
};

export type BetterAuthSessionResult = {
  session: { id: string; userId: string } | null;
  user: BetterAuthSessionUser | null;
};

type BetterAuthInstance = ReturnType<typeof betterAuth>;

function headersFromNodeHeaders(rawHeaders: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [key, raw] of Object.entries(rawHeaders)) {
    if (!raw) continue;
    if (Array.isArray(raw)) {
      for (const value of raw) headers.append(key, value);
      continue;
    }
    headers.set(key, raw);
  }
  return headers;
}

function headersFromExpressRequest(req: Request): Headers {
  return headersFromNodeHeaders(req.headers);
}

export function deriveAuthTrustedOrigins(config: Config): string[] {
  const baseUrl = config.authBaseUrlMode === "explicit" ? config.authPublicBaseUrl : undefined;
  const trustedOrigins = new Set<string>();

  if (baseUrl) {
    try {
      trustedOrigins.add(new URL(baseUrl).origin);
    } catch {
      // Better Auth will surface invalid base URL separately.
    }
  }
  if (config.deploymentMode === "authenticated") {
    for (const hostname of config.allowedHostnames) {
      const trimmed = hostname.trim().toLowerCase();
      if (!trimmed) continue;
      trustedOrigins.add(`https://${trimmed}`);
      trustedOrigins.add(`http://${trimmed}`);
    }
  }

  return Array.from(trustedOrigins);
}

export function createBetterAuthInstance(db: Db, config: Config, trustedOrigins?: string[]): BetterAuthInstance {
  const baseUrl = config.authBaseUrlMode === "explicit" ? config.authPublicBaseUrl : undefined;
  const secret =
    process.env.BETTER_AUTH_SECRET ??
    process.env.IRONWORKS_AGENT_JWT_SECRET ??
    (process.env.NODE_ENV !== "development"
      ? (() => {
          throw new Error("BETTER_AUTH_SECRET environment variable is required");
        })()
      : "ironworks-dev-secret");
  const effectiveTrustedOrigins = trustedOrigins ?? deriveAuthTrustedOrigins(config);

  const publicUrl = process.env.IRONWORKS_PUBLIC_URL ?? baseUrl;
  const isHttpOnly = publicUrl ? publicUrl.startsWith("http://") : false;

  // Annotated as BetterAuthOptions so TypeScript does not infer a too-narrow
  // literal type for the `advanced.useSecureCookies` spread, which would fail
  // to satisfy the widened `boolean | undefined` type introduced in 1.6.
  const authConfig: BetterAuthOptions = {
    baseURL: baseUrl,
    secret,
    trustedOrigins: effectiveTrustedOrigins,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: authUsers,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      disableSignUp: config.authDisableSignUp,
    },
    // Email verification — enabled for password+email signups so a bad actor
    // cannot create an account with someone else's email and immediately
    // start spinning up companies under that identity. OAuth providers (when
    // wired in) verify the email server-side; their tokens are trusted and
    // bypass this gate.
    //
    // The verification mail is sent through the EmailService abstraction
    // (server/src/services/email.ts). When no transport is configured the
    // default console transport logs the verification URL so dev/local does
    // not block.
    emailVerification: {
      sendOnSignUp: true,
      // 24h gives the user a comfortable window to complete the flow even
      // across timezone differences without keeping tokens valid forever.
      expiresIn: 60 * 60 * 24,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        try {
          await getEmailService().sendEmail({
            to: user.email,
            subject: "Verify your Ironworks email",
            tag: "verify-email",
            text: `Hello ${user.name ?? ""},

Please verify your email to finish setting up your Ironworks account by visiting the link below:

${url}

If you did not request this, you can safely ignore the message.

— Ironworks`,
          });
        } catch (err) {
          // Never throw out of the signup path because the mail failed to
          // ship. The user can resend via /api/auth/resend-verification.
          logger.error({ err, to: user.email }, "Failed to send verification email");
        }
      },
    },
    ...(isHttpOnly ? { advanced: { useSecureCookies: false } } : {}),
  };

  if (!baseUrl) {
    delete authConfig.baseURL;
  }

  return betterAuth(authConfig);
}

export function createBetterAuthHandler(auth: BetterAuthInstance): RequestHandler {
  const handler = toNodeHandler(auth);
  return (req, res, next) => {
    void Promise.resolve(handler(req, res)).catch(next);
  };
}

export async function resolveBetterAuthSessionFromHeaders(
  auth: BetterAuthInstance,
  headers: Headers,
): Promise<BetterAuthSessionResult | null> {
  const api = (auth as unknown as { api?: { getSession?: (input: unknown) => Promise<unknown> } }).api;
  if (!api?.getSession) return null;

  const sessionValue = await api.getSession({
    headers,
  });
  if (!sessionValue || typeof sessionValue !== "object") return null;

  const value = sessionValue as {
    session?: { id?: string; userId?: string } | null;
    user?: { id?: string; email?: string | null; name?: string | null; emailVerified?: boolean } | null;
  };
  const session =
    value.session?.id && value.session.userId ? { id: value.session.id, userId: value.session.userId } : null;
  const user = value.user?.id
    ? {
        id: value.user.id,
        email: value.user.email ?? null,
        name: value.user.name ?? null,
        emailVerified: typeof value.user.emailVerified === "boolean" ? value.user.emailVerified : undefined,
      }
    : null;

  if (!session || !user) return null;
  return { session, user };
}

export async function resolveBetterAuthSession(
  auth: BetterAuthInstance,
  req: Request,
): Promise<BetterAuthSessionResult | null> {
  return resolveBetterAuthSessionFromHeaders(auth, headersFromExpressRequest(req));
}
