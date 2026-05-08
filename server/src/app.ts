import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBrotliCompress, createDeflate, createGzip } from "node:zlib";
import { authUsers, type Db } from "@ironworksai/db";
import type { DeploymentExposure, DeploymentMode } from "@ironworksai/shared";
import cors from "cors";
import { eq } from "drizzle-orm";
import express, { type Request as ExpressRequest, Router } from "express";
import type { BetterAuthSessionResult } from "./auth/better-auth.js";
import { buildCorsOptions } from "./lib/cors-config.js";
import { actorMiddleware } from "./middleware/auth.js";
import { boardMutationGuard } from "./middleware/board-mutation-guard.js";
import { cacheControl, etag } from "./middleware/cache.js";
import { errorHandler, httpLogger } from "./middleware/index.js";
import { privateHostnameGuard, resolvePrivateHostnameAllowSet } from "./middleware/private-hostname-guard.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { securityHeadersMiddleware } from "./middleware/security-headers.js";
import { enforcePlaybookRunLimit, enforceProjectLimit, enforceStorageLimit } from "./middleware/tier-limits.js";
import { httpRequestsMiddleware, metricsHandler } from "./observability/metrics.js";
import { accessRoutes } from "./routes/access.js";
import { activityRoutes } from "./routes/activity.js";
import { adapterCallRoutes } from "./routes/adapter-calls.js";
import { adminRoutes } from "./routes/admin.js";
import { agentMemoryRoutes } from "./routes/agent-memory.js";
import { agentRoutes } from "./routes/agents.js";
import { aiGenerateRoutes } from "./routes/ai-generate.js";
import { aiGoalBreakdownRoutes } from "./routes/ai-goal-breakdown.js";
import { announcementRoutes } from "./routes/announcements.js";
import { approvalRoutes } from "./routes/approvals.js";
import { assetRoutes } from "./routes/assets.js";
import { bugReportRoutes } from "./routes/bug-reports.js";
import { channelRoutes } from "./routes/channels.js";
import { companyRoutes } from "./routes/companies.js";
import { companySkillRoutes } from "./routes/company-skills.js";
import { costAnalyticsRoutes } from "./routes/cost-analytics.js";
import { costRoutes } from "./routes/costs.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { deliverableRoutes } from "./routes/deliverables.js";
import { executionWorkspaceRoutes } from "./routes/execution-workspaces.js";
import { executiveRoutes } from "./routes/executive.js";
import { expertiseMapRoutes } from "./routes/expertise-map.js";
import { goalCheckInRoutes } from "./routes/goal-check-ins.js";
import { goalStatsRoutes } from "./routes/goal-stats.js";
import { goalRoutes } from "./routes/goals.js";
import { healthRoutes } from "./routes/health.js";
import { hiringRoutes } from "./routes/hiring.js";
import { instanceSettingsRoutes } from "./routes/instance-settings.js";
import { issueRoutes } from "./routes/issues.js";
import { knowledgeRoutes } from "./routes/knowledge.js";
import { libraryRoutes } from "./routes/library.js";
import { llmRoutes } from "./routes/llms.js";
import { mcpServerRoutes } from "./routes/mcp-servers.js";
import { emailWebhookRoutes, messagingRoutes } from "./routes/messaging.js";
import { nolanIntegrationRoutes } from "./routes/nolan-integration.js";
import { oauthLoginRoutes } from "./routes/oauth-login.js";
import { playbookRoutes } from "./routes/playbooks.js";
import { playgroundRoutes } from "./routes/playground.js";
import { privacyRoutes, startRetentionScheduler } from "./routes/privacy.js";
import { startEmbeddingsScheduler } from "./services/embeddings/scheduler.js";
import { projectRoutes } from "./routes/projects.js";
import { providerRoutes } from "./routes/providers.js";
import { roleTemplateRoutes } from "./routes/role-templates.js";
import { routineRoutes } from "./routes/routines.js";
import { searchRoutes } from "./routes/search.js";
import { secretRoutes } from "./routes/secrets.js";
import { setupRoutes } from "./routes/setup.js";
import { sidebarBadgeRoutes } from "./routes/sidebar-badges.js";
import { skillRecipeRoutes } from "./routes/skill-recipes.js";
import { slimRoutes } from "./routes/slim.js";
import { sseRoutes } from "./routes/sse.js";
import { supportPublicRoutes } from "./routes/support.js";
import { teamTemplateRoutes } from "./routes/team-templates.js";
import type { StorageService } from "./storage/types.js";
import { applyUiBranding } from "./ui-branding.js";

type UiMode = "none" | "static" | "vite-dev";

export function resolveViteHmrPort(serverPort: number): number {
  if (serverPort <= 55_535) {
    return serverPort + 10_000;
  }
  return Math.max(1_024, serverPort - 10_000);
}

export async function createApp(
  db: Db,
  opts: {
    uiMode: UiMode;
    serverPort: number;
    storageService: StorageService;
    deploymentMode: DeploymentMode;
    deploymentExposure: DeploymentExposure;
    allowedHostnames: string[];
    bindHost: string;
    authReady: boolean;
    companyDeletionEnabled: boolean;
    instanceId?: string;
    hostVersion?: string;
    betterAuthHandler?: express.RequestHandler;
    resolveSession?: (req: ExpressRequest) => Promise<BetterAuthSessionResult | null>;
  },
) {
  const app = express();

  // ── CORS (explicit allowlist) ──
  // Placed first so OPTIONS preflights short-circuit before rate-limit / auth /
  // body-parse work. Allowlist comes from IRONWORKS_ALLOWED_ORIGINS (comma-
  // separated). When unset: dev allows all; production reflects origin and
  // emits a startup warning so unconfigured deploys aren't silently broken.
  const corsResult = buildCorsOptions({
    ALLOWED_ORIGINS: process.env.IRONWORKS_ALLOWED_ORIGINS,
    NODE_ENV: process.env.NODE_ENV,
  });
  if (corsResult.warning) {
    console.warn(corsResult.warning);
  }
  app.use(cors(corsResult.options));

  // ── Global Rate Limiting (SEC-ADV-013) ──
  // In-memory sliding window rate limiter. Implementation lives in
  // middleware/rate-limit.ts so it is unit-testable in isolation.
  app.use(rateLimitMiddleware());

  // ── Security Headers (no external dependency) ──
  // SEC-HDR-001: CSP carries an explicit script SHA-256 for the theme-detection
  // snippet in ui/index.html. See middleware/security-headers.ts for the full
  // policy + the recompute incantation if that snippet ever changes.
  app.disable("x-powered-by");
  app.use(securityHeadersMiddleware({ skipCsp: opts.uiMode === "vite-dev" }));

  // ── HTTP Compression ──
  // Use Node.js built-in zlib for gzip/deflate compression on API responses.
  app.use((req, res, next) => {
    const acceptEncoding = req.headers["accept-encoding"] ?? "";
    // Skip compression for Server-Sent Events and tiny responses
    const origEnd = res.end.bind(res);
    const _origWrite = res.write.bind(res);
    // Only compress JSON API responses (not static files — express.static handles those)
    if (req.path.startsWith("/api") && typeof acceptEncoding === "string") {
      const originalJson = res.json.bind(res);
      res.json = (body: unknown) => {
        const json = JSON.stringify(body);
        // Only compress if payload is reasonably large (> 1KB)
        if (json.length > 1024) {
          const encoding = acceptEncoding.includes("br")
            ? "br"
            : acceptEncoding.includes("gzip")
              ? "gzip"
              : acceptEncoding.includes("deflate")
                ? "deflate"
                : null;
          if (encoding) {
            const compressor =
              encoding === "br" ? createBrotliCompress() : encoding === "gzip" ? createGzip() : createDeflate();
            res.setHeader("Content-Encoding", encoding);
            res.removeHeader("Content-Length");
            if (!res.headersSent) {
              res.setHeader("Content-Type", "application/json");
            }
            const chunks: Buffer[] = [];
            compressor.on("data", (chunk: Buffer) => chunks.push(chunk));
            compressor.on("end", () => {
              const compressed = Buffer.concat(chunks);
              origEnd(compressed);
            });
            compressor.end(json);
            return res;
          }
        }
        return originalJson(body);
      };
    }
    next();
  });

  // ── ETag support for conditional GET requests ──
  app.use(etag());

  app.use(
    express.json({
      // Company import/export payloads can inline full portable packages.
      limit: "10mb",
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(httpLogger);
  // ── Prometheus metrics ──
  // /metrics endpoint mounted BEFORE /api so it isn't swallowed by the
  // catch-all 404 below. Default OFF: returns 404 unless
  // IRONWORKS_METRICS_BASIC_AUTH=user:password is set in the environment.
  app.use(httpRequestsMiddleware);
  app.get("/metrics", metricsHandler(db));
  const privateHostnameGateEnabled = opts.deploymentMode === "authenticated" && opts.deploymentExposure === "private";
  const privateHostnameAllowSet = resolvePrivateHostnameAllowSet({
    allowedHostnames: opts.allowedHostnames,
    bindHost: opts.bindHost,
  });
  app.use(
    privateHostnameGuard({
      enabled: privateHostnameGateEnabled,
      allowedHostnames: opts.allowedHostnames,
      bindHost: opts.bindHost,
    }),
  );
  app.use(
    actorMiddleware(db, {
      deploymentMode: opts.deploymentMode,
      resolveSession: opts.resolveSession,
      bindHost: opts.bindHost,
    }),
  );
  app.get("/api/auth/get-session", async (req, res) => {
    if (req.actor.type !== "board" || !req.actor.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    // Hydrate email + name from the user table so consumers (Profile page,
    // user pills, etc.) get a real session shape instead of nulls. The
    // actor middleware only carries userId; everything else lives on the
    // authUsers row.
    const userId = req.actor.userId;
    let email: string | null = null;
    let name: string | null = req.actor.source === "local_implicit" ? "Local Board" : null;
    let image: string | null = null;
    // local_implicit (the loopback board) is implicitly verified — there is
    // no inbox round-trip for the local user. session-backed actors get the
    // real value off the user row.
    let emailVerified: boolean = req.actor.source === "local_implicit";
    try {
      const rows = await db
        .select({
          email: authUsers.email,
          name: authUsers.name,
          image: authUsers.image,
          emailVerified: authUsers.emailVerified,
        })
        .from(authUsers)
        .where(eq(authUsers.id, userId))
        .limit(1);
      if (rows[0]) {
        email = rows[0].email ?? email;
        name = rows[0].name ?? name;
        image = rows[0].image ?? null;
        emailVerified = Boolean(rows[0].emailVerified);
      }
    } catch {
      // Swallow DB errors — fall back to nulls so the endpoint never 500s
      // a logged-in user. Worst case the UI shows a blank email field,
      // identical to the previous behavior.
    }
    res.json({
      session: {
        id: `ironworks:${req.actor.source}:${userId}`,
        userId,
      },
      user: { id: userId, email, name, image, emailVerified },
    });
  });
  if (opts.betterAuthHandler) {
    // ── Rate-limit verification-email resends ──
    // better-auth exposes POST /api/auth/send-verification-email with no
    // built-in rate-limit. An attacker (or a buggy client retry loop) could
    // otherwise hammer the endpoint and trigger an inbox flood — so we wrap
    // the path with a simple in-memory sliding-window limiter (3/hour per
    // email + IP combo). The friendlier alias /api/auth/resend-verification
    // points at the same handler so the UI has a stable name to call.
    const verifyResendLimit = new Map<string, { count: number; windowStart: number }>();
    const VERIFY_RESEND_MAX = 3;
    const VERIFY_RESEND_WINDOW_MS = 60 * 60 * 1000; // 1 hour
    const verifyResendLimiter: express.RequestHandler = (req, res, next) => {
      const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
      const bodyEmail =
        req.body && typeof req.body === "object" && typeof (req.body as { email?: unknown }).email === "string"
          ? ((req.body as { email: string }).email ?? "").trim().toLowerCase()
          : "";
      const key = `${ip}::${bodyEmail}`;
      const now = Date.now();
      const entry = verifyResendLimit.get(key);
      if (!entry || now - entry.windowStart > VERIFY_RESEND_WINDOW_MS) {
        verifyResendLimit.set(key, { count: 1, windowStart: now });
        next();
        return;
      }
      if (entry.count >= VERIFY_RESEND_MAX) {
        const retryAfterSec = Math.max(1, Math.ceil((entry.windowStart + VERIFY_RESEND_WINDOW_MS - now) / 1000));
        res
          .status(429)
          .set("Retry-After", String(retryAfterSec))
          .json({ error: "Too many verification email requests. Please wait and try again." });
        return;
      }
      entry.count++;
      next();
    };

    app.post("/api/auth/send-verification-email", verifyResendLimiter, opts.betterAuthHandler);
    // Friendly alias used by the UI banner — rewrite the path so the
    // better-auth handler picks up its canonical /send-verification-email
    // route.
    app.post(
      "/api/auth/resend-verification",
      verifyResendLimiter,
      (req, _res, next) => {
        req.url = "/api/auth/send-verification-email";
        next();
      },
      opts.betterAuthHandler,
    );

    app.all("/api/auth/*authPath", opts.betterAuthHandler);
  }
  app.use(llmRoutes(db));

  // Mount API routes
  const api = Router();
  api.use(boardMutationGuard());

  // ── Cache-Control headers per route pattern ──
  api.get("/health", cacheControl(30, "public"));
  api.get("/companies/:id/dashboard", cacheControl(30));
  api.get("/companies/:id/agents", cacheControl(60));
  api.get("/companies/:id/agents/slim", cacheControl(60));
  api.get("/companies/:id/projects", cacheControl(60));
  api.get("/companies/:id/goals", cacheControl(60));
  api.get("/companies/:id/issues", cacheControl(15));
  api.get("/companies/:id/activity", cacheControl(10));
  api.get("/companies/:id/costs/*path", cacheControl(60));
  api.get("/companies/:id/knowledge/*path", cacheControl(120));

  api.use(
    "/health",
    healthRoutes(db, {
      deploymentMode: opts.deploymentMode,
      deploymentExposure: opts.deploymentExposure,
      authReady: opts.authReady,
      companyDeletionEnabled: opts.companyDeletionEnabled,
    }),
  );
  // ── Tier enforcement middleware ──
  // SEC-ADV-001: Wire billing tier limits to mutation endpoints
  api.post("/companies/:companyId/projects", enforceProjectLimit(db));
  api.post("/companies/:companyId/playbooks/:playbookId/run", enforcePlaybookRunLimit(db));
  api.post("/companies/:companyId/assets", enforceStorageLimit(db));
  api.post("/companies/:companyId/assets/*path", enforceStorageLimit(db));

  api.use("/admin", adminRoutes(db));
  api.use("/companies", companyRoutes(db, opts.storageService));
  api.use(companySkillRoutes(db));
  api.use(agentRoutes(db));
  api.use(assetRoutes(db, opts.storageService));
  api.use(projectRoutes(db));
  api.use(issueRoutes(db, opts.storageService));
  api.use(routineRoutes(db));
  api.use(executionWorkspaceRoutes(db));
  api.use(goalRoutes(db));
  api.use(approvalRoutes(db));
  api.use(secretRoutes(db));
  api.use(providerRoutes(db));
  api.use(playgroundRoutes(db));
  api.use(adapterCallRoutes(db));
  api.use(costRoutes(db));
  api.use(costAnalyticsRoutes(db));
  api.use(executiveRoutes(db));
  api.use(activityRoutes(db));
  api.use(dashboardRoutes(db));
  api.use(sidebarBadgeRoutes(db));
  api.use(skillRecipeRoutes(db));
  api.use(instanceSettingsRoutes(db));
  api.use(libraryRoutes(db));
  api.use(playbookRoutes(db));
  api.use(knowledgeRoutes(db));
  api.use(hiringRoutes(db));
  api.use(agentMemoryRoutes(db));
  api.use(announcementRoutes(db));
  api.use(roleTemplateRoutes(db));
  api.use(teamTemplateRoutes(db));
  api.use(aiGenerateRoutes(db));
  api.use(privacyRoutes(db));
  api.use(goalStatsRoutes(db));
  api.use(goalCheckInRoutes(db));
  api.use(aiGoalBreakdownRoutes(db));
  api.use(mcpServerRoutes(db));
  api.use(messagingRoutes(db));
  api.use(searchRoutes());
  api.use(slimRoutes(db));
  api.use(channelRoutes(db));
  api.use(bugReportRoutes(db));
  api.use(deliverableRoutes(db));
  api.use(expertiseMapRoutes(db));
  api.use(nolanIntegrationRoutes(db));
  api.use(sseRoutes(db));
  api.use(oauthLoginRoutes());

  // Start daily data retention cleanup
  startRetentionScheduler(db);

  // Start the embeddings worker scheduler — drains embedding_jobs +
  // chunking_jobs queues. No-op if already started; tunable via
  // IRONWORKS_EMBEDDINGS_TICK_INTERVAL_MS.
  startEmbeddingsScheduler(db);

  api.use(
    accessRoutes(db, {
      deploymentMode: opts.deploymentMode,
      deploymentExposure: opts.deploymentExposure,
      bindHost: opts.bindHost,
      allowedHostnames: opts.allowedHostnames,
    }),
  );
  // Setup routes are public (no auth required — user isn't logged in yet)
  app.use("/api", setupRoutes(db));
  // Email webhook is public (called by Mailgun/SendGrid — no auth)
  app.use("/api", emailWebhookRoutes(db));
  // Support ticket submission is public (landing site contact form)
  app.use("/api", supportPublicRoutes(db));
  app.use("/api", api);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  if (opts.uiMode === "static") {
    // Try published location first (server/ui-dist/), then monorepo dev location (../../ui/dist)
    const candidates = [path.resolve(__dirname, "../ui-dist"), path.resolve(__dirname, "../../ui/dist")];
    const uiDist = candidates.find((p) => fs.existsSync(path.join(p, "index.html")));
    if (uiDist) {
      const indexHtml = applyUiBranding(fs.readFileSync(path.join(uiDist, "index.html"), "utf-8"));
      // Static assets — Vite hashes filenames so hashed files are immutable
      app.use(
        express.static(uiDist, {
          maxAge: "1y",
          immutable: true,
          setHeaders: (res, filePath) => {
            if (filePath.endsWith("index.html") || filePath.endsWith(".html")) {
              res.setHeader("Cache-Control", "no-cache");
            } else {
              res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
            }
          },
        }),
      );
      app.get(/.*/, (_req, res) => {
        res.status(200).set({ "Content-Type": "text/html", "Cache-Control": "no-cache" }).end(indexHtml);
      });
    } else {
      console.warn("[ironworks] UI dist not found; running in API-only mode");
    }
  }

  if (opts.uiMode === "vite-dev") {
    const uiRoot = path.resolve(__dirname, "../../ui");
    const hmrPort = resolveViteHmrPort(opts.serverPort);
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root: uiRoot,
      appType: "custom",
      server: {
        middlewareMode: true,
        hmr: {
          host: opts.bindHost,
          port: hmrPort,
          clientPort: hmrPort,
        },
        allowedHosts: privateHostnameGateEnabled ? Array.from(privateHostnameAllowSet) : undefined,
      },
    });

    app.use(vite.middlewares);
    app.get(/.*/, async (req, res, next) => {
      try {
        const templatePath = path.resolve(uiRoot, "index.html");
        const template = fs.readFileSync(templatePath, "utf-8");
        const html = applyUiBranding(await vite.transformIndexHtml(req.originalUrl, template));
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (err) {
        next(err);
      }
    });
  }

  app.use(errorHandler);

  return app;
}
