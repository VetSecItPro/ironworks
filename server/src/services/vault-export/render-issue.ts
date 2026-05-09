import type { issueComments, issues } from "@ironworksai/db";
import { type IssueFrontmatter, renderFrontmatter } from "@ironworksai/shared";
import type { RenderedFile } from "./render-knowledge.js";

export type Issue = typeof issues.$inferSelect;
export type IssueComment = typeof issueComments.$inferSelect;

export interface RenderIssueInput {
  issue: Issue;
  comments: IssueComment[];
  /**
   * Slug of the assigned agent. The renderer is pure - the caller resolves
   * `assigneeAgentId` -> agent row -> slug (via `slugifyAgentName`) and
   * passes it in. `null` when unassigned or assigned to a user (vs agent).
   */
  assignedAgentSlug: string | null;
}

/** Same unsafe-char set as render-knowledge / render-agent. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional - strip ASCII control chars from filesystem paths
const UNSAFE_CHARS_RE = /[<>:"\\|?*\x00-\x1f/]/g;

/**
 * Sanitize the path segment portion derived from issue identifier or id.
 * Identifiers are usually shaped like `ENG-123` and are already safe, but
 * we still strip the universal hostile set so a malformed identifier (a
 * data-import edge case) cannot blow up extraction.
 */
function sanitizeSegment(segment: string): string {
  return segment.replace(UNSAFE_CHARS_RE, "_");
}

/**
 * Format a Date for the comment block header. We use the same ISO-8601
 * shape the rest of the export uses so comment timelines sort lexically.
 */
function formatTimestamp(d: Date): string {
  return d.toISOString();
}

/**
 * Quote a comment body line-by-line so the rendered markdown shows the
 * comment as a blockquote - matches Obsidian / GitHub conventions and
 * makes nested comments visually distinct from the issue description.
 * Empty bodies fall back to a single empty quote line so the structure
 * stays parseable.
 */
function blockquote(text: string): string {
  if (text.length === 0) return ">";
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? `> ${line}` : ">"))
    .join("\n");
}

/**
 * Resolve a comment author identity for the inline `[[<author>]]` wikilink.
 * Agent comments link to the agent's slug; user comments use the user-id
 * verbatim (we don't have user slugs in this schema). Anonymous fallback
 * keeps the line valid markdown when both author fields are null.
 */
function authorLabel(comment: IssueComment): string {
  if (comment.authorAgentId) return `agent:${comment.authorAgentId}`;
  if (comment.authorUserId) return `user:${comment.authorUserId}`;
  return "unknown";
}

/**
 * Render an `issues` row + its comments to `issues/<identifier-or-id>.md`.
 * Pure: caller pre-loads comments in the order they want rendered (we
 * render in array order, so chronological is the caller's responsibility).
 */
export function renderIssue(input: RenderIssueInput): RenderedFile {
  const { issue, comments, assignedAgentSlug } = input;

  const fm: IssueFrontmatter = {
    id: issue.id,
    type: "issue",
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    origin_kind: issue.originKind,
    created_at: issue.createdAt.toISOString(),
    updated_at: issue.updatedAt.toISOString(),
  };
  if (issue.identifier) fm.identifier = issue.identifier;
  if (issue.issueNumber !== null && issue.issueNumber !== undefined) fm.issue_number = issue.issueNumber;
  if (issue.projectId) fm.project_id = issue.projectId;
  if (issue.parentId) fm.parent_id = issue.parentId;
  if (issue.assigneeAgentId) fm.assignee_agent_id = issue.assigneeAgentId;
  if (issue.assigneeUserId) fm.assignee_user_id = issue.assigneeUserId;
  if (issue.targetDate) fm.target_date = issue.targetDate.toISOString();
  if (issue.dependsOn && issue.dependsOn.length > 0) fm.depends_on = issue.dependsOn;

  // H1 prefers the human identifier (e.g. "ENG-123: Wire OAuth") so a vault
  // reader scanning headings can find the issue without opening files. Falls
  // back to bare title when no identifier is set (legacy rows).
  const heading = issue.identifier ? `${issue.identifier}: ${issue.title}` : issue.title;

  const lines: string[] = [`# ${heading}`, ""];

  lines.push("## Description", "");
  lines.push(issue.description ?? "_(no description)_", "");

  if (assignedAgentSlug) {
    lines.push(`Assigned: [[${assignedAgentSlug}]]`, "");
  }

  if (comments.length > 0) {
    lines.push("## Comments", "");
    for (const comment of comments) {
      const author = authorLabel(comment);
      const when = formatTimestamp(comment.createdAt);
      lines.push(`[[${author}]] said on ${when}:`, "");
      lines.push(blockquote(comment.body), "");
    }
  }

  const frontmatter = renderFrontmatter(fm);
  const body = lines.join("\n");
  const content = `${frontmatter}\n${body}${body.endsWith("\n") ? "" : "\n"}`;

  // Identifier wins as the path segment because it's stable + human-readable;
  // raw UUID is the safety net for legacy rows that never got an identifier.
  const pathSegment = sanitizeSegment(issue.identifier ?? issue.id);

  return {
    path: `issues/${pathSegment}.md`,
    content,
  };
}
