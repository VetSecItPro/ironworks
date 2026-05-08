import { Router } from "express";
import { claimBoardOwnership, inspectBoardClaimChallenge } from "../board-claim.js";
import { badRequest, conflict, notFound, unauthorized } from "../errors.js";
import type { AccessRouteContext } from "./access-route-helpers.js";

export function accessBoardClaimRoutes(ctx: AccessRouteContext): Router {
  const router = Router();
  const { db } = ctx;

  router.get("/board-claim/:token", async (req, res) => {
    const token = (req.params.token as string).trim();
    const code = typeof req.query.code === "string" ? req.query.code.trim() : undefined;
    if (!token) throw notFound("Board claim challenge not found");
    const challenge = inspectBoardClaimChallenge(token, code);
    if (challenge.status === "invalid") throw notFound("Board claim challenge not found");
    res.json(challenge);
  });

  router.post("/board-claim/:token/claim", async (req, res) => {
    const token = (req.params.token as string).trim();
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : undefined;
    if (!token) throw notFound("Board claim challenge not found");
    if (!code) throw badRequest("Claim code is required");
    if (req.actor.type !== "board" || req.actor.source !== "session" || !req.actor.userId) {
      throw unauthorized("Sign in before claiming board ownership");
    }

    const claimed = await claimBoardOwnership(db, {
      token,
      code,
      userId: req.actor.userId,
    });

    if (claimed.status === "invalid") throw notFound("Board claim challenge not found");
    if (claimed.status === "expired")
      throw conflict("Board claim challenge expired. Restart server to generate a new one.");
    if (claimed.status === "claimed") {
      res.json({
        claimed: true,
        userId: claimed.claimedByUserId ?? req.actor.userId,
      });
      return;
    }

    throw conflict("Board claim challenge is no longer available");
  });

  return router;
}
