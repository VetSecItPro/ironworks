import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import { agents, approvalComments, approvals, issueComments, issues, knowledgePages, knowledgePageRevisions } from "@ironworksai/db";
import { logger } from "../middleware/logger.js";

// ── Workspace Templates ─────────────────────────────────────────────────────
//
// Each role gets a set of workspace folders created as knowledge_pages with
// document_type = "folder". Slugs follow the pattern: agent-{agentId}-{folder}.

interface WorkspaceTemplate {
  folders: string[];
  descriptions: Record<string, string>;
}

const WORKSPACE_TEMPLATES: Record<string, WorkspaceTemplate> = {
  ceo: {
    folders: ["strategy", "board-decisions", "company-direction"],
    descriptions: {
      strategy: "Strategic plans, vision documents, and OKRs.",
      "board-decisions": "Board-level decisions and rationale.",
      "company-direction": "Quarterly direction docs and pivots.",
    },
  },
  cto: {
    folders: ["architecture", "technical-debt", "engineering-standards"],
    descriptions: {
      architecture: "System architecture docs and ADRs.",
      "technical-debt": "Tech debt inventory and paydown plans.",
      "engineering-standards": "Coding standards and review guidelines.",
    },
  },
  cfo: {
    folders: ["financial-reports", "budget-analysis", "cost-optimization"],
    descriptions: {
      "financial-reports": "Monthly and quarterly financial reports.",
      "budget-analysis": "Budget proposals and variance analysis.",
      "cost-optimization": "Cost reduction recommendations.",
    },
  },
  cmo: {
    folders: ["campaigns", "brand-guidelines", "content-strategy"],
    descriptions: {
      campaigns: "Campaign briefs and results.",
      "brand-guidelines": "Brand voice and visual identity.",
      "content-strategy": "Content calendar and channel strategy.",
    },
  },
  vp_hr: {
    folders: ["personnel", "hiring-plans", "org-proposals"],
    descriptions: {
      personnel: "Personnel files and employee records.",
      "hiring-plans": "Headcount planning and role descriptions.",
      "org-proposals": "Organizational restructure proposals.",
    },
  },
  compliance: {
    folders: ["audit-logs", "compliance-checklists", "incident-response"],
    descriptions: {
      "audit-logs": "Audit findings and reports.",
      "compliance-checklists": "Regulation-specific checklists.",
      "incident-response": "Incident reports and post-mortems.",
    },
  },
  engineer: {
    folders: ["project-notes", "code-reviews", "retrospectives"],
    descriptions: {
      "project-notes": "Per-project technical notes.",
      "code-reviews": "Review notes and feedback.",
      retrospectives: "Sprint and project retrospectives.",
    },
  },
  content: {
    folders: ["content-calendar", "published", "style-guide"],
    descriptions: {
      "content-calendar": "Publishing schedule and topics.",
      published: "Final published content copies.",
      "style-guide": "Writing style reference.",
    },
  },
};

const DEFAULT_TEMPLATE: WorkspaceTemplate = {
  folders: ["notes", "reports"],
  descriptions: {
    notes: "General notes and working documents.",
    reports: "Reports and summaries.",
  },
};

/**
 * Map a role string to a template key. Handles common role variations.
 */
function resolveTemplateKey(role: string): string {
  const normalized = role.toLowerCase().replace(/[\s_-]+/g, "_");

  if (normalized.includes("ceo") || normalized.includes("chief_executive")) return "ceo";
  if (normalized.includes("cto") || normalized.includes("chief_technology")) return "cto";
  if (normalized.includes("cfo") || normalized.includes("chief_financial")) return "cfo";
  if (normalized.includes("cmo") || normalized.includes("chief_marketing")) return "cmo";
  if (normalized.includes("vp") && normalized.includes("hr")) return "vp_hr";
  if (normalized.includes("hr") && (normalized.includes("vice") || normalized.includes("head"))) return "vp_hr";
  if (normalized.includes("compliance") || normalized.includes("audit")) return "compliance";
  if (normalized.includes("engineer") || normalized.includes("developer") || normalized.includes("devops")) return "engineer";
  if (normalized.includes("content") || normalized.includes("marketer") || normalized.includes("writer")) return "content";

  return "default";
}

function getTemplate(role: string): WorkspaceTemplate {
  const key = resolveTemplateKey(role);
  return WORKSPACE_TEMPLATES[key] ?? DEFAULT_TEMPLATE;
}

function makeSlug(agentId: string, folder: string): string {
  // Use first 8 chars of UUID for brevity
  const shortId = agentId.replace(/-/g, "").slice(0, 8);
  return `agent-${shortId}-${folder}`;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Auto-create workspace folder pages when an agent is hired.
 * Each folder becomes a knowledge_page with document_type = "folder".
 */
export async function createAgentWorkspace(
  db: Db,
  agentId: string,
  companyId: string,
  role: string,
): Promise<void> {
  const template = getTemplate(role);

  for (const folder of template.folders) {
    const slug = makeSlug(agentId, folder);
    const title = folder
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    const description = template.descriptions[folder] ?? "";

    // Skip if this folder page already exists (idempotent)
    const [existing] = await db
      .select({ id: knowledgePages.id })
      .from(knowledgePages)
      .where(and(eq(knowledgePages.companyId, companyId), eq(knowledgePages.slug, slug)))
      .limit(1);

    if (existing) continue;

    const body = `# ${title}\n\n${description}`;

    const [page] = await db
      .insert(knowledgePages)
      .values({
        companyId,
        slug,
        title,
        body,
        visibility: "private",
        agentId,
        documentType: "folder",
        autoGenerated: true,
        createdByUserId: "system",
        updatedByUserId: "system",
      })
      .returning();

    await db.insert(knowledgePageRevisions).values({
      pageId: page!.id,
      companyId,
      revisionNumber: 1,
      title,
      body,
      changeSummary: "Workspace folder created automatically",
      editedByUserId: "system",
    });
  }

  logger.info(
    { agentId, companyId, role, folders: template.folders.length },
    "agent workspace created",
  );
}

/**
 * Archive all knowledge pages owned by an agent.
 * Sets visibility to "archived" so they become read-only in the UI.
 */
export async function archiveAgentWorkspace(
  db: Db,
  agentId: string,
): Promise<void> {
  const now = new Date();

  await db
    .update(knowledgePages)
    .set({
      visibility: "archived",
      updatedAt: now,
      updatedByUserId: "system",
    })
    .where(
      and(
        eq(knowledgePages.agentId, agentId),
        // Don't re-archive already archived pages
        isNull(knowledgePages.agentId) ? undefined : eq(knowledgePages.agentId, agentId),
      ),
    );

  logger.info({ agentId }, "agent workspace archived");
}

/**
 * Create a document in an agent's workspace.
 * Returns the created page ID.
 */
export async function createAgentDocument(
  db: Db,
  opts: {
    agentId: string;
    companyId: string;
    title: string;
    content: string;
    documentType: string;
    slug: string;
    department?: string;
    visibility?: string;
    autoGenerated?: boolean;
    createdByAgentId?: string | null;
    createdByUserId?: string | null;
  },
): Promise<string> {
  const {
    agentId,
    companyId,
    title,
    content,
    documentType,
    slug,
    department,
    visibility = "private",
    autoGenerated = false,
    createdByAgentId,
    createdByUserId = "system",
  } = opts;

  // Ensure unique slug
  let finalSlug = slug;
  let suffix = 2;
  while (true) {
    const [existing] = await db
      .select({ id: knowledgePages.id })
      .from(knowledgePages)
      .where(and(eq(knowledgePages.companyId, companyId), eq(knowledgePages.slug, finalSlug)))
      .limit(1);
    if (!existing) break;
    finalSlug = `${slug}-${suffix++}`;
  }

  const [page] = await db
    .insert(knowledgePages)
    .values({
      companyId,
      slug: finalSlug,
      title,
      body: content,
      visibility,
      agentId,
      documentType,
      autoGenerated,
      department: department ?? null,
      createdByAgentId: createdByAgentId ?? null,
      createdByUserId: createdByUserId ?? null,
      updatedByAgentId: createdByAgentId ?? null,
      updatedByUserId: createdByUserId ?? null,
    })
    .returning();

  await db.insert(knowledgePageRevisions).values({
    pageId: page!.id,
    companyId,
    revisionNumber: 1,
    title,
    body: content,
    changeSummary: autoGenerated ? "Auto-generated document" : "Created document",
    editedByAgentId: createdByAgentId ?? null,
    editedByUserId: createdByUserId ?? null,
  });

  return page!.id;
}

/**
 * Create a post-mortem knowledge page linked to an issue.
 * Structured sections: Timeline, Root Cause, Resolution, Prevention.
 */
export async function createPostMortem(
  db: Db,
  opts: {
    companyId: string;
    issueId: string;
    issueTitle: string;
    agentId: string;
    timeline: string;
    rootCause: string;
    resolution: string;
  },
): Promise<void> {
  const { companyId, issueId, issueTitle, agentId, timeline, rootCause, resolution } = opts;

  const body = [
    `# Post-Mortem: ${issueTitle}`,
    "",
    `**Issue:** ${issueId}`,
    `**Date:** ${new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" })}`,
    "",
    "## Timeline",
    timeline,
    "",
    "## Root Cause",
    rootCause,
    "",
    "## Resolution",
    resolution,
    "",
    "## Prevention",
    "- [ ] Add monitoring or alerting for this failure mode",
    "- [ ] Update runbooks or playbooks with new procedures",
    "- [ ] Review and update related agent instructions",
    "- [ ] Schedule follow-up review in 2 weeks",
  ].join("\n");

  const slug = `post-mortem-${issueId.replace(/-/g, "").slice(0, 12)}`;

  await createAgentDocument(db, {
    agentId,
    companyId,
    title: `Post-Mortem: ${issueTitle}`,
    content: body,
    documentType: "post-mortem",
    slug,
    visibility: "company",
    autoGenerated: false,
    createdByAgentId: agentId,
    createdByUserId: null,
  });

  logger.info(
    { companyId, issueId, agentId },
    "created post-mortem knowledge page",
  );
}

/**
 * Create an Architecture Decision Record (ADR) knowledge page.
 */
export async function createDecisionRecord(
  db: Db,
  opts: {
    companyId: string;
    agentId: string;
    title: string;
    context: string;
    decision: string;
    consequences: string;
    status: "proposed" | "accepted" | "deprecated";
  },
): Promise<void> {
  const { companyId, agentId, title, context, decision, consequences, status } = opts;

  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
  const dateStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

  const body = [
    `# ADR: ${title}`,
    "",
    `**Status:** ${statusLabel}`,
    `**Date:** ${dateStr}`,
    "",
    "## Context",
    context,
    "",
    "## Decision",
    decision,
    "",
    "## Consequences",
    consequences,
  ].join("\n");

  const slugBase = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  const slug = `adr-${slugBase}`;

  await createAgentDocument(db, {
    agentId,
    companyId,
    title: `ADR: ${title}`,
    content: body,
    documentType: "decision",
    slug,
    visibility: "company",
    autoGenerated: false,
    createdByAgentId: agentId,
    createdByUserId: null,
  });

  logger.info(
    { companyId, agentId, title, status },
    "created decision record knowledge page",
  );
}

/**
 * Auto-generate a meeting minutes KB page from an approval or issue thread.
 *
 * For approvals: triggers when the approval has 3+ comments/decision notes.
 * For issue threads: triggers when the issue has 5+ comments.
 * Saves the document with document_type "meeting-minutes" to the primary
 * agent's workspace (the requesting agent for approvals, the assignee for issues).
 */
export async function generateMeetingMinutes(
  db: Db,
  opts: {
    companyId: string;
    sourceType: "approval" | "issue_thread";
    sourceId: string;
    title: string;
  },
): Promise<void> {
  const { companyId, sourceType, sourceId, title } = opts;
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

  if (sourceType === "approval") {
    // Load approval + comments
    const [approval] = await db
      .select({
        id: approvals.id,
        type: approvals.type,
        status: approvals.status,
        decisionNote: approvals.decisionNote,
        decidedByUserId: approvals.decidedByUserId,
        decidedAt: approvals.decidedAt,
        requestedByAgentId: approvals.requestedByAgentId,
      })
      .from(approvals)
      .where(and(eq(approvals.id, sourceId), eq(approvals.companyId, companyId)))
      .limit(1);

    if (!approval) {
      logger.warn({ sourceId, companyId }, "approval not found for meeting minutes");
      return;
    }

    const comments = await db
      .select({
        body: approvalComments.body,
        authorAgentId: approvalComments.authorAgentId,
        authorUserId: approvalComments.authorUserId,
        createdAt: approvalComments.createdAt,
      })
      .from(approvalComments)
      .where(eq(approvalComments.approvalId, sourceId))
      .orderBy(asc(approvalComments.createdAt));

    const commentCount = comments.length + (approval.decisionNote ? 1 : 0);
    if (commentCount < 3) {
      logger.debug({ sourceId, commentCount }, "approval does not have enough comments for meeting minutes");
      return;
    }

    // Collect unique participants
    const participantIds = new Set<string>();
    if (approval.requestedByAgentId) participantIds.add(approval.requestedByAgentId);
    for (const c of comments) {
      if (c.authorAgentId) participantIds.add(c.authorAgentId);
    }

    // Resolve participant names
    const participantNames: string[] = [];
    if (participantIds.size > 0) {
      const agentRows = await db
        .select({ id: agents.id, name: agents.name })
        .from(agents)
        .where(and(eq(agents.companyId, companyId)));
      const nameMap = new Map(agentRows.map((a) => [a.id, a.name]));
      for (const id of participantIds) {
        const name = nameMap.get(id);
        if (name) participantNames.push(name);
      }
    }
    if (approval.decidedByUserId && approval.decidedByUserId !== "board") {
      participantNames.push(`User: ${approval.decidedByUserId}`);
    }

    const discussionPoints = comments.map((c, i) => {
      const author = c.authorAgentId
        ? `Agent`
        : c.authorUserId
        ? `User`
        : "Unknown";
      return `${i + 1}. [${author}]: ${c.body.slice(0, 300)}${c.body.length > 300 ? "..." : ""}`;
    });

    const body = [
      `# Meeting Minutes: ${title}`,
      "",
      `**Date:** ${dateStr}`,
      `**Source:** Approval ${sourceId.slice(0, 8)} (${approval.type})`,
      `**Outcome:** ${approval.status}`,
      "",
      "## Participants",
      ...(participantNames.length > 0 ? participantNames.map((n) => `- ${n}`) : ["- Not recorded"]),
      "",
      "## Key Discussion Points",
      ...(discussionPoints.length > 0 ? discussionPoints : ["- No comments recorded"]),
      "",
      "## Decision",
      approval.status === "approved" ? "- Approved" : approval.status === "rejected" ? "- Rejected" : `- Status: ${approval.status}`,
      ...(approval.decisionNote ? [`- Note: ${approval.decisionNote}`] : []),
      "",
      "## Decision Made By",
      approval.decidedByUserId ? `- ${approval.decidedByUserId}` : "- Not recorded",
      ...(approval.decidedAt
        ? [`- Decided at: ${new Date(approval.decidedAt).toLocaleString("en-US", { timeZone: "America/Chicago" })}`]
        : []),
    ].join("\n");

    // Save to requesting agent's workspace
    if (approval.requestedByAgentId) {
      const slugBase = `meeting-minutes-approval-${sourceId.replace(/-/g, "").slice(0, 12)}`;
      await createAgentDocument(db, {
        agentId: approval.requestedByAgentId,
        companyId,
        title: `Meeting Minutes: ${title}`,
        content: body,
        documentType: "meeting-minutes",
        slug: slugBase,
        visibility: "private",
        autoGenerated: true,
        createdByUserId: "system",
      });
      logger.info({ companyId, sourceId, agentId: approval.requestedByAgentId }, "generated approval meeting minutes");
    }
  } else {
    // issue_thread: load issue + comments
    const [issue] = await db
      .select({
        id: issues.id,
        title: issues.title,
        status: issues.status,
        assigneeAgentId: issues.assigneeAgentId,
        priority: issues.priority,
      })
      .from(issues)
      .where(and(eq(issues.id, sourceId), eq(issues.companyId, companyId)))
      .limit(1);

    if (!issue) {
      logger.warn({ sourceId, companyId }, "issue not found for meeting minutes");
      return;
    }

    const comments = await db
      .select({
        body: issueComments.body,
        authorAgentId: issueComments.authorAgentId,
        authorUserId: issueComments.authorUserId,
        createdAt: issueComments.createdAt,
      })
      .from(issueComments)
      .where(eq(issueComments.issueId, sourceId))
      .orderBy(asc(issueComments.createdAt));

    if (comments.length < 5) {
      logger.debug({ sourceId, commentCount: comments.length }, "issue does not have enough comments for meeting minutes");
      return;
    }

    const discussionPoints = comments.map((c, i) => {
      const author = c.authorAgentId ? "Agent" : c.authorUserId ? "User" : "Unknown";
      return `${i + 1}. [${author}]: ${c.body.slice(0, 300)}${c.body.length > 300 ? "..." : ""}`;
    });

    const body = [
      `# Discussion Summary: ${issue.title}`,
      "",
      `**Date:** ${dateStr}`,
      `**Issue:** ${sourceId.slice(0, 8)}`,
      `**Status:** ${issue.status}`,
      `**Priority:** ${issue.priority ?? "unset"}`,
      "",
      "## Discussion Points",
      ...discussionPoints,
      "",
      "## Summary",
      `This issue thread had ${comments.length} comments covering the above discussion points.`,
    ].join("\n");

    if (issue.assigneeAgentId) {
      const slugBase = `meeting-minutes-issue-${sourceId.replace(/-/g, "").slice(0, 12)}`;
      await createAgentDocument(db, {
        agentId: issue.assigneeAgentId,
        companyId,
        title: `Discussion Summary: ${issue.title}`,
        content: body,
        documentType: "meeting-minutes",
        slug: slugBase,
        visibility: "private",
        autoGenerated: true,
        createdByUserId: "system",
      });
      logger.info({ companyId, sourceId, agentId: issue.assigneeAgentId }, "generated issue thread meeting minutes");
    }
  }
}

/**
 * Get all documents for an agent's workspace.
 */
export async function getAgentDocuments(
  db: Db,
  agentId: string,
) {
  return db
    .select()
    .from(knowledgePages)
    .where(eq(knowledgePages.agentId, agentId))
    .orderBy(knowledgePages.updatedAt);
}
