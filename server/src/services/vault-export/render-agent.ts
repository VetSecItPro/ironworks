import type { agents } from "@ironworksai/db";
import { type AgentFrontmatter, renderFrontmatter } from "@ironworksai/shared";
import type { RenderedFile } from "./render-knowledge.js";

/**
 * Drizzle-inferred row type for the `agents` table - kept narrow so this
 * module stays decoupled from server-side enrichment objects.
 */
export type Agent = typeof agents.$inferSelect;

/**
 * Subset of a heartbeat run row this renderer needs to emit a "Recent Runs"
 * wikilink list. The caller (export pipeline) is expected to query and pass
 * already-trimmed-to-top-N rows; we render them in the order received.
 */
export interface RecentRunSummary {
  id: string;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface RenderAgentInput {
  agent: Agent;
  recentRuns: RecentRunSummary[];
}

/**
 * Hard cap for the inlined description text. The body of the agent profile
 * is meant to be a quick-reference overview, not the entire system prompt;
 * extremely long prompts (10k+ tokens is common) would bloat the vault and
 * defeat that purpose. 2000 chars matches the spec.
 */
const DESCRIPTION_TRUNCATION_LIMIT = 2000;

/**
 * Convert an agent's display name into a filesystem + wikilink-safe slug.
 * Lower-case, replace any run of non-alphanumerics with a single dash,
 * trim leading/trailing dashes. Names that collapse to empty (all-symbols
 * edge case) fall back to the agent's UUID prefix so the path stays unique.
 */
export function slugifyAgentName(name: string, idFallback: string): string {
  // Note: we intentionally don't pre-strip via UNSAFE_CHARS_RE here - the
  // `[^a-z0-9]+ → -` collapse below already handles every non-alphanumeric
  // (including the unsafe set) by mapping them to dash. Stripping first
  // would silently glue tokens together (`foo:bar` → `foobar` instead of
  // `foo-bar`), which destroys word boundaries the user typed.
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (normalized.length === 0) {
    // Use the leading 8 chars of the UUID - same convention as run-id slugs
    // emitted by P2 - so empty-slug agents still get a deterministic path.
    return idFallback.slice(0, 8);
  }
  return normalized;
}

/**
 * Truncate `text` to at most `limit` characters. Adds an ellipsis marker so
 * a vault reader knows the content was cut, rather than mistaking the end
 * of the file for the end of the prompt.
 */
function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n\n_(truncated)_`;
}

/**
 * Render an `agents` row to `agents/<slug>/profile.md`. Pure: takes the
 * already-loaded agent + a top-N list of recent runs, returns the file. The
 * caller decides how many runs to pass and in what order.
 */
export function renderAgentProfile(input: RenderAgentInput): RenderedFile {
  const { agent, recentRuns } = input;
  const slug = slugifyAgentName(agent.name, agent.id);

  const fm: AgentFrontmatter = {
    id: agent.id,
    type: "agent",
    title: agent.name,
    name: agent.name,
    role: agent.role,
    status: agent.status,
    employment_type: agent.employmentType,
    adapter_type: agent.adapterType,
    created_at: agent.createdAt.toISOString(),
    updated_at: agent.updatedAt.toISOString(),
  };
  if (agent.title) fm.agent_title = agent.title;
  if (agent.reportsTo) fm.reports_to = agent.reportsTo;
  if (agent.department) fm.department = agent.department;

  // Description source-of-truth priority: explicit instructions > system
  // prompt > capabilities blurb. Falls through to empty string when none of
  // them are populated (brand-new seeded agent edge case).
  const description = agent.agentInstructions ?? agent.systemPrompt ?? agent.capabilities ?? "";
  const truncated = truncate(description, DESCRIPTION_TRUNCATION_LIMIT);

  const lines: string[] = [`# ${agent.name}`, ""];
  if (truncated.length > 0) {
    lines.push(truncated, "");
  }

  if (recentRuns.length > 0) {
    lines.push("## Recent Runs", "");
    for (const run of recentRuns) {
      // Date prefix mirrors P2's run-note slug pattern. Prefer finishedAt
      // (the "when did this complete" anchor) and fall back to startedAt;
      // a still-running queued row would use startedAt. Worst case: today.
      const anchor = run.finishedAt ?? run.startedAt ?? new Date();
      const datePart = anchor.toISOString().slice(0, 10);
      const shortId = run.id.slice(0, 8);
      lines.push(`- [[agents/${slug}/runs/${datePart}/${shortId}]]`);
    }
    lines.push("");
  }

  const frontmatter = renderFrontmatter(fm);
  const body = lines.join("\n");
  const content = `${frontmatter}\n${body}${body.endsWith("\n") ? "" : "\n"}`;

  return {
    path: `agents/${slug}/profile.md`,
    content,
  };
}
