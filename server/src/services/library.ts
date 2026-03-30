import { and, desc, eq, like, sql } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import { libraryFiles, libraryFileEvents, agents } from "@ironworksai/db";

export interface RegisterFileInput {
  companyId: string;
  filePath: string;
  title?: string | null;
  fileType?: string | null;
  sizeBytes?: number;
  visibility?: "private" | "project" | "company";
  ownerAgentId?: string | null;
  ownerUserId?: string | null;
  projectId?: string | null;
}

export interface RecordEventInput {
  companyId: string;
  fileId: string;
  action: "created" | "modified" | "renamed" | "deleted";
  agentId?: string | null;
  userId?: string | null;
  issueId?: string | null;
  changeSummary?: string | null;
}

export function libraryService(db: Db) {
  return {
    /**
     * Register or update a file in the library.
     * Uses upsert — if the file path already exists for this company, updates metadata.
     */
    async registerFile(input: RegisterFileInput) {
      const ext = input.filePath.split(".").pop()?.toLowerCase() ?? null;
      const fileType = input.fileType ?? ext;
      const visibility = input.visibility ?? deriveVisibility(input.filePath);

      const [row] = await db
        .insert(libraryFiles)
        .values({
          companyId: input.companyId,
          filePath: input.filePath,
          title: input.title ?? null,
          fileType,
          sizeBytes: input.sizeBytes ?? 0,
          visibility,
          ownerAgentId: input.ownerAgentId ?? null,
          ownerUserId: input.ownerUserId ?? null,
          projectId: input.projectId ?? null,
          lastModifiedByAgentId: input.ownerAgentId ?? null,
          lastModifiedByUserId: input.ownerUserId ?? null,
          lastModifiedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [libraryFiles.companyId, libraryFiles.filePath],
          set: {
            title: input.title !== undefined ? input.title : sql`${libraryFiles.title}`,
            fileType: fileType ?? sql`${libraryFiles.fileType}`,
            sizeBytes: input.sizeBytes ?? sql`${libraryFiles.sizeBytes}`,
            lastModifiedByAgentId: input.ownerAgentId ?? sql`${libraryFiles.lastModifiedByAgentId}`,
            lastModifiedByUserId: input.ownerUserId ?? sql`${libraryFiles.lastModifiedByUserId}`,
            lastModifiedAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning();

      return row;
    },

    /**
     * Record an event (created, modified, etc.) for a library file.
     */
    async recordEvent(input: RecordEventInput) {
      const [row] = await db
        .insert(libraryFileEvents)
        .values({
          companyId: input.companyId,
          fileId: input.fileId,
          action: input.action,
          agentId: input.agentId ?? null,
          userId: input.userId ?? null,
          issueId: input.issueId ?? null,
          changeSummary: input.changeSummary ?? null,
        })
        .returning();

      return row;
    },

    /**
     * Register a file and record the creation/modification event in one call.
     */
    async registerFileWithEvent(
      input: RegisterFileInput & {
        action?: "created" | "modified";
        issueId?: string | null;
        changeSummary?: string | null;
      },
    ) {
      const file = await this.registerFile(input);
      const event = await this.recordEvent({
        companyId: input.companyId,
        fileId: file.id,
        action: input.action ?? "created",
        agentId: input.ownerAgentId ?? null,
        userId: input.ownerUserId ?? null,
        issueId: input.issueId ?? null,
        changeSummary: input.changeSummary ?? null,
      });
      return { file, event };
    },

    /**
     * Get metadata for a file by path.
     */
    async getFileByPath(companyId: string, filePath: string) {
      const [row] = await db
        .select()
        .from(libraryFiles)
        .where(and(eq(libraryFiles.companyId, companyId), eq(libraryFiles.filePath, filePath)))
        .limit(1);

      return row ?? null;
    },

    /**
     * List all files for a company, optionally filtered by visibility or project.
     */
    async listFiles(
      companyId: string,
      opts?: {
        visibility?: string;
        projectId?: string;
        ownerAgentId?: string;
        limit?: number;
      },
    ) {
      const conditions = [eq(libraryFiles.companyId, companyId)];

      if (opts?.visibility) {
        conditions.push(eq(libraryFiles.visibility, opts.visibility));
      }
      if (opts?.projectId) {
        conditions.push(eq(libraryFiles.projectId, opts.projectId));
      }
      if (opts?.ownerAgentId) {
        conditions.push(eq(libraryFiles.ownerAgentId, opts.ownerAgentId));
      }

      return db
        .select()
        .from(libraryFiles)
        .where(and(...conditions))
        .orderBy(desc(libraryFiles.lastModifiedAt))
        .limit(opts?.limit ?? 500);
    },

    /**
     * Get event history for a file.
     */
    async getFileEvents(fileId: string, limit = 50) {
      return db
        .select({
          id: libraryFileEvents.id,
          action: libraryFileEvents.action,
          agentId: libraryFileEvents.agentId,
          agentName: agents.name,
          userId: libraryFileEvents.userId,
          issueId: libraryFileEvents.issueId,
          changeSummary: libraryFileEvents.changeSummary,
          createdAt: libraryFileEvents.createdAt,
        })
        .from(libraryFileEvents)
        .leftJoin(agents, eq(libraryFileEvents.agentId, agents.id))
        .where(eq(libraryFileEvents.fileId, fileId))
        .orderBy(desc(libraryFileEvents.createdAt))
        .limit(limit);
    },

    /**
     * Get unique contributors (agents) for a file.
     */
    async getFileContributors(fileId: string) {
      const rows = await db
        .selectDistinct({
          agentId: libraryFileEvents.agentId,
          agentName: agents.name,
        })
        .from(libraryFileEvents)
        .leftJoin(agents, eq(libraryFileEvents.agentId, agents.id))
        .where(
          and(
            eq(libraryFileEvents.fileId, fileId),
            sql`${libraryFileEvents.agentId} IS NOT NULL`,
          ),
        );

      return rows;
    },

    /**
     * Search files by path pattern.
     */
    async searchFiles(companyId: string, query: string, limit = 50) {
      return db
        .select()
        .from(libraryFiles)
        .where(
          and(
            eq(libraryFiles.companyId, companyId),
            like(libraryFiles.filePath, `%${query}%`),
          ),
        )
        .orderBy(desc(libraryFiles.lastModifiedAt))
        .limit(limit);
    },
  };
}

/**
 * Derive visibility from the file path.
 * shared/ → company, projects/ → project, agents/ → private
 */
function deriveVisibility(filePath: string): "private" | "project" | "company" {
  if (filePath.startsWith("shared/")) return "company";
  if (filePath.startsWith("projects/")) return "project";
  if (filePath.startsWith("agents/")) return "private";
  return "company";
}
