import { companyMemberships } from "@ironworksai/db";
import {
  type MembershipRole,
  type PermissionKey,
  ROLE_PERMISSIONS,
  updateMemberPermissionsSchema,
  updateMemberRoleSchema,
  updateUserCompanyAccessSchema,
} from "@ironworksai/shared";
import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { forbidden, notFound } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { logActivity } from "../services/index.js";
import { type AccessRouteContext } from "./access-route-helpers.js";
import { assertCanWrite, assertCompanyAccess } from "./authz.js";

export function accessMembershipRoutes(ctx: AccessRouteContext): Router {
  const router = Router();
  const { db, access, assertInstanceAdmin, assertCompanyPermission } = ctx;

  router.get("/companies/:companyId/members", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyPermission(req, companyId, "users:manage_permissions");
    const members = await access.listMembers(companyId);
    res.json(members);
  });

  router.delete("/companies/:companyId/members/:memberId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const memberId = req.params.memberId as string;
    await assertCompanyPermission(req, companyId, "users:manage_permissions");
    // Block self-removal: an admin removing themselves leaves the workspace
    // unmanageable. Force them to ask another admin/owner.
    const target = await access.getMembershipById(companyId, memberId);
    if (!target) throw notFound("Member not found");
    if (target.principalType === "user" && target.principalId === req.actor.userId) {
      res.status(409).json({ error: "Cannot remove yourself from the workspace. Ask another admin or owner." });
      return;
    }
    const removed = await access.removeMembership(companyId, memberId);
    if (!removed) throw notFound("Member not found");
    res.json({ removed: true, memberId });
  });

  router.patch(
    "/companies/:companyId/members/:memberId/permissions",
    validate(updateMemberPermissionsSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const memberId = req.params.memberId as string;
      await assertCompanyPermission(req, companyId, "users:manage_permissions");
      const updated = await access.setMemberPermissions(
        companyId,
        memberId,
        req.body.grants ?? [],
        req.actor.userId ?? null,
      );
      if (!updated) throw notFound("Member not found");
      res.json(updated);
    },
  );

  router.post("/admin/users/:userId/promote-instance-admin", async (req, res) => {
    await assertInstanceAdmin(req);
    const userId = req.params.userId as string;
    const result = await access.promoteInstanceAdmin(userId);
    res.status(201).json(result);
  });

  router.post("/admin/users/:userId/demote-instance-admin", async (req, res) => {
    await assertInstanceAdmin(req);
    const userId = req.params.userId as string;
    const removed = await access.demoteInstanceAdmin(userId);
    if (!removed) throw notFound("Instance admin role not found");
    res.json(removed);
  });

  router.get("/admin/users/:userId/company-access", async (req, res) => {
    await assertInstanceAdmin(req);
    const userId = req.params.userId as string;
    const memberships = await access.listUserCompanyAccess(userId);
    res.json(memberships);
  });

  router.put("/admin/users/:userId/company-access", validate(updateUserCompanyAccessSchema), async (req, res) => {
    await assertInstanceAdmin(req);
    const userId = req.params.userId as string;
    const memberships = await access.setUserCompanyAccess(userId, req.body.companyIds ?? []);
    res.json(memberships);
  });

  // ── Member Role Management (Phase 3) ──
  router.patch("/companies/:companyId/members/:memberId/role", validate(updateMemberRoleSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const memberId = req.params.memberId as string;
    await assertCanWrite(req, companyId, db);

    // Only owners can change roles
    const actorMembership = req.actor.userId ? await access.getMembership(companyId, "user", req.actor.userId) : null;

    const isAdmin = req.actor.source === "local_implicit" || (await access.isInstanceAdmin(req.actor.userId));
    if (!isAdmin && actorMembership?.membershipRole !== "owner") {
      throw forbidden("Only company owners can change member roles");
    }

    const member = await db
      .select()
      .from(companyMemberships)
      .where(and(eq(companyMemberships.id, memberId), eq(companyMemberships.companyId, companyId)))
      .then((rows) => rows[0] ?? null);
    if (!member) throw notFound("Member not found");

    const newRole = req.body.role as MembershipRole;

    // Update the role
    await db
      .update(companyMemberships)
      .set({ membershipRole: newRole, updatedAt: new Date() })
      .where(eq(companyMemberships.id, member.id));

    // Sync permission grants based on role
    const rolePermissions = ROLE_PERMISSIONS[newRole] ?? [];
    await access.setPrincipalGrants(
      companyId,
      member.principalType as "user" | "agent",
      member.principalId,
      rolePermissions.map((pk) => ({ permissionKey: pk as PermissionKey })),
      req.actor.userId ?? null,
    );

    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "member.role_changed",
      entityType: "company_membership",
      entityId: member.id,
      details: { newRole, principalId: member.principalId },
    });

    res.json({ ...member, membershipRole: newRole });
  });

  // ── Health endpoint additions: isInstanceAdmin flag ──
  router.get("/me/access", async (req, res) => {
    if (req.actor.type !== "board" || !req.actor.userId) {
      res.json({ isInstanceAdmin: false, memberships: [] });
      return;
    }
    const isAdmin = await access.isInstanceAdmin(req.actor.userId);
    const memberships = await access.listUserCompanyAccess(req.actor.userId);
    res.json({
      isInstanceAdmin: isAdmin,
      memberships: memberships.map((m) => ({
        companyId: m.companyId,
        role: m.membershipRole ?? "member",
        status: m.status,
      })),
    });
  });

  return router;
}
