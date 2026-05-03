/**
 * Instance-scoped OAuth login flow for subscription-based LLM providers.
 *
 * Tokens land on the host filesystem and are shared across all companies
 * (e.g. ~/.claude/.credentials.json). There is no per-company or per-agent
 * credential here — one auth per provider per host.
 *
 * Two endpoints:
 *   POST /api/oauth-login/:provider/start  — spawn the CLI, return the auth URL
 *   GET  /api/oauth-login/:provider/check  — poll for completion
 *   DELETE /api/oauth-login/:provider/sessions/:id — cancel in-flight session
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Router } from "express";
import { badRequest, notFound } from "../errors.js";
import { assertInstanceAdmin } from "./authz.js";

// ── Provider config ───────────────────────────────────────────────────────────

type Provider = "anthropic" | "openai" | "google";

interface ProviderConfig {
  /** CLI binary to invoke */
  command: string;
  /** Arguments passed to the binary (the full argv after the binary name) */
  args: string[];
  /**
   * Absolute path to the token file that exists once auth completes.
   * Tilde is expanded at runtime.
   */
  tokenFile: string;
  /** Regex that matches the OAuth redirect URL in CLI stdout/stderr */
  urlPattern: RegExp;
}

const PROVIDER_CONFIGS: Record<Provider, ProviderConfig> = {
  anthropic: {
    command: "claude",
    args: ["login"],
    // claude CLI writes credentials here after the OAuth round-trip
    tokenFile: "~/.claude/.credentials.json",
    // Claude prints a URL containing "anthropic" or "claude" in the domain
    urlPattern: /(https?:\/\/[^\s'"`<>()[\]{};,!?]*(?:anthropic|claude\.ai|auth)[^\s'"`<>()[\]{};,!?]*)/i,
  },
  openai: {
    command: "codex",
    args: ["login"],
    // codex CLI stores auth here
    tokenFile: "~/.codex/auth.json",
    // codex prints a chat.openai.com OAuth URL
    urlPattern: /(https?:\/\/[^\s'"`<>()[\]{};,!?]*(?:openai\.com|auth0\.com)[^\s'"`<>()[\]{};,!?]*)/i,
  },
  google: {
    command: "gemini",
    args: [],
    // gemini CLI stores OAuth creds here
    tokenFile: "~/.gemini/oauth_creds.json",
    // Google OAuth URLs always come from accounts.google.com
    urlPattern: /(https?:\/\/accounts\.google\.com\/[^\s'"`<>()[\]{};,!?]*)/i,
  },
};

// ── Session registry ──────────────────────────────────────────────────────────

interface OAuthSession {
  provider: Provider;
  startedAt: number;
  /** The spawned CLI process */
  proc: ReturnType<typeof spawn>;
  /** Accumulated stdout + stderr text, used for URL extraction */
  output: string;
  /** Resolved as soon as a URL is found in output */
  urlResolve: ((url: string) => void) | null;
  urlPromise: Promise<string>;
  /** Set when the process exits */
  exitCode: number | null;
}

/** In-memory session store. Instance-scoped; survives restarts would require persistence. */
const sessions = new Map<string, OAuthSession>();

// SEC-OAUTH-001: best-effort cleanup of spawned CLIs on graceful shutdown.
// If the server crashes hard the children become orphaned, but for a SIGTERM
// rollout we kill the still-pending OAuth subprocesses so they don't linger
// holding open stdin/stdout/stderr fds. Idempotent — registering the handler
// twice is harmless because the child .kill() is no-op once exited.
let shutdownHookInstalled = false;
function installShutdownHook(): void {
  if (shutdownHookInstalled) return;
  shutdownHookInstalled = true;
  const cleanupAll = () => {
    for (const [, session] of sessions) {
      try {
        session.proc.kill("SIGTERM");
      } catch {
        // child already exited
      }
    }
    sessions.clear();
  };
  process.once("SIGTERM", cleanupAll);
  process.once("SIGINT", cleanupAll);
  process.once("beforeExit", cleanupAll);
}

const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

function expandTilde(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function isTokenPresent(provider: Provider): boolean {
  const cfg = PROVIDER_CONFIGS[provider];
  return existsSync(expandTilde(cfg.tokenFile));
}

function sessionStatus(session: OAuthSession): "pending" | "complete" | "failed" | "timeout" {
  const age = Date.now() - session.startedAt;
  if (age > SESSION_TTL_MS) return "timeout";
  if (session.exitCode === 0) return "complete";
  if (session.exitCode !== null && session.exitCode !== 0) return "failed";
  // Even before exit, if the token file already exists the user authenticated
  if (isTokenPresent(session.provider)) return "complete";
  return "pending";
}

/** Kill and remove a session, ignoring errors if the process is already gone. */
function cleanupSession(id: string): void {
  const session = sessions.get(id);
  if (!session) return;
  try {
    session.proc.kill("SIGTERM");
  } catch {
    // process already exited — nothing to do
  }
  sessions.delete(id);
}

/** Sweep sessions older than TTL to prevent unbounded memory growth. */
function sweepExpiredSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.startedAt > SESSION_TTL_MS) {
      cleanupSession(id);
    }
  }
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function oauthLoginRoutes() {
  const router = Router();
  installShutdownHook();

  // POST /api/oauth-login/:provider/start
  router.post("/oauth-login/:provider/start", async (req, res) => {
    // SEC: instance-admin only — OAuth tokens land on the host fs, shared across all companies
    assertInstanceAdmin(req);
    sweepExpiredSessions();

    const provider = req.params.provider as Provider;
    if (!PROVIDER_CONFIGS[provider]) {
      throw badRequest(`Unknown provider: ${provider}. Must be anthropic, openai, or google.`);
    }

    const cfg = PROVIDER_CONFIGS[provider];
    const sessionId = randomUUID();

    // Resolve the URL promise externally so we can settle it from the data handler
    let urlResolve!: (url: string) => void;
    let urlReject!: (err: Error) => void;
    const urlPromise = new Promise<string>((resolve, reject) => {
      urlResolve = resolve;
      urlReject = reject;
    });

    // Spawn the CLI. We do NOT await completion — the user must click the URL first.
    // stdin is inherited as 'ignore' so the process doesn't block waiting for input
    // (some CLIs check isatty and adapt accordingly).
    const proc = spawn(cfg.command, cfg.args, {
      env: {
        ...process.env,
        // Strip Claude Code nesting-guard vars so the subprocess starts cleanly
        CLAUDECODE: undefined,
        CLAUDE_CODE_ENTRYPOINT: undefined,
        CLAUDE_CODE_SESSION: undefined,
        CLAUDE_CODE_PARENT_SESSION: undefined,
      },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    const session: OAuthSession = {
      provider,
      startedAt: Date.now(),
      proc,
      output: "",
      urlResolve,
      urlPromise,
      exitCode: null,
    };
    sessions.set(sessionId, session);

    // Accumulate output and resolve the URL promise as soon as we see a URL
    const onData = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      session.output += text;
      if (session.urlResolve) {
        const match = text.match(cfg.urlPattern) ?? session.output.match(cfg.urlPattern);
        if (match?.[1]) {
          session.urlResolve(match[1]);
          session.urlResolve = null; // prevent double-resolution
        }
      }
    };

    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);

    proc.on("exit", (code) => {
      session.exitCode = code ?? 1;
      // If the process exits before a URL was seen, reject so we don't hang
      if (session.urlResolve) {
        urlReject(new Error(`CLI exited with code ${session.exitCode} before printing an auth URL`));
        session.urlResolve = null;
      }
    });

    // Wait up to 30 s for the URL to appear — far less than the 5-min session TTL
    const URL_WAIT_MS = 30_000;
    let loginUrl: string;
    try {
      loginUrl = await Promise.race([
        urlPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timed out waiting for auth URL from CLI")), URL_WAIT_MS),
        ),
      ]);
    } catch (err) {
      cleanupSession(sessionId);
      const message = err instanceof Error ? err.message : "Failed to start login";
      res.status(502).json({ error: message });
      return;
    }

    res.json({ sessionId, loginUrl });
  });

  // GET /api/oauth-login/:provider/check?sessionId=X
  router.get("/oauth-login/:provider/check", (req, res) => {
    // SEC: instance-admin only — OAuth tokens land on the host fs, shared across all companies
    assertInstanceAdmin(req);

    const provider = req.params.provider as Provider;
    if (!PROVIDER_CONFIGS[provider]) {
      throw badRequest(`Unknown provider: ${provider}`);
    }

    const { sessionId } = req.query as { sessionId?: string };
    if (!sessionId) {
      throw badRequest("sessionId query parameter is required");
    }

    const session = sessions.get(sessionId);
    if (!session) {
      // Session may have been swept or never existed; treat as timeout
      res.json({ status: "timeout" });
      return;
    }

    if (session.provider !== provider) {
      throw badRequest("sessionId does not match the requested provider");
    }

    const status = sessionStatus(session);

    // Clean up terminal states so memory doesn't accumulate
    if (status === "complete" || status === "failed" || status === "timeout") {
      cleanupSession(sessionId);
    }

    if (status === "failed") {
      const exitCode = session.exitCode;
      res.json({ status, error: `CLI exited with code ${exitCode}` });
      return;
    }

    res.json({ status });
  });

  // DELETE /api/oauth-login/:provider/sessions/:id — cancel an in-flight session
  router.delete("/oauth-login/:provider/sessions/:id", (req, res) => {
    // SEC: instance-admin only — OAuth tokens land on the host fs, shared across all companies
    assertInstanceAdmin(req);

    const { id } = req.params;
    if (!sessions.has(id)) {
      throw notFound("Session not found");
    }

    cleanupSession(id);
    res.status(204).end();
  });

  return router;
}

// Exported for test access only — do not call in production code
export { cleanupSession as _cleanupSessionForTest, sessions as _sessionsForTest };
