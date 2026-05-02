import type { Db } from "@ironworksai/db";
import { Router } from "express";
import { notFound, unprocessable } from "../errors.js";
import { mcpServerService } from "../services/index.js";
import { assertBoard, assertCanWrite, assertCompanyAccess } from "./authz.js";

const VALID_TRANSPORTS = new Set(["stdio", "http"]);
const VALID_STATUSES = new Set(["active", "paused"]);

function parseCompanyId(id: string | undefined): string {
  if (!id) throw unprocessable("Missing companyId");
  return id;
}

function parseServerId(id: string | undefined): string {
  if (!id) throw unprocessable("Missing server id");
  return id;
}

export function mcpServerRoutes(db: Db) {
  const router = Router();
  const svc = mcpServerService(db);

  // ── List servers for a company ───────────────────────────────────────────
  router.get("/companies/:companyId/mcp-servers", async (req, res) => {
    assertBoard(req);
    const companyId = parseCompanyId(req.params.companyId);
    assertCompanyAccess(req, companyId);

    const servers = await svc.list(companyId);
    res.json(servers);
  });

  // ── Create a new server ──────────────────────────────────────────────────
  router.post("/companies/:companyId/mcp-servers", async (req, res) => {
    assertBoard(req);
    const companyId = parseCompanyId(req.params.companyId);
    await assertCanWrite(req, companyId, db);

    const {
      name,
      description,
      transport,
      command,
      url,
      apiKeySecretName,
      enabledForAgentIds,
      enabledToolNames,
      status,
    } = req.body as Record<string, unknown>;

    if (typeof name !== "string" || !name.trim()) {
      throw unprocessable("name is required");
    }
    if (!VALID_TRANSPORTS.has(transport as string)) {
      throw unprocessable("transport must be 'stdio' or 'http'");
    }
    if (status !== undefined && !VALID_STATUSES.has(status as string)) {
      throw unprocessable("status must be 'active' or 'paused'");
    }

    const server = await svc.create(companyId, {
      name: (name as string).trim(),
      description: typeof description === "string" ? description : null,
      transport: transport as "stdio" | "http",
      command: typeof command === "string" ? command : null,
      url: typeof url === "string" ? url : null,
      apiKeySecretName: typeof apiKeySecretName === "string" ? apiKeySecretName : null,
      enabledForAgentIds: Array.isArray(enabledForAgentIds) ? (enabledForAgentIds as string[]) : [],
      enabledToolNames: Array.isArray(enabledToolNames) ? (enabledToolNames as string[]) : [],
      status: (status as "active" | "paused") ?? "active",
    });

    res.status(201).json(server);
  });

  // ── Update a server ──────────────────────────────────────────────────────
  router.patch("/mcp-servers/:id", async (req, res) => {
    assertBoard(req);
    const id = parseServerId(req.params.id);

    // Load the row first to get companyId for access check.
    const existing = await svc.getById(id);
    if (!existing) throw notFound("MCP server not found");
    assertCompanyAccess(req, existing.companyId);
    await assertCanWrite(req, existing.companyId, db);

    const {
      name,
      description,
      transport,
      command,
      url,
      apiKeySecretName,
      enabledForAgentIds,
      enabledToolNames,
      status,
    } = req.body as Record<string, unknown>;

    if (transport !== undefined && !VALID_TRANSPORTS.has(transport as string)) {
      throw unprocessable("transport must be 'stdio' or 'http'");
    }
    if (status !== undefined && !VALID_STATUSES.has(status as string)) {
      throw unprocessable("status must be 'active' or 'paused'");
    }

    const updated = await svc.update(id, existing.companyId, {
      ...(name !== undefined && { name: (name as string).trim() }),
      ...(description !== undefined && { description: description as string | null }),
      ...(transport !== undefined && { transport: transport as "stdio" | "http" }),
      ...(command !== undefined && { command: command as string | null }),
      ...(url !== undefined && { url: url as string | null }),
      ...(apiKeySecretName !== undefined && { apiKeySecretName: apiKeySecretName as string | null }),
      ...(enabledForAgentIds !== undefined && {
        enabledForAgentIds: Array.isArray(enabledForAgentIds) ? (enabledForAgentIds as string[]) : [],
      }),
      ...(enabledToolNames !== undefined && {
        enabledToolNames: Array.isArray(enabledToolNames) ? (enabledToolNames as string[]) : [],
      }),
      ...(status !== undefined && { status: status as "active" | "paused" }),
    });

    res.json(updated);
  });

  // ── Delete a server ──────────────────────────────────────────────────────
  router.delete("/mcp-servers/:id", async (req, res) => {
    assertBoard(req);
    const id = parseServerId(req.params.id);

    const existing = await svc.getById(id);
    if (!existing) throw notFound("MCP server not found");
    assertCompanyAccess(req, existing.companyId);
    await assertCanWrite(req, existing.companyId, db);

    await svc.remove(id, existing.companyId);
    res.json({ ok: true });
  });

  // ── Test a server connection and return its tool list ────────────────────
  router.post("/mcp-servers/:id/test", async (req, res) => {
    assertBoard(req);
    const id = parseServerId(req.params.id);

    const existing = await svc.getById(id);
    if (!existing) throw notFound("MCP server not found");
    assertCompanyAccess(req, existing.companyId);

    // Force-refresh bypasses the tool cache so the UI gets fresh data every time.
    const tools = await svc.discoverTools(existing, /* forceRefresh */ true);
    res.json({ tools });
  });

  return router;
}
