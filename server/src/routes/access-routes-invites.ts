import { randomBytes } from "node:crypto";
import { agentApiKeys, authUsers, invites, joinRequests } from "@ironworksai/db";
import {
  acceptInviteSchema,
  acceptUserInviteSchema,
  claimJoinRequestApiKeySchema,
  createCompanyInviteSchema,
  createOpenClawInvitePromptSchema,
  createUserInviteSchema,
  listJoinRequestsQuerySchema,
} from "@ironworksai/shared";
import { and, desc, eq, isNull } from "drizzle-orm";
import { type Request, Router } from "express";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "../errors.js";
import { logger } from "../middleware/logger.js";
import { validate } from "../middleware/validate.js";
import { deduplicateAgentName, logActivity, notifyHireApproved } from "../services/index.js";
import {
  type AccessRouteContext,
  agentJoinGrantsFromDefaults,
  buildInviteOnboardingManifest,
  buildInviteOnboardingTextDocument,
  buildJoinDefaultsPayloadForAccept,
  canReplayOpenClawGatewayInviteAccept,
  companyInviteExpiresAt,
  createClaimSecret,
  createInviteToken,
  grantsFromDefaults,
  hashToken,
  INVITE_TOKEN_MAX_RETRIES,
  inviteExpired,
  isInviteTokenHashCollisionError,
  isLocalImplicit,
  isPlainObject,
  type JoinDiagnostic,
  mergeInviteDefaults,
  mergeJoinDefaultsPayloadForReplay,
  normalizeAgentDefaultsForJoin,
  probeInviteResolutionTarget,
  requestBaseUrl,
  requestIp,
  resolveActorEmail,
  resolveJoinRequestAgentManagerId,
  summarizeOpenClawGatewayDefaultsForLog,
  toInviteSummaryResponse,
  toJoinRequestResponse,
  tokenHashesMatch,
} from "./access-route-helpers.js";
import { assertCompanyAccess } from "./authz.js";

export function accessInvitesRoutes(ctx: AccessRouteContext): Router {
  const router = Router();
  const { db, opts, access, agents, userInvites, budgets, assertInstanceAdmin, assertCompanyPermission } = ctx;

  async function assertCanGenerateOpenClawInvitePrompt(req: Request, companyId: string) {
    assertCompanyAccess(req, companyId);
    if (req.actor.type === "agent") {
      if (!req.actor.agentId) throw forbidden("Agent authentication required");
      const actorAgent = await agents.getById(req.actor.agentId);
      if (!actorAgent || actorAgent.companyId !== companyId) {
        throw forbidden("Agent key cannot access another company");
      }
      if (actorAgent.role !== "ceo") {
        throw forbidden("Only CEO agents can generate OpenClaw invite prompts");
      }
      return;
    }
    if (req.actor.type !== "board") throw unauthorized();
    if (isLocalImplicit(req)) return;
    const allowed = await access.canUser(companyId, req.actor.userId, "users:invite");
    if (!allowed) throw forbidden("Permission denied");
  }

  async function createCompanyInviteForCompany(input: {
    req: Request;
    companyId: string;
    allowedJoinTypes: "human" | "agent" | "both";
    defaultsPayload?: Record<string, unknown> | null;
    agentMessage?: string | null;
  }) {
    const normalizedAgentMessage = typeof input.agentMessage === "string" ? input.agentMessage.trim() || null : null;
    const insertValues = {
      companyId: input.companyId,
      inviteType: "company_join" as const,
      allowedJoinTypes: input.allowedJoinTypes,
      defaultsPayload: mergeInviteDefaults(input.defaultsPayload ?? null, normalizedAgentMessage),
      expiresAt: companyInviteExpiresAt(),
      invitedByUserId: input.req.actor.userId ?? null,
    };

    let token: string | null = null;
    let created: typeof invites.$inferSelect | null = null;
    for (let attempt = 0; attempt < INVITE_TOKEN_MAX_RETRIES; attempt += 1) {
      const candidateToken = createInviteToken();
      try {
        const row = await db
          .insert(invites)
          .values({
            ...insertValues,
            tokenHash: hashToken(candidateToken),
          })
          .returning()
          .then((rows) => rows[0]);
        token = candidateToken;
        created = row;
        break;
      } catch (error) {
        if (!isInviteTokenHashCollisionError(error)) {
          throw error;
        }
      }
    }
    if (!token || !created) {
      throw conflict("Failed to generate a unique invite token. Please retry.");
    }

    return { token, created, normalizedAgentMessage };
  }

  router.post("/companies/:companyId/invites", validate(createCompanyInviteSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyPermission(req, companyId, "users:invite");
    const { token, created, normalizedAgentMessage } = await createCompanyInviteForCompany({
      req,
      companyId,
      allowedJoinTypes: req.body.allowedJoinTypes,
      defaultsPayload: req.body.defaultsPayload ?? null,
      agentMessage: req.body.agentMessage ?? null,
    });

    await logActivity(db, {
      companyId,
      actorType: req.actor.type === "agent" ? "agent" : "user",
      actorId: req.actor.type === "agent" ? (req.actor.agentId ?? "unknown-agent") : (req.actor.userId ?? "board"),
      action: "invite.created",
      entityType: "invite",
      entityId: created.id,
      details: {
        inviteType: created.inviteType,
        allowedJoinTypes: created.allowedJoinTypes,
        expiresAt: created.expiresAt.toISOString(),
        hasAgentMessage: Boolean(normalizedAgentMessage),
      },
    });

    const inviteSummary = toInviteSummaryResponse(req, token, created);
    res.status(201).json({
      ...created,
      token,
      inviteUrl: `/invite/${token}`,
      onboardingTextPath: inviteSummary.onboardingTextPath,
      onboardingTextUrl: inviteSummary.onboardingTextUrl,
      inviteMessage: inviteSummary.inviteMessage,
    });
  });

  router.post(
    "/companies/:companyId/openclaw/invite-prompt",
    validate(createOpenClawInvitePromptSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      await assertCanGenerateOpenClawInvitePrompt(req, companyId);
      const { token, created, normalizedAgentMessage } = await createCompanyInviteForCompany({
        req,
        companyId,
        allowedJoinTypes: "agent",
        defaultsPayload: null,
        agentMessage: req.body.agentMessage ?? null,
      });

      await logActivity(db, {
        companyId,
        actorType: req.actor.type === "agent" ? "agent" : "user",
        actorId: req.actor.type === "agent" ? (req.actor.agentId ?? "unknown-agent") : (req.actor.userId ?? "board"),
        action: "invite.openclaw_prompt_created",
        entityType: "invite",
        entityId: created.id,
        details: {
          inviteType: created.inviteType,
          allowedJoinTypes: created.allowedJoinTypes,
          expiresAt: created.expiresAt.toISOString(),
          hasAgentMessage: Boolean(normalizedAgentMessage),
        },
      });

      const inviteSummary = toInviteSummaryResponse(req, token, created);
      res.status(201).json({
        ...created,
        token,
        inviteUrl: `/invite/${token}`,
        onboardingTextPath: inviteSummary.onboardingTextPath,
        onboardingTextUrl: inviteSummary.onboardingTextUrl,
        inviteMessage: inviteSummary.inviteMessage,
      });
    },
  );

  router.get("/invites/:token", async (req, res) => {
    const token = (req.params.token as string).trim();
    if (!token) throw notFound("Invite not found");
    const invite = await db
      .select()
      .from(invites)
      .where(eq(invites.tokenHash, hashToken(token)))
      .then((rows) => rows[0] ?? null);
    if (!invite || invite.revokedAt || invite.acceptedAt || inviteExpired(invite)) {
      throw notFound("Invite not found");
    }

    res.json(toInviteSummaryResponse(req, token, invite));
  });

  router.get("/invites/:token/onboarding", async (req, res) => {
    const token = (req.params.token as string).trim();
    if (!token) throw notFound("Invite not found");
    const invite = await db
      .select()
      .from(invites)
      .where(eq(invites.tokenHash, hashToken(token)))
      .then((rows) => rows[0] ?? null);
    if (!invite || invite.revokedAt || inviteExpired(invite)) {
      throw notFound("Invite not found");
    }

    res.json(buildInviteOnboardingManifest(req, token, invite, opts));
  });

  router.get("/invites/:token/onboarding.txt", async (req, res) => {
    const token = (req.params.token as string).trim();
    if (!token) throw notFound("Invite not found");
    const invite = await db
      .select()
      .from(invites)
      .where(eq(invites.tokenHash, hashToken(token)))
      .then((rows) => rows[0] ?? null);
    if (!invite || invite.revokedAt || inviteExpired(invite)) {
      throw notFound("Invite not found");
    }

    res.type("text/plain; charset=utf-8").send(buildInviteOnboardingTextDocument(req, token, invite, opts));
  });

  router.get("/invites/:token/test-resolution", async (req, res) => {
    const token = (req.params.token as string).trim();
    if (!token) throw notFound("Invite not found");
    const invite = await db
      .select()
      .from(invites)
      .where(eq(invites.tokenHash, hashToken(token)))
      .then((rows) => rows[0] ?? null);
    if (!invite || invite.revokedAt || inviteExpired(invite)) {
      throw notFound("Invite not found");
    }

    const rawUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
    if (!rawUrl) throw badRequest("url query parameter is required");
    let target: URL;
    try {
      target = new URL(rawUrl);
    } catch {
      throw badRequest("url must be an absolute http(s) URL");
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw badRequest("url must use http or https");
    }
    // SEC-INJ-002: Block SSRF — reject private/reserved IPs
    const hostname = target.hostname;
    if (
      /^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|0\.|169\.254\.|localhost|::1|\[::1\]|\[?fe80:|\[?fd[0-9a-f]{2}:)/.test(
        hostname,
      )
    ) {
      throw badRequest("URL resolves to a private or reserved address");
    }

    const parsedTimeoutMs = typeof req.query.timeoutMs === "string" ? Number(req.query.timeoutMs) : NaN;
    const timeoutMs = Number.isFinite(parsedTimeoutMs)
      ? Math.max(1000, Math.min(15000, Math.floor(parsedTimeoutMs)))
      : 5000;
    const probe = await probeInviteResolutionTarget(target, timeoutMs);
    res.json({
      inviteId: invite.id,
      testResolutionPath: `/api/invites/${token}/test-resolution`,
      requestedUrl: target.toString(),
      timeoutMs,
      ...probe,
    });
  });

  router.post("/invites/:token/accept", validate(acceptInviteSchema), async (req, res) => {
    const token = (req.params.token as string).trim();
    if (!token) throw notFound("Invite not found");

    const invite = await db
      .select()
      .from(invites)
      .where(eq(invites.tokenHash, hashToken(token)))
      .then((rows) => rows[0] ?? null);
    if (!invite || invite.revokedAt || inviteExpired(invite)) {
      throw notFound("Invite not found");
    }
    const inviteAlreadyAccepted = Boolean(invite.acceptedAt);
    const existingJoinRequestForInvite = inviteAlreadyAccepted
      ? await db
          .select()
          .from(joinRequests)
          .where(eq(joinRequests.inviteId, invite.id))
          .then((rows) => rows[0] ?? null)
      : null;

    if (invite.inviteType === "bootstrap_ceo") {
      if (inviteAlreadyAccepted) throw notFound("Invite not found");
      if (req.body.requestType !== "human") {
        throw badRequest("Bootstrap invite requires human request type");
      }
      if (req.actor.type !== "board" || (!req.actor.userId && !isLocalImplicit(req))) {
        throw unauthorized("Authenticated user required for bootstrap acceptance");
      }
      const userId = req.actor.userId ?? "local-board";
      const existingAdmin = await access.isInstanceAdmin(userId);
      if (!existingAdmin) {
        await access.promoteInstanceAdmin(userId);
      }
      const updatedInvite = await db
        .update(invites)
        .set({ acceptedAt: new Date(), updatedAt: new Date() })
        .where(eq(invites.id, invite.id))
        .returning()
        .then((rows) => rows[0] ?? invite);
      res.status(202).json({
        inviteId: updatedInvite.id,
        inviteType: updatedInvite.inviteType,
        bootstrapAccepted: true,
        userId,
      });
      return;
    }

    const requestType = req.body.requestType as "human" | "agent";
    const companyId = invite.companyId;
    if (!companyId) throw conflict("Invite is missing company scope");
    if (invite.allowedJoinTypes !== "both" && invite.allowedJoinTypes !== requestType) {
      throw badRequest(`Invite does not allow ${requestType} joins`);
    }

    if (requestType === "human" && req.actor.type !== "board") {
      throw unauthorized("Human invite acceptance requires authenticated user");
    }
    if (requestType === "human" && !req.actor.userId && !isLocalImplicit(req)) {
      throw unauthorized("Authenticated user is required");
    }
    if (requestType === "agent" && !req.body.agentName) {
      if (!inviteAlreadyAccepted || !existingJoinRequestForInvite?.agentName) {
        throw badRequest("agentName is required for agent join requests");
      }
    }

    const adapterType = req.body.adapterType ?? null;
    if (
      inviteAlreadyAccepted &&
      !canReplayOpenClawGatewayInviteAccept({
        requestType,
        adapterType,
        existingJoinRequest: existingJoinRequestForInvite,
      })
    ) {
      throw notFound("Invite not found");
    }
    const replayJoinRequestId = inviteAlreadyAccepted ? (existingJoinRequestForInvite?.id ?? null) : null;
    if (inviteAlreadyAccepted && !replayJoinRequestId) {
      throw conflict("Join request not found");
    }

    const replayMergedDefaults = inviteAlreadyAccepted
      ? mergeJoinDefaultsPayloadForReplay(
          existingJoinRequestForInvite?.agentDefaultsPayload ?? null,
          req.body.agentDefaultsPayload ?? null,
        )
      : (req.body.agentDefaultsPayload ?? null);

    const gatewayDefaultsPayload =
      requestType === "agent"
        ? buildJoinDefaultsPayloadForAccept({
            adapterType,
            defaultsPayload: replayMergedDefaults,
            ironworksApiUrl: req.body.ironworksApiUrl ?? null,
            inboundOpenClawAuthHeader: req.header("x-openclaw-auth") ?? null,
            inboundOpenClawTokenHeader: req.header("x-openclaw-token") ?? null,
          })
        : null;

    const joinDefaults =
      requestType === "agent"
        ? normalizeAgentDefaultsForJoin({
            adapterType,
            defaultsPayload: gatewayDefaultsPayload,
            deploymentMode: opts.deploymentMode,
            deploymentExposure: opts.deploymentExposure,
            bindHost: opts.bindHost,
            allowedHostnames: opts.allowedHostnames,
          })
        : {
            normalized: null as Record<string, unknown> | null,
            diagnostics: [] as JoinDiagnostic[],
            fatalErrors: [] as string[],
          };

    if (requestType === "agent" && joinDefaults.fatalErrors.length > 0) {
      throw badRequest(joinDefaults.fatalErrors.join("; "));
    }

    if (requestType === "agent" && adapterType === "openclaw_gateway") {
      logger.info(
        {
          inviteId: invite.id,
          joinRequestDiagnostics: joinDefaults.diagnostics.map((diag) => ({
            code: diag.code,
            level: diag.level,
          })),
          normalizedAgentDefaults: summarizeOpenClawGatewayDefaultsForLog(joinDefaults.normalized),
        },
        "invite accept normalized OpenClaw gateway defaults",
      );
    }

    const claimSecret = requestType === "agent" && !inviteAlreadyAccepted ? createClaimSecret() : null;
    const claimSecretHash = claimSecret ? hashToken(claimSecret) : null;
    const claimSecretExpiresAt = claimSecret ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null;

    const actorEmail = requestType === "human" ? await resolveActorEmail(db, req) : null;
    const created = !inviteAlreadyAccepted
      ? await db.transaction(async (tx) => {
          await tx
            .update(invites)
            .set({ acceptedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(invites.id, invite.id), isNull(invites.acceptedAt), isNull(invites.revokedAt)));

          const row = await tx
            .insert(joinRequests)
            .values({
              inviteId: invite.id,
              companyId,
              requestType,
              status: "pending_approval",
              requestIp: requestIp(req),
              requestingUserId: requestType === "human" ? (req.actor.userId ?? "local-board") : null,
              requestEmailSnapshot: requestType === "human" ? actorEmail : null,
              agentName: requestType === "agent" ? req.body.agentName : null,
              adapterType: requestType === "agent" ? adapterType : null,
              capabilities: requestType === "agent" ? (req.body.capabilities ?? null) : null,
              agentDefaultsPayload: requestType === "agent" ? joinDefaults.normalized : null,
              claimSecretHash,
              claimSecretExpiresAt,
            })
            .returning()
            .then((rows) => rows[0]);
          return row;
        })
      : await db
          .update(joinRequests)
          .set({
            requestIp: requestIp(req),
            agentName:
              requestType === "agent" ? (req.body.agentName ?? existingJoinRequestForInvite?.agentName ?? null) : null,
            capabilities:
              requestType === "agent"
                ? (req.body.capabilities ?? existingJoinRequestForInvite?.capabilities ?? null)
                : null,
            adapterType: requestType === "agent" ? adapterType : null,
            agentDefaultsPayload: requestType === "agent" ? joinDefaults.normalized : null,
            updatedAt: new Date(),
          })
          .where(eq(joinRequests.id, replayJoinRequestId as string))
          .returning()
          .then((rows) => rows[0]);

    if (!created) {
      throw conflict("Join request not found");
    }

    if (
      inviteAlreadyAccepted &&
      requestType === "agent" &&
      adapterType === "openclaw_gateway" &&
      created.status === "approved" &&
      created.createdAgentId
    ) {
      const existingAgent = await agents.getById(created.createdAgentId);
      if (!existingAgent) {
        throw conflict("Approved join request agent not found");
      }
      const existingAdapterConfig = isPlainObject(existingAgent.adapterConfig)
        ? (existingAgent.adapterConfig as Record<string, unknown>)
        : {};
      const nextAdapterConfig = {
        ...existingAdapterConfig,
        ...(joinDefaults.normalized ?? {}),
      };
      const updatedAgent = await agents.update(created.createdAgentId, {
        adapterType,
        adapterConfig: nextAdapterConfig,
      });
      if (!updatedAgent) {
        throw conflict("Approved join request agent not found");
      }
      await logActivity(db, {
        companyId,
        actorType: req.actor.type === "agent" ? "agent" : "user",
        actorId: req.actor.type === "agent" ? (req.actor.agentId ?? "invite-agent") : (req.actor.userId ?? "board"),
        action: "agent.updated_from_join_replay",
        entityType: "agent",
        entityId: updatedAgent.id,
        details: { inviteId: invite.id, joinRequestId: created.id },
      });
    }

    if (requestType === "agent" && adapterType === "openclaw_gateway") {
      const expectedDefaults = summarizeOpenClawGatewayDefaultsForLog(joinDefaults.normalized);
      const persistedDefaults = summarizeOpenClawGatewayDefaultsForLog(created.agentDefaultsPayload);
      const missingPersistedFields: string[] = [];

      if (expectedDefaults.url && !persistedDefaults.url) missingPersistedFields.push("url");
      if (expectedDefaults.ironworksApiUrl && !persistedDefaults.ironworksApiUrl) {
        missingPersistedFields.push("ironworksApiUrl");
      }
      if (expectedDefaults.gatewayToken && !persistedDefaults.gatewayToken) {
        missingPersistedFields.push("headers.x-openclaw-token");
      }
      if (expectedDefaults.devicePrivateKeyPem && !persistedDefaults.devicePrivateKeyPem) {
        missingPersistedFields.push("devicePrivateKeyPem");
      }
      if (expectedDefaults.headerKeys.length > 0 && persistedDefaults.headerKeys.length === 0) {
        missingPersistedFields.push("headers");
      }

      logger.info(
        {
          inviteId: invite.id,
          joinRequestId: created.id,
          joinRequestStatus: created.status,
          expectedDefaults,
          persistedDefaults,
          diagnostics: joinDefaults.diagnostics.map((diag) => ({
            code: diag.code,
            level: diag.level,
            message: diag.message,
            hint: diag.hint ?? null,
          })),
        },
        "invite accept persisted OpenClaw gateway join request",
      );

      if (missingPersistedFields.length > 0) {
        logger.warn(
          {
            inviteId: invite.id,
            joinRequestId: created.id,
            missingPersistedFields,
          },
          "invite accept detected missing persisted OpenClaw gateway defaults",
        );
      }
    }

    await logActivity(db, {
      companyId,
      actorType: req.actor.type === "agent" ? "agent" : "user",
      actorId:
        req.actor.type === "agent"
          ? (req.actor.agentId ?? "invite-agent")
          : (req.actor.userId ?? (requestType === "agent" ? "invite-anon" : "board")),
      action: inviteAlreadyAccepted ? "join.request_replayed" : "join.requested",
      entityType: "join_request",
      entityId: created.id,
      details: {
        requestType,
        requestIp: created.requestIp,
        inviteReplay: inviteAlreadyAccepted,
      },
    });

    const response = toJoinRequestResponse(created);
    if (claimSecret) {
      const onboardingManifest = buildInviteOnboardingManifest(req, token, invite, opts);
      res.status(202).json({
        ...response,
        claimSecret,
        claimApiKeyPath: `/api/join-requests/${created.id}/claim-api-key`,
        onboarding: onboardingManifest.onboarding,
        diagnostics: joinDefaults.diagnostics,
      });
      return;
    }
    res.status(202).json({
      ...response,
      ...(joinDefaults.diagnostics.length > 0 ? { diagnostics: joinDefaults.diagnostics } : {}),
    });
  });

  router.post("/invites/:inviteId/revoke", async (req, res) => {
    const id = req.params.inviteId as string;
    const invite = await db
      .select()
      .from(invites)
      .where(eq(invites.id, id))
      .then((rows) => rows[0] ?? null);
    if (!invite) throw notFound("Invite not found");
    if (invite.inviteType === "bootstrap_ceo") {
      await assertInstanceAdmin(req);
    } else {
      if (!invite.companyId) throw conflict("Invite is missing company scope");
      await assertCompanyPermission(req, invite.companyId, "users:invite");
    }
    if (invite.acceptedAt) throw conflict("Invite already consumed");
    if (invite.revokedAt) return res.json(invite);

    const revoked = await db
      .update(invites)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(invites.id, id))
      .returning()
      .then((rows) => rows[0]);

    if (invite.companyId) {
      await logActivity(db, {
        companyId: invite.companyId,
        actorType: req.actor.type === "agent" ? "agent" : "user",
        actorId: req.actor.type === "agent" ? (req.actor.agentId ?? "unknown-agent") : (req.actor.userId ?? "board"),
        action: "invite.revoked",
        entityType: "invite",
        entityId: id,
      });
    }

    res.json(revoked);
  });

  router.get("/companies/:companyId/join-requests", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyPermission(req, companyId, "joins:approve");
    const query = listJoinRequestsQuerySchema.parse(req.query);
    const all = await db
      .select()
      .from(joinRequests)
      .where(eq(joinRequests.companyId, companyId))
      .orderBy(desc(joinRequests.createdAt));
    const filtered = all.filter((row) => {
      if (query.status && row.status !== query.status) return false;
      if (query.requestType && row.requestType !== query.requestType) return false;
      return true;
    });
    res.json(filtered.map(toJoinRequestResponse));
  });

  router.post("/companies/:companyId/join-requests/:requestId/approve", async (req, res) => {
    const companyId = req.params.companyId as string;
    const requestId = req.params.requestId as string;
    await assertCompanyPermission(req, companyId, "joins:approve");

    const existing = await db
      .select()
      .from(joinRequests)
      .where(and(eq(joinRequests.companyId, companyId), eq(joinRequests.id, requestId)))
      .then((rows) => rows[0] ?? null);
    if (!existing) throw notFound("Join request not found");
    if (existing.status !== "pending_approval") throw conflict("Join request is not pending");

    const invite = await db
      .select()
      .from(invites)
      .where(eq(invites.id, existing.inviteId))
      .then((rows) => rows[0] ?? null);
    if (!invite) throw notFound("Invite not found");

    let createdAgentId: string | null = existing.createdAgentId ?? null;
    if (existing.requestType === "human") {
      if (!existing.requestingUserId) throw conflict("Join request missing user identity");
      await access.ensureMembership(companyId, "user", existing.requestingUserId, "member", "active");
      const grants = grantsFromDefaults(invite.defaultsPayload as Record<string, unknown> | null, "human");
      await access.setPrincipalGrants(companyId, "user", existing.requestingUserId, grants, req.actor.userId ?? null);
    } else {
      const existingAgents = await agents.list(companyId);
      const managerId = resolveJoinRequestAgentManagerId(existingAgents);
      if (!managerId) {
        throw conflict("Join request cannot be approved because this company has no active CEO");
      }

      const agentName = deduplicateAgentName(
        existing.agentName ?? "New Agent",
        existingAgents.map((a) => ({
          id: a.id,
          name: a.name,
          status: a.status,
        })),
      );

      const created = await agents.create(companyId, {
        name: agentName,
        role: "general",
        title: null,
        status: "idle",
        reportsTo: managerId,
        capabilities: existing.capabilities ?? null,
        adapterType: existing.adapterType ?? "process",
        adapterConfig:
          existing.agentDefaultsPayload && typeof existing.agentDefaultsPayload === "object"
            ? (existing.agentDefaultsPayload as Record<string, unknown>)
            : {},
        runtimeConfig: {},
        budgetMonthlyCents: 0,
        spentMonthlyCents: 0,
        permissions: {},
        lastHeartbeatAt: null,
        metadata: null,
      });
      createdAgentId = created.id;
      await access.ensureMembership(companyId, "agent", created.id, "member", "active");
      const grants = agentJoinGrantsFromDefaults(invite.defaultsPayload as Record<string, unknown> | null);
      await access.setPrincipalGrants(companyId, "agent", created.id, grants, req.actor.userId ?? null);
    }

    const approved = await db
      .update(joinRequests)
      .set({
        status: "approved",
        approvedByUserId: req.actor.userId ?? (isLocalImplicit(req) ? "local-board" : null),
        approvedAt: new Date(),
        createdAgentId,
        updatedAt: new Date(),
      })
      .where(eq(joinRequests.id, requestId))
      .returning()
      .then((rows) => rows[0]);

    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "join.approved",
      entityType: "join_request",
      entityId: requestId,
      details: { requestType: existing.requestType, createdAgentId },
    });

    if (createdAgentId) {
      void notifyHireApproved(db, {
        companyId,
        agentId: createdAgentId,
        source: "join_request",
        sourceId: requestId,
        approvedAt: new Date(),
      }).catch(() => {});
    }

    res.json(toJoinRequestResponse(approved));
  });

  router.post("/companies/:companyId/join-requests/:requestId/reject", async (req, res) => {
    const companyId = req.params.companyId as string;
    const requestId = req.params.requestId as string;
    await assertCompanyPermission(req, companyId, "joins:approve");

    const existing = await db
      .select()
      .from(joinRequests)
      .where(and(eq(joinRequests.companyId, companyId), eq(joinRequests.id, requestId)))
      .then((rows) => rows[0] ?? null);
    if (!existing) throw notFound("Join request not found");
    if (existing.status !== "pending_approval") throw conflict("Join request is not pending");

    const rejected = await db
      .update(joinRequests)
      .set({
        status: "rejected",
        rejectedByUserId: req.actor.userId ?? (isLocalImplicit(req) ? "local-board" : null),
        rejectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(joinRequests.id, requestId))
      .returning()
      .then((rows) => rows[0]);

    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "join.rejected",
      entityType: "join_request",
      entityId: requestId,
      details: { requestType: existing.requestType },
    });

    res.json(toJoinRequestResponse(rejected));
  });

  router.post("/join-requests/:requestId/claim-api-key", validate(claimJoinRequestApiKeySchema), async (req, res) => {
    const requestId = req.params.requestId as string;
    const presentedClaimSecretHash = hashToken(req.body.claimSecret);
    const joinRequest = await db
      .select()
      .from(joinRequests)
      .where(eq(joinRequests.id, requestId))
      .then((rows) => rows[0] ?? null);
    if (!joinRequest) throw notFound("Join request not found");
    if (joinRequest.requestType !== "agent") throw badRequest("Only agent join requests can claim API keys");
    if (joinRequest.status !== "approved") throw conflict("Join request must be approved before key claim");
    if (!joinRequest.createdAgentId) throw conflict("Join request has no created agent");
    if (!joinRequest.claimSecretHash) throw conflict("Join request is missing claim secret metadata");
    if (!tokenHashesMatch(joinRequest.claimSecretHash, presentedClaimSecretHash)) {
      throw forbidden("Invalid claim secret");
    }
    if (joinRequest.claimSecretExpiresAt && joinRequest.claimSecretExpiresAt.getTime() <= Date.now()) {
      throw conflict("Claim secret expired");
    }
    if (joinRequest.claimSecretConsumedAt) throw conflict("Claim secret already used");

    const existingKey = await db
      .select({ id: agentApiKeys.id })
      .from(agentApiKeys)
      .where(eq(agentApiKeys.agentId, joinRequest.createdAgentId))
      .then((rows) => rows[0] ?? null);
    if (existingKey) throw conflict("API key already claimed");

    const consumed = await db
      .update(joinRequests)
      .set({ claimSecretConsumedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(joinRequests.id, requestId), isNull(joinRequests.claimSecretConsumedAt)))
      .returning({ id: joinRequests.id })
      .then((rows) => rows[0] ?? null);
    if (!consumed) throw conflict("Claim secret already used");

    const created = await agents.createApiKey(joinRequest.createdAgentId, "initial-join-key");

    await logActivity(db, {
      companyId: joinRequest.companyId,
      actorType: "system",
      actorId: "join-claim",
      action: "agent_api_key.claimed",
      entityType: "agent_api_key",
      entityId: created.id,
      details: {
        agentId: joinRequest.createdAgentId,
        joinRequestId: requestId,
      },
    });

    res.status(201).json({
      keyId: created.id,
      token: created.token,
      agentId: joinRequest.createdAgentId,
      createdAt: created.createdAt,
    });
  });

  // ── User Invite Flow (Phase 2) ──

  router.post("/companies/:companyId/user-invites", validate(createUserInviteSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    await assertCompanyPermission(req, companyId, "users:invite");

    const { invite, token } = await userInvites.create({
      companyId,
      email: req.body.email,
      role: req.body.role ?? "member",
      invitedByUserId: req.actor.userId ?? null,
    });

    const baseUrl = requestBaseUrl(req);
    const inviteUrl = `${baseUrl}/user-invite/${token}`;

    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "user_invite.created",
      entityType: "user_invite",
      entityId: invite.id,
      details: {
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt.toISOString(),
      },
    });

    res.status(201).json({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      inviteUrl,
      expiresAt: invite.expiresAt.toISOString(),
    });
  });

  router.get("/companies/:companyId/user-invites", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    await assertCompanyPermission(req, companyId, "users:invite");
    const list = await userInvites.listForCompany(companyId);
    res.json(list);
  });

  router.get("/user-invites/:token", async (req, res) => {
    const token = (req.params.token as string).trim();
    if (!token) throw notFound("Invite not found");
    const invite = await userInvites.getByToken(token);
    if (!invite) throw notFound("Invite not found or expired");
    res.json({
      id: invite.id,
      companyId: invite.companyId,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
    });
  });

  router.post("/user-invites/:token/accept", validate(acceptUserInviteSchema), async (req, res) => {
    const token = (req.params.token as string).trim();
    if (!token) throw notFound("Invite not found");

    // Create a simple signUp wrapper to create the user via direct DB insert
    // since we don't have a direct reference to the Better Auth instance here.
    // The user will set their password when they sign in for the first time via
    // Better Auth's built-in email/password flow.
    const signUpWrapper = {
      signUpEmail: async (data: { name: string; email: string; password: string }) => {
        const existing = await db
          .select({ id: authUsers.id })
          .from(authUsers)
          .where(eq(authUsers.email, data.email))
          .then((rows) => rows[0] ?? null);

        if (existing) return { id: existing.id };

        const userId = randomBytes(16).toString("hex");
        const now = new Date();
        const newUser = await db
          .insert(authUsers)
          .values({
            id: userId,
            name: data.name,
            email: data.email,
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .then((rows) => rows[0]);

        return { id: newUser.id };
      },
    };

    const result = await userInvites.accept(
      token,
      {
        name: req.body.name,
        password: req.body.password,
        tosAccepted: req.body.tosAccepted,
      },
      signUpWrapper,
    );

    // Ensure default budget policy exists for the company
    const existingPolicies = await budgets.listPolicies(result.companyId);
    const hasCompanyMonthly = existingPolicies.some(
      (p) => p.scopeType === "company" && p.scopeId === result.companyId && p.windowKind === "calendar_month_utc",
    );
    if (!hasCompanyMonthly) {
      await budgets.upsertPolicy(
        result.companyId,
        {
          scopeType: "company",
          scopeId: result.companyId,
          amount: 50000, // $500 in cents
          windowKind: "calendar_month_utc",
          warnPercent: 80,
          hardStopEnabled: true,
          notifyEnabled: true,
        },
        null,
      );
    }

    await logActivity(db, {
      companyId: result.companyId,
      actorType: "user",
      actorId: result.userId,
      action: "user_invite.accepted",
      entityType: "user_invite",
      entityId: result.userId,
      details: { companyId: result.companyId },
    });

    res.json({
      accepted: true,
      userId: result.userId,
      companyId: result.companyId,
    });
  });

  router.post("/companies/:companyId/user-invites/:inviteId/revoke", async (req, res) => {
    const companyId = req.params.companyId as string;
    const inviteId = req.params.inviteId as string;
    assertCompanyAccess(req, companyId);
    await assertCompanyPermission(req, companyId, "users:invite");

    const revoked = await userInvites.revoke(inviteId, companyId);

    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "user_invite.revoked",
      entityType: "user_invite",
      entityId: revoked.id,
      details: { email: revoked.email },
    });

    res.json({ revoked: true });
  });

  return router;
}
