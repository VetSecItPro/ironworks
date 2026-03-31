import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import { knowledgePages, knowledgePageRevisions } from "@ironworksai/db";
import { notFound } from "../errors.js";

const MAX_BODY_BYTES = 102_400; // 100KB

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "page";
}

async function ensureUniqueSlug(db: Db, companyId: string, baseSlug: string, excludeId?: string): Promise<string> {
  let slug = baseSlug;
  let suffix = 2;
  while (true) {
    const conditions = [eq(knowledgePages.companyId, companyId), eq(knowledgePages.slug, slug)];
    if (excludeId) conditions.push(sql`${knowledgePages.id} != ${excludeId}`);
    const [existing] = await db.select({ id: knowledgePages.id }).from(knowledgePages).where(and(...conditions)).limit(1);
    if (!existing) return slug;
    slug = `${baseSlug}-${suffix++}`;
  }
}

export interface KnowledgePageInput {
  title: string;
  body?: string;
  visibility?: "company" | "project" | "private";
  projectId?: string | null;
}

export interface KnowledgePageUpdateInput {
  title?: string;
  body?: string;
  visibility?: "company" | "project" | "private";
  projectId?: string | null;
  changeSummary?: string;
}

export function knowledgeService(db: Db) {
  return {
    async list(companyId: string, opts?: { search?: string; visibility?: string }) {
      const conditions = [eq(knowledgePages.companyId, companyId)];
      if (opts?.visibility && opts.visibility !== "all") {
        conditions.push(eq(knowledgePages.visibility, opts.visibility));
      }
      if (opts?.search?.trim()) {
        const q = `%${opts.search.trim()}%`;
        conditions.push(or(ilike(knowledgePages.title, q), ilike(knowledgePages.body, q))!);
      }
      return db
        .select()
        .from(knowledgePages)
        .where(and(...conditions))
        .orderBy(desc(knowledgePages.updatedAt));
    },

    async getById(id: string) {
      const [page] = await db.select().from(knowledgePages).where(eq(knowledgePages.id, id)).limit(1);
      return page ?? null;
    },

    async getBySlug(companyId: string, slug: string) {
      const [page] = await db
        .select()
        .from(knowledgePages)
        .where(and(eq(knowledgePages.companyId, companyId), eq(knowledgePages.slug, slug)))
        .limit(1);
      return page ?? null;
    },

    async create(companyId: string, input: KnowledgePageInput, actor: { agentId?: string; userId?: string }) {
      const body = input.body ?? "";
      if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
        throw new Error("Page body exceeds 100KB limit");
      }

      const slug = await ensureUniqueSlug(db, companyId, slugify(input.title));

      const [page] = await db
        .insert(knowledgePages)
        .values({
          companyId,
          slug,
          title: input.title.trim(),
          body,
          visibility: input.visibility ?? "company",
          projectId: input.projectId ?? null,
          revisionNumber: 1,
          createdByAgentId: actor.agentId ?? null,
          createdByUserId: actor.userId ?? null,
          updatedByAgentId: actor.agentId ?? null,
          updatedByUserId: actor.userId ?? null,
        })
        .returning();

      // Create initial revision
      await db.insert(knowledgePageRevisions).values({
        pageId: page.id,
        companyId,
        revisionNumber: 1,
        title: page.title,
        body: page.body,
        changeSummary: "Created page",
        editedByAgentId: actor.agentId ?? null,
        editedByUserId: actor.userId ?? null,
      });

      return page;
    },

    async update(id: string, input: KnowledgePageUpdateInput, actor: { agentId?: string; userId?: string }) {
      const existing = await this.getById(id);
      if (!existing) throw notFound("Knowledge page not found");

      if (input.body !== undefined && Buffer.byteLength(input.body, "utf8") > MAX_BODY_BYTES) {
        throw new Error("Page body exceeds 100KB limit");
      }

      const nextRevision = existing.revisionNumber + 1;
      const nextTitle = input.title?.trim() ?? existing.title;
      const nextBody = input.body ?? existing.body;
      const nextSlug = input.title ? await ensureUniqueSlug(db, existing.companyId, slugify(nextTitle), id) : existing.slug;

      const [updated] = await db
        .update(knowledgePages)
        .set({
          slug: nextSlug,
          title: nextTitle,
          body: nextBody,
          visibility: input.visibility ?? existing.visibility,
          projectId: input.projectId === undefined ? existing.projectId : input.projectId,
          revisionNumber: nextRevision,
          updatedByAgentId: actor.agentId ?? null,
          updatedByUserId: actor.userId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(knowledgePages.id, id))
        .returning();

      // Create revision record
      await db.insert(knowledgePageRevisions).values({
        pageId: id,
        companyId: existing.companyId,
        revisionNumber: nextRevision,
        title: nextTitle,
        body: nextBody,
        changeSummary: input.changeSummary ?? null,
        editedByAgentId: actor.agentId ?? null,
        editedByUserId: actor.userId ?? null,
      });

      return updated;
    },

    async remove(id: string) {
      const existing = await this.getById(id);
      if (!existing) throw notFound("Knowledge page not found");
      await db.delete(knowledgePages).where(eq(knowledgePages.id, id));
      return existing;
    },

    async listRevisions(pageId: string) {
      return db
        .select()
        .from(knowledgePageRevisions)
        .where(eq(knowledgePageRevisions.pageId, pageId))
        .orderBy(desc(knowledgePageRevisions.revisionNumber));
    },

    async getRevision(pageId: string, revisionNumber: number) {
      const [rev] = await db
        .select()
        .from(knowledgePageRevisions)
        .where(
          and(
            eq(knowledgePageRevisions.pageId, pageId),
            eq(knowledgePageRevisions.revisionNumber, revisionNumber),
          ),
        )
        .limit(1);
      return rev ?? null;
    },

    async revertToRevision(pageId: string, revisionNumber: number, actor: { agentId?: string; userId?: string }) {
      const revision = await this.getRevision(pageId, revisionNumber);
      if (!revision) throw notFound("Revision not found");
      return this.update(pageId, {
        title: revision.title,
        body: revision.body,
        changeSummary: `Reverted to revision #${revisionNumber}`,
      }, actor);
    },

    /** Seed default KB pages for a new company (idempotent). */
    async seedDefaults(companyId: string): Promise<{ seeded: boolean; count: number }> {
      const [existing] = await db
        .select({ id: knowledgePages.id })
        .from(knowledgePages)
        .where(and(eq(knowledgePages.companyId, companyId), eq(knowledgePages.isSeeded, "true")))
        .limit(1);
      if (existing) return { seeded: false, count: 0 };

      const seeds = [
        {
          title: "Welcome to Your Company",
          body: `# Welcome

This is your company's Knowledge Base — a shared wiki for your team of AI agents and human operators.

## What belongs here

- **Company policies** — how your team operates, decision-making frameworks
- **Architecture decisions** — why you chose specific technologies or approaches
- **Process documentation** — step-by-step guides for recurring workflows
- **Onboarding guides** — help new agents get up to speed quickly
- **Meeting notes** — decisions and action items from team discussions

## How to use it

- Click **New Page** to create a page
- Use markdown for formatting
- Link between pages using \`[[Page Name]]\` syntax
- Every edit is saved as a revision — you can always revert

## Who can edit

All agents and board members can read and edit company-visible pages. Use project or private visibility for restricted content.`,
        },
        {
          title: "Team Directory",
          body: `# Team Directory

This page lists your company's agents, their roles, and responsibilities.

## Leadership
- **CEO** — Strategy, goal-setting, client relationships, high-level decisions
- **CTO** — Technical architecture, engineering standards, code quality
- **CMO** — Marketing strategy, content direction, brand management

## Engineering
- **Senior Engineer** — Feature development, code reviews, technical mentorship
- **Security Engineer** — Security audits, vulnerability management, compliance
- **DevOps Engineer** — Infrastructure, CI/CD, monitoring, deployment

## Human Resources
- **VP of HR** — Agent hiring, performance reviews, team composition, onboarding

## Marketing
- **Content Marketer** — Blog posts, social media, email campaigns, SEO

---

*Update this page as you hire new agents or restructure your team.*`,
        },
        {
          title: "How IronWorks Works",
          body: `# How IronWorks Works

IronWorks is your AI workforce orchestration platform. Here's how the key concepts fit together.

## Core Concepts

### Agents
AI agents are your employees. Each has a role, skills, and instructions (SOUL.md + AGENTS.md). They execute tasks autonomously via heartbeat cycles.

### Issues
Tasks assigned to agents. An issue has a status (todo → in_progress → done), priority, and optional project/goal association.

### Projects
Group related issues together. Each project can have multiple agents working on it.

### Goals
High-level objectives that track progress across multiple issues. Goals have target dates and progress bars.

### Playbooks
Reusable multi-step workflows. A playbook defines steps, assigns roles, tracks dependencies, and can include approval gates.

### Routines
Recurring scheduled tasks. Set up triggers (cron schedule or webhook) and routines automatically create issues for agents.

## The Board
You (the human operator) are the Board. You set goals, approve work, manage budgets, and oversee agent performance.

## Key Pages
- **War Room** — Real-time operational dashboard
- **Agent Performance** — Ratings, efficiency, workload distribution
- **Costs** — Token spend and budget tracking
- **Knowledge Base** — This wiki (you're reading it!)`,
        },
      ];

      let count = 0;
      for (const seed of seeds) {
        const slug = slugify(seed.title);
        await db.insert(knowledgePages).values({
          companyId,
          slug,
          title: seed.title,
          body: seed.body,
          visibility: "company",
          isSeeded: "true",
          revisionNumber: 1,
          createdByUserId: "system",
          updatedByUserId: "system",
        });
        count++;
      }

      return { seeded: true, count };
    },
  };
}
