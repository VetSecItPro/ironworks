import { Router } from "express";
import path from "node:path";
import fs from "node:fs/promises";
import type { Db } from "@ironworksai/db";
import { eq } from "drizzle-orm";
import { agents } from "@ironworksai/db";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { badRequest, notFound } from "../errors.js";
import { resolveIronworksInstanceRoot } from "../home-paths.js";
import { libraryService } from "../services/library.js";
import { resolveVisibleOwnerAgentIds, getAgentProjectIds } from "../services/org-visibility.js";

/** Characters allowed in library path segments to prevent traversal. */
const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

export interface LibraryEntry {
  name: string;
  path: string;
  kind: "file" | "directory";
  size: number;
  modifiedAt: string;
  /** DB metadata (present if file is registered). */
  meta?: {
    id: string;
    ownerAgentId: string | null;
    visibility: string;
    projectId: string | null;
    contributorCount?: number;
  } | null;
}

export interface LibraryFileContent {
  path: string;
  name: string;
  content: string | null;
  size: number;
  modifiedAt: string;
  error?: string;
  meta?: {
    id: string;
    ownerAgentId: string | null;
    ownerUserId: string | null;
    visibility: string;
    projectId: string | null;
    lastModifiedByAgentId: string | null;
    lastModifiedAt: string;
    createdAt: string;
  } | null;
  events?: Array<{
    id: string;
    action: string;
    agentId: string | null;
    agentName: string | null;
    userId: string | null;
    issueId: string | null;
    changeSummary: string | null;
    createdAt: Date;
  }>;
  contributors?: Array<{
    agentId: string | null;
    agentName: string | null;
  }>;
}

function resolveLibraryRoot(): string {
  return path.resolve(resolveIronworksInstanceRoot(), "library");
}

function resolveSecure(libraryRoot: string, relativePath: string): string {
  if (relativePath.includes("..")) {
    throw badRequest("Path must not contain '..'");
  }

  const segments = relativePath.split("/").filter(Boolean);
  for (const seg of segments) {
    if (!SAFE_SEGMENT.test(seg)) {
      throw badRequest(`Invalid path segment: '${seg}'`);
    }
  }

  const resolved = path.resolve(libraryRoot, ...segments);
  const root = path.resolve(libraryRoot);

  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw badRequest("Path escapes library root");
  }

  return resolved;
}

async function ensureLibraryRoot(libraryRoot: string): Promise<void> {
  await fs.mkdir(libraryRoot, { recursive: true });
}

/**
 * Seed the library directory structure and naming policy on first boot.
 */
async function seedLibrary(libraryRoot: string): Promise<void> {
  const dirs = [
    "shared/policies",
    "shared/reports",
    "shared/guides",
    "projects",
    "agents",
  ];

  for (const dir of dirs) {
    await fs.mkdir(path.join(libraryRoot, dir), { recursive: true });
  }

  const policyPath = path.join(libraryRoot, "shared/policies/library-naming-policy.md");
  try {
    await fs.access(policyPath);
  } catch {
    const assetPath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      "../onboarding-assets/library-naming-policy.md",
    );
    try {
      const content = await fs.readFile(assetPath, "utf-8");
      await fs.writeFile(policyPath, content, "utf-8");
    } catch {
      await fs.writeFile(
        policyPath,
        "# Library Naming Policy\n\nAll files must follow: `YYYY-MM-DD-<project>-<purpose>-<author>.<ext>`\n",
        "utf-8",
      );
    }
  }
}

export function libraryRoutes(db: Db) {
  const router = Router();
  const libraryRoot = resolveLibraryRoot();
  const svc = libraryService(db);

  seedLibrary(libraryRoot).catch(() => {});

  // ─── Browse directory ───────────────────────────────────────────────
  router.get("/companies/:companyId/library/tree", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    // Resolve visibility for the current actor
    const actor = getActorInfo(req);
    const visibility = await resolveVisibleOwnerAgentIds(
      db,
      actor.actorType === "agent" ? "agent" : "board",
      actor.agentId,
      companyId,
    );
    // Get project access for project-visibility filtering
    const agentProjectIds = actor.agentId
      ? await getAgentProjectIds(db, actor.agentId)
      : [];
    // Load agents list for folder-name matching in ACL filtering
    const companyAgentsList = visibility.seeAll
      ? null
      : await db.select({ id: agents.id, name: agents.name }).from(agents).where(eq(agents.companyId, companyId));

    await ensureLibraryRoot(libraryRoot);

    const relativePath = (req.query.path as string) || "";
    const targetDir = resolveSecure(libraryRoot, relativePath);

    let stat;
    try {
      stat = await fs.stat(targetDir);
    } catch {
      throw notFound(`Directory not found: ${relativePath || "/"}`);
    }

    if (!stat.isDirectory()) {
      throw badRequest("Path is not a directory");
    }

    const dirents = await fs.readdir(targetDir, { withFileTypes: true });
    const entries: LibraryEntry[] = [];

    for (const dirent of dirents) {
      if (dirent.name.startsWith(".")) continue;

      const entryPath = path.join(targetDir, dirent.name);
      const entryRelPath = relativePath
        ? `${relativePath}/${dirent.name}`
        : dirent.name;

      try {
        const entryStat = await fs.stat(entryPath);
        const entry: LibraryEntry = {
          name: dirent.name,
          path: entryRelPath,
          kind: dirent.isDirectory() ? "directory" : "file",
          size: entryStat.size,
          modifiedAt: entryStat.mtime.toISOString(),
        };

        // Enrich with DB metadata for files
        if (!dirent.isDirectory()) {
          const fileMeta = await svc.getFileByPath(companyId, entryRelPath);
          if (fileMeta) {
            entry.meta = {
              id: fileMeta.id,
              ownerAgentId: fileMeta.ownerAgentId,
              visibility: fileMeta.visibility,
              projectId: fileMeta.projectId,
            };
          }
        }

        entries.push(entry);
      } catch {
        continue;
      }
    }

    // ACL filtering: apply org-chart-based visibility rules
    const filteredEntries = visibility.seeAll
      ? entries
      : entries.filter((entry) => {
          // Company-wide files (shared/) — everyone sees
          if (entry.path.startsWith("shared")) return true;

          // Project files — agents see projects they're assigned to, board sees all
          if (entry.path.startsWith("projects/")) {
            if (entry.meta?.projectId) {
              return agentProjectIds.includes(entry.meta.projectId);
            }
            return true; // No project metadata yet, show it
          }

          // Agent private files — only visible to owner + managers in their chain
          if (entry.path.startsWith("agents/")) {
            if (entry.meta?.ownerAgentId) {
              return visibility.visibleOwnerAgentIds.includes(entry.meta.ownerAgentId);
            }
            // For agent directories without DB metadata, check by folder name
            // If browsing agents/ root, show only accessible agent folders
            if (relativePath === "agents" && entry.kind === "directory") {
              // Look up agent by folder name
              const folderAgentName = entry.name.toLowerCase();
              const matchedAgent = companyAgentsList?.find(
                (a: { id: string; name: string }) => a.name.toLowerCase().replace(/[\s_-]/g, "") === folderAgentName.replace(/[\s_-]/g, ""),
              );
              if (matchedAgent) {
                return visibility.visibleOwnerAgentIds.includes(matchedAgent.id);
              }
            }
            return true;
          }

          return true; // Default: show
        });

    filteredEntries.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ path: relativePath || "/", entries: filteredEntries });
  });

  // ─── Read file with metadata ────────────────────────────────────────
  router.get("/companies/:companyId/library/file", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const relativePath = req.query.path as string;
    if (!relativePath) {
      throw badRequest("Query parameter 'path' is required");
    }

    const filePath = resolveSecure(libraryRoot, relativePath);

    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      throw notFound(`File not found: ${relativePath}`);
    }

    if (!stat.isFile()) {
      throw badRequest("Path is not a file");
    }

    const MAX_READABLE_SIZE = 2 * 1024 * 1024;
    if (stat.size > MAX_READABLE_SIZE) {
      res.json({
        path: relativePath,
        name: path.basename(filePath),
        content: null,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        error: "File too large to display (max 2MB)",
      });
      return;
    }

    const content = await fs.readFile(filePath, "utf-8");

    // Get DB metadata, events, and contributors
    const fileMeta = await svc.getFileByPath(companyId, relativePath);
    let events: LibraryFileContent["events"] = [];
    let contributors: LibraryFileContent["contributors"] = [];

    if (fileMeta) {
      events = await svc.getFileEvents(fileMeta.id);
      contributors = await svc.getFileContributors(fileMeta.id);
    }

    const result: LibraryFileContent = {
      path: relativePath,
      name: path.basename(filePath),
      content,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      meta: fileMeta
        ? {
            id: fileMeta.id,
            ownerAgentId: fileMeta.ownerAgentId,
            ownerUserId: fileMeta.ownerUserId,
            visibility: fileMeta.visibility,
            projectId: fileMeta.projectId,
            lastModifiedByAgentId: fileMeta.lastModifiedByAgentId,
            lastModifiedAt: fileMeta.lastModifiedAt.toISOString(),
            createdAt: fileMeta.createdAt.toISOString(),
          }
        : null,
      events,
      contributors,
    };

    res.json(result);
  });

  // ─── Search (filename + content) ────────────────────────────────────
  router.get("/companies/:companyId/library/search", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const query = ((req.query.q as string) || "").toLowerCase().trim();
    const searchContent = req.query.content === "true";
    if (!query) {
      throw badRequest("Query parameter 'q' is required");
    }

    await ensureLibraryRoot(libraryRoot);

    const results: (LibraryEntry & { matchContext?: string })[] = [];
    const MAX_RESULTS = 50;
    const MAX_DEPTH = 10;

    async function walk(dir: string, relativeBase: string, depth: number) {
      if (depth > MAX_DEPTH || results.length >= MAX_RESULTS) return;

      let dirents;
      try {
        dirents = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const dirent of dirents) {
        if (results.length >= MAX_RESULTS) break;
        if (dirent.name.startsWith(".")) continue;

        const entryRelPath = relativeBase
          ? `${relativeBase}/${dirent.name}`
          : dirent.name;
        const fullPath = path.join(dir, dirent.name);

        const nameMatches = dirent.name.toLowerCase().includes(query);
        let contentMatch: string | undefined;

        // Content search for text files
        if (!nameMatches && searchContent && !dirent.isDirectory()) {
          try {
            const fileStat = await fs.stat(fullPath);
            if (fileStat.size < 512 * 1024) {
              const content = await fs.readFile(fullPath, "utf-8");
              const lowerContent = content.toLowerCase();
              const idx = lowerContent.indexOf(query);
              if (idx >= 0) {
                // Extract surrounding context (80 chars around match)
                const start = Math.max(0, idx - 40);
                const end = Math.min(content.length, idx + query.length + 40);
                contentMatch = (start > 0 ? "..." : "") +
                  content.slice(start, end).replace(/\n/g, " ") +
                  (end < content.length ? "..." : "");
              }
            }
          } catch {
            // Not a text file or can't read — skip
          }
        }

        if (nameMatches || contentMatch) {
          try {
            const entryStat = await fs.stat(fullPath);
            results.push({
              name: dirent.name,
              path: entryRelPath,
              kind: dirent.isDirectory() ? "directory" : "file",
              size: entryStat.size,
              modifiedAt: entryStat.mtime.toISOString(),
              ...(contentMatch ? { matchContext: contentMatch } : {}),
            });
          } catch {
            continue;
          }
        }

        if (dirent.isDirectory()) {
          await walk(fullPath, entryRelPath, depth + 1);
        }
      }
    }

    await walk(libraryRoot, "", 0);
    res.json({ query, results });
  });

  // ─── Scan: sync filesystem → DB ─────────────────────────────────────
  router.post("/companies/:companyId/library/scan", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    await ensureLibraryRoot(libraryRoot);

    let registered = 0;
    const MAX_DEPTH = 10;

    async function walk(dir: string, relativeBase: string, depth: number) {
      if (depth > MAX_DEPTH) return;

      let dirents;
      try {
        dirents = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const dirent of dirents) {
        if (dirent.name.startsWith(".")) continue;

        const entryRelPath = relativeBase
          ? `${relativeBase}/${dirent.name}`
          : dirent.name;

        if (dirent.isDirectory()) {
          await walk(path.join(dir, dirent.name), entryRelPath, depth + 1);
        } else {
          try {
            const fileStat = await fs.stat(path.join(dir, dirent.name));

            // Extract title from markdown files
            let title: string | null = null;
            const ext = dirent.name.split(".").pop()?.toLowerCase();
            if (ext === "md" || ext === "mdx") {
              try {
                const content = await fs.readFile(path.join(dir, dirent.name), "utf-8");
                const headingMatch = /^#\s+(.+)$/m.exec(content);
                if (headingMatch) {
                  title = headingMatch[1].trim();
                }
              } catch { /* skip */ }
            }

            await svc.registerFile({
              companyId,
              filePath: entryRelPath,
              title,
              sizeBytes: fileStat.size,
            });
            registered++;
          } catch {
            continue;
          }
        }
      }
    }

    await walk(libraryRoot, "", 0);
    res.json({ scanned: true, registered });
  });

  // ─── File events history ─────────────────────────────────────────────
  router.get("/companies/:companyId/library/events", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const filePath = req.query.path as string;
    if (!filePath) {
      throw badRequest("Query parameter 'path' is required");
    }

    const fileMeta = await svc.getFileByPath(companyId, filePath);
    if (!fileMeta) {
      res.json({ events: [], contributors: [] });
      return;
    }

    const events = await svc.getFileEvents(fileMeta.id);
    const contributors = await svc.getFileContributors(fileMeta.id);

    res.json({ events, contributors });
  });

  // ─── Register file (for agents to call explicitly) ───────────────────
  router.post("/companies/:companyId/library/register", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);

    const { filePath, title, projectId, issueId, changeSummary } = req.body as {
      filePath: string;
      title?: string;
      projectId?: string;
      issueId?: string;
      changeSummary?: string;
    };

    if (!filePath) {
      throw badRequest("filePath is required");
    }

    // Verify file exists on disk
    const absPath = resolveSecure(libraryRoot, filePath);
    let stat;
    try {
      stat = await fs.stat(absPath);
    } catch {
      throw notFound(`File not found on disk: ${filePath}`);
    }

    // Check if file already exists in DB
    const existing = await svc.getFileByPath(companyId, filePath);
    const action = existing ? "modified" : "created";

    const result = await svc.registerFileWithEvent({
      companyId,
      filePath,
      title: title ?? null,
      sizeBytes: stat.size,
      ownerAgentId: actor.agentId ?? (existing?.ownerAgentId ?? null),
      ownerUserId: actor.actorType === "user" ? actor.actorId : (existing?.ownerUserId ?? null),
      projectId: projectId ?? (existing?.projectId ?? null),
      action,
      issueId: issueId ?? null,
      changeSummary: changeSummary ?? null,
    });

    res.status(action === "created" ? 201 : 200).json(result);
  });

  return router;
}
