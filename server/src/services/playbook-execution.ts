import { and, asc, eq, inArray, sql } from "drizzle-orm";
import path from "node:path";
import fs from "node:fs/promises";
import type { Db } from "@ironworksai/db";
import {
  playbooks,
  playbookSteps,
  playbookRuns,
  playbookRunSteps,
  goals,
  issues,
  agents,
  projects,
  projectWorkspaces,
  libraryFiles,
  libraryFileEvents,
  companySkills,
} from "@ironworksai/db";
import { resolveIronworksInstanceRoot } from "../home-paths.js";

export function playbookExecutionService(db: Db) {
  return {
    /**
     * Execute a playbook: create the full environment (Project, Goal, Library folder,
     * Workspace) then stamp out Issues for each step with proper dependencies.
     */
    async runPlaybook(input: {
      companyId: string;
      playbookId: string;
      triggeredBy: string;
      /** Client/project name for this run. */
      name?: string | null;
      /** Optional git repo URL to attach as workspace. */
      repoUrl?: string | null;
      /** Optional local working directory. */
      cwd?: string | null;
      /** Existing projectId to use instead of creating a new one. */
      projectId?: string | null;
    }) {
      // 1. Load playbook + steps
      const [playbook] = await db
        .select()
        .from(playbooks)
        .where(eq(playbooks.id, input.playbookId))
        .limit(1);

      if (!playbook || playbook.companyId !== input.companyId) {
        throw new Error("Playbook not found");
      }

      const steps = await db
        .select()
        .from(playbookSteps)
        .where(eq(playbookSteps.playbookId, playbook.id))
        .orderBy(asc(playbookSteps.stepOrder));

      if (steps.length === 0) {
        throw new Error("Playbook has no steps");
      }

      // 2. Load all company agents for role matching
      const companyAgents = await db
        .select({ id: agents.id, name: agents.name, role: agents.role, title: agents.title })
        .from(agents)
        .where(eq(agents.companyId, input.companyId));

      // 2a. Validate skills — warn if company is missing required skills
      const warnings: string[] = [];
      const allRequiredSkills = new Set<string>();
      for (const step of steps) {
        const required = (step.requiredSkills as string[]) ?? [];
        for (const skill of required) allRequiredSkills.add(skill);
      }

      if (allRequiredSkills.size > 0) {
        const availableSkills = await db
          .select({ key: companySkills.key })
          .from(companySkills)
          .where(eq(companySkills.companyId, input.companyId));
        const availableKeys = new Set(availableSkills.map((s) => s.key));

        for (const required of allRequiredSkills) {
          if (!availableKeys.has(required)) {
            warnings.push(`Missing skill: ${required}`);
          }
        }
      }

      // 2b. Validate budgets — warn if agents are near budget limits
      for (const step of steps) {
        const assignee = resolveAgent(companyAgents, step.assigneeRole);
        if (assignee) {
          const [agentRow] = await db
            .select({ budgetMonthlyCents: agents.budgetMonthlyCents, spentMonthlyCents: agents.spentMonthlyCents })
            .from(agents)
            .where(eq(agents.id, assignee.id))
            .limit(1);
          if (agentRow && agentRow.budgetMonthlyCents > 0) {
            const utilization = agentRow.spentMonthlyCents / agentRow.budgetMonthlyCents;
            if (utilization >= 0.95) {
              warnings.push(`${step.assigneeRole} is at ${Math.round(utilization * 100)}% budget — step ${step.stepOrder} may fail`);
            } else if (utilization >= 0.8) {
              warnings.push(`${step.assigneeRole} is at ${Math.round(utilization * 100)}% budget — monitor step ${step.stepOrder}`);
            }
          }
        }
      }

      const runName = input.name?.trim() || playbook.name;
      const projectSlug = slugify(runName);

      // 3. Create or reuse Project
      let projectId = input.projectId ?? null;
      if (!projectId) {
        const [project] = await db
          .insert(projects)
          .values({
            companyId: input.companyId,
            name: runName,
            description: `Created by playbook: ${playbook.name}`,
            status: "active",
          })
          .returning();
        projectId = project.id;

        // 3a. Create project workspace if repo/cwd provided
        if (input.repoUrl || input.cwd) {
          await db.insert(projectWorkspaces).values({
            companyId: input.companyId,
            projectId: project.id,
            name: input.repoUrl
              ? input.repoUrl.split("/").pop()?.replace(".git", "") ?? "workspace"
              : path.basename(input.cwd ?? "workspace"),
            sourceType: input.repoUrl ? "git_repo" : "local_path",
            repoUrl: input.repoUrl ?? null,
            cwd: input.cwd ?? null,
            isPrimary: true,
          });
        }
      }

      // 4. Create Library folder for this project
      await ensureLibraryProjectFolder(input.companyId, projectSlug, db);

      // 5. Create a Goal for this run
      const [goal] = await db
        .insert(goals)
        .values({
          companyId: input.companyId,
          title: runName,
          description: playbook.description,
          level: "team",
          status: "active",
        })
        .returning();

      // 5a. Link goal to project
      try {
        // projects have a goalId field for the primary goal
        await db
          .update(projects)
          .set({ goalId: goal.id, updatedAt: new Date() })
          .where(eq(projects.id, projectId));
      } catch {
        // goalId column may not exist in older schemas, ignore
      }

      // 6. Create the playbook run record
      const [run] = await db
        .insert(playbookRuns)
        .values({
          companyId: input.companyId,
          playbookId: playbook.id,
          goalId: goal.id,
          status: "running",
          totalSteps: steps.length,
          completedSteps: 0,
          triggeredBy: input.triggeredBy,
        })
        .returning();

      // 7. Create issues and run steps for each playbook step
      for (const step of steps) {
        const assignee = resolveAgent(companyAgents, step.assigneeRole);
        const deps = (step.dependsOn as number[]) ?? [];
        const isBlocked = deps.length > 0;
        const issueStatus = isBlocked ? "blocked" : "todo";

        // Create the issue — linked to project, goal, and workspace
        const [issue] = await db
          .insert(issues)
          .values({
            companyId: input.companyId,
            title: `[Step ${step.stepOrder}] ${step.title}`,
            description: buildIssueDescription(step, playbook.name, steps, projectSlug),
            status: issueStatus,
            priority: "medium",
            goalId: goal.id,
            projectId,
            assigneeAgentId: assignee?.id ?? null,
            issueNumber: 0,
          })
          .returning();

        await db.insert(playbookRunSteps).values({
          runId: run.id,
          stepOrder: step.stepOrder,
          title: step.title,
          issueId: issue.id,
          assignedAgentId: assignee?.id ?? null,
          status: isBlocked ? "blocked" : "ready",
          dependsOn: deps,
        });
      }

      // 8. Increment playbook run count
      await db
        .update(playbooks)
        .set({
          runCount: sql`${playbooks.runCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(playbooks.id, playbook.id));

      return {
        run,
        goal,
        projectId,
        stepsCreated: steps.length,
        libraryFolder: `projects/${projectSlug}`,
        warnings,
      };
    },

    /**
     * Check if an issue completion should unblock downstream playbook steps.
     * Call this whenever an issue status changes to "done".
     */
    async onIssueCompleted(issueId: string) {
      const [runStep] = await db
        .select()
        .from(playbookRunSteps)
        .where(eq(playbookRunSteps.issueId, issueId))
        .limit(1);

      if (!runStep) return null;

      // Mark this step as completed
      await db
        .update(playbookRunSteps)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(playbookRunSteps.id, runStep.id));

      // Get all steps in this run
      const allSteps = await db
        .select()
        .from(playbookRunSteps)
        .where(eq(playbookRunSteps.runId, runStep.runId))
        .orderBy(asc(playbookRunSteps.stepOrder));

      // Find which steps can now be unblocked
      const completedOrders = new Set(
        allSteps.filter((s) => s.status === "completed").map((s) => s.stepOrder),
      );
      completedOrders.add(runStep.stepOrder);

      const unblockedStepIds: string[] = [];
      const unblockedIssueIds: string[] = [];

      for (const step of allSteps) {
        if (step.status !== "blocked") continue;
        const deps = (step.dependsOn as number[]) ?? [];
        if (deps.every((d) => completedOrders.has(d))) {
          unblockedStepIds.push(step.id);
          if (step.issueId) unblockedIssueIds.push(step.issueId);
        }
      }

      if (unblockedStepIds.length > 0) {
        await db
          .update(playbookRunSteps)
          .set({ status: "ready" })
          .where(inArray(playbookRunSteps.id, unblockedStepIds));
      }

      if (unblockedIssueIds.length > 0) {
        await db
          .update(issues)
          .set({ status: "todo", updatedAt: new Date() })
          .where(inArray(issues.id, unblockedIssueIds));
      }

      // Update run progress
      const completedCount = allSteps.filter(
        (s) => s.status === "completed" || s.id === runStep.id,
      ).length;
      const runComplete = completedCount >= allSteps.length;

      await db
        .update(playbookRuns)
        .set({
          completedSteps: completedCount,
          ...(runComplete ? { status: "completed", completedAt: new Date() } : {}),
          updatedAt: new Date(),
        })
        .where(eq(playbookRuns.id, runStep.runId));

      // If run is complete, mark goal as achieved
      if (runComplete) {
        const [theRun] = await db
          .select()
          .from(playbookRuns)
          .where(eq(playbookRuns.id, runStep.runId))
          .limit(1);
        if (theRun?.goalId) {
          await db
            .update(goals)
            .set({ status: "achieved", updatedAt: new Date() })
            .where(eq(goals.id, theRun.goalId));
        }
      }

      // Auto-scan library for new files created during this step
      const [theRun2] = await db.select().from(playbookRuns).where(eq(playbookRuns.id, runStep.runId)).limit(1);
      if (theRun2) {
        scanAndRegisterLibraryFiles(theRun2.companyId, issueId, db).catch(() => {});
      }

      return { unblocked: unblockedIssueIds.length, runComplete, completedSteps: completedCount, totalSteps: allSteps.length };
    },

    async getRunWithSteps(runId: string) {
      const [run] = await db.select().from(playbookRuns).where(eq(playbookRuns.id, runId)).limit(1);
      if (!run) return null;
      const steps = await db.select().from(playbookRunSteps).where(eq(playbookRunSteps.runId, runId)).orderBy(asc(playbookRunSteps.stepOrder));
      return { ...run, steps };
    },

    async listRuns(companyId: string, playbookId?: string) {
      const conditions = [eq(playbookRuns.companyId, companyId)];
      if (playbookId) conditions.push(eq(playbookRuns.playbookId, playbookId));
      return db.select().from(playbookRuns).where(and(...conditions)).orderBy(sql`${playbookRuns.startedAt} DESC`).limit(50);
    },
  };
}

/* ─── Library Integration ─────────────────────────────────────────── */

async function ensureLibraryProjectFolder(companyId: string, projectSlug: string, db: Db) {
  const libraryRoot = path.resolve(resolveIronworksInstanceRoot(), "library");
  const projectDir = path.join(libraryRoot, "projects", projectSlug);

  await fs.mkdir(projectDir, { recursive: true });

  // Register in DB
  await db
    .insert(libraryFiles)
    .values({
      companyId,
      filePath: `projects/${projectSlug}`,
      title: projectSlug,
      fileType: "directory",
      visibility: "project",
    })
    .onConflictDoNothing();
}

/**
 * Create a library folder for an agent. Called when agents are hired.
 */
export async function ensureLibraryAgentFolder(companyId: string, agentName: string, db: Db) {
  const libraryRoot = path.resolve(resolveIronworksInstanceRoot(), "library");
  const slug = slugify(agentName);
  const agentDir = path.join(libraryRoot, "agents", slug);
  const dailyDir = path.join(agentDir, "daily");
  const draftsDir = path.join(agentDir, "drafts");

  await fs.mkdir(dailyDir, { recursive: true });
  await fs.mkdir(draftsDir, { recursive: true });

  await db
    .insert(libraryFiles)
    .values({
      companyId,
      filePath: `agents/${slug}`,
      title: agentName,
      fileType: "directory",
      visibility: "private",
    })
    .onConflictDoNothing();
}

/**
 * Create a library folder for a project. Called when projects are created.
 */
export async function ensureLibraryProjectFolderExternal(companyId: string, projectName: string, db: Db) {
  const slug = slugify(projectName);
  await ensureLibraryProjectFolder(companyId, slug, db);
}

/* ─── Helpers ─────────────────────────────────────────────────────── */

/**
 * Scan the library for new/changed files and register them with the issueId that triggered the scan.
 * This connects agent work output to the Library automatically.
 */
async function scanAndRegisterLibraryFiles(companyId: string, issueId: string, db: Db) {
  const libraryRoot = path.resolve(resolveIronworksInstanceRoot(), "library");

  // Get the issue to find its project
  const [issue] = await db.select().from(issues).where(eq(issues.id, issueId)).limit(1);
  if (!issue?.projectId) return;

  // Get the project name to find the library folder
  const [project] = await db.select().from(projects).where(eq(projects.id, issue.projectId)).limit(1);
  if (!project) return;

  const projectSlug = slugify(project.name);
  const projectDir = path.join(libraryRoot, "projects", projectSlug);

  try {
    await fs.access(projectDir);
  } catch {
    return; // Folder doesn't exist yet
  }

  // Scan for files and register any that aren't already in the DB
  const MAX_DEPTH = 5;
  async function walk(dir: string, relBase: string, depth: number) {
    if (depth > MAX_DEPTH) return;
    let dirents;
    try { dirents = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }

    for (const dirent of dirents) {
      if (dirent.name.startsWith(".")) continue;
      const relPath = relBase ? `${relBase}/${dirent.name}` : dirent.name;
      const fullPath = path.join(dir, dirent.name);

      if (dirent.isDirectory()) {
        await walk(fullPath, relPath, depth + 1);
      } else {
        try {
          const stat = await fs.stat(fullPath);
          const filePath = `projects/${projectSlug}/${relPath}`;

          // Upsert into library_files
          const [existing] = await db
            .select({ id: libraryFiles.id })
            .from(libraryFiles)
            .where(and(eq(libraryFiles.companyId, companyId), eq(libraryFiles.filePath, filePath)))
            .limit(1);

          if (!existing) {
            // New file — register with issue link
            let title: string | null = null;
            const ext = dirent.name.split(".").pop()?.toLowerCase();
            if (ext === "md" || ext === "mdx") {
              try {
                const content = await fs.readFile(fullPath, "utf-8");
                const h = /^#\s+(.+)$/m.exec(content);
                if (h) title = h[1].trim();
              } catch { /* skip */ }
            }

            const [file] = await db.insert(libraryFiles).values({
              companyId,
              filePath,
              title,
              fileType: ext ?? null,
              sizeBytes: stat.size,
              visibility: "project",
              projectId: issue.projectId,
            }).returning();

            // Record the event linked to the issue
            await db.insert(libraryFileEvents).values({
              companyId,
              fileId: file.id,
              action: "created",
              agentId: issue.assigneeAgentId ?? null,
              issueId,
              changeSummary: `Created during: ${issue.title}`,
            });
          }
        } catch { continue; }
      }
    }
  }

  await walk(projectDir, "", 0);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "unnamed";
}

function resolveAgent(
  companyAgents: Array<{ id: string; name: string; role: string; title: string | null }>,
  assigneeRole: string | null,
): { id: string; name: string } | null {
  if (!assigneeRole) return null;
  const normalized = assigneeRole.toLowerCase().replace(/[\s_-]/g, "");

  const byName = companyAgents.find((a) => a.name.toLowerCase().replace(/[\s_-]/g, "") === normalized);
  if (byName) return byName;

  const byTitle = companyAgents.find((a) => a.title?.toLowerCase().replace(/[\s_-]/g, "") === normalized);
  if (byTitle) return byTitle;

  const byRole = companyAgents.find((a) => a.role.toLowerCase().replace(/[\s_-]/g, "") === normalized);
  if (byRole) return byRole;

  const partial = companyAgents.find(
    (a) => a.name.toLowerCase().includes(normalized) || (a.title?.toLowerCase().includes(normalized) ?? false),
  );
  return partial ?? null;
}

function buildIssueDescription(
  step: typeof playbookSteps.$inferSelect,
  playbookName: string,
  allSteps: Array<typeof playbookSteps.$inferSelect>,
  projectSlug: string,
): string {
  let desc = "";

  if (step.instructions) {
    desc += step.instructions + "\n\n";
  }

  const deps = (step.dependsOn as number[]) ?? [];
  if (deps.length > 0) {
    const depTitles = deps
      .map((d) => {
        const depStep = allSteps.find((s) => s.stepOrder === d);
        return depStep ? `Step ${d}: ${depStep.title}` : `Step ${d}`;
      })
      .join(", ");
    desc += `**Depends on:** ${depTitles}\n\n`;
  }

  desc += `**Deliverables folder:** \`/library/projects/${projectSlug}/\`\n`;
  desc += `Save all output documents and artifacts to this folder using the naming convention.\n\n`;
  desc += `---\n*Part of playbook: ${playbookName}*`;

  return desc;
}
