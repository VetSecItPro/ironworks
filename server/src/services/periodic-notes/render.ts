/**
 * Pure function renderers for periodic-note markdown bodies.
 *
 * These produce only the markdown body (frontmatter is composed elsewhere).
 * Renderers use [[wikilinks]] for cross-doc references when slugs are provided
 * so backlink graphs (P1) light up.
 *
 * Constraints:
 *   - No I/O, no DB, no logger.
 *   - Locale-agnostic currency formatting (no Intl) for snapshot stability.
 *   - Vanilla markdown only (no HTML, no Dataview-only syntax).
 */

/** ISO instant: YYYY-MM-DDTHH:mm:ssZ (no fractional seconds). */
function fmtInstant(d: Date): string {
  // toISOString -> "2026-05-08T12:34:56.789Z"; strip ms for stability.
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** ISO date: YYYY-MM-DD. */
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Locale-agnostic USD formatter: "$X.XX" (2 decimals). */
function fmtUsd(n: number): string {
  // Round half-away-from-zero behaviour from toFixed is fine for cost display.
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toFixed(2)}`;
}

/** Render a [[wikilink]] when slug is non-null, otherwise the fallback text. */
function wikilinkOr(slug: string | null, fallback: string): string {
  return slug ? `[[${slug}]]` : fallback;
}

// ----------------------------------------------------------------------------
// Run-transcript body
// ----------------------------------------------------------------------------

export interface RunBodyInput {
  agentSlug: string | null;
  agentTitle: string;
  runId: string;
  status: "succeeded" | "failed" | "cancelled" | "timed_out";
  startedAt: Date;
  completedAt: Date;
  costUsd: number | null;
  /** Human-readable issue reference, e.g. "ABC-123". */
  linkedIssueRef: string | null;
  /** Wiki-resolvable slug for backlink. */
  linkedIssueSlug: string | null;
  /** Optional narrative summary text. */
  summary: string | null;
}

export function renderRunBody(input: RunBodyInput): string {
  const lines: string[] = [];

  // Header references the agent (wikilink when slug present).
  const agentRef = input.agentSlug !== null ? `[[${input.agentSlug}|${input.agentTitle}]]` : input.agentTitle;
  lines.push(`# Run \`${input.runId}\` - ${agentRef}`, "");

  // Status section.
  lines.push("## Status", "", `- **Result:** ${input.status}`);
  lines.push(`- **Started:** ${fmtInstant(input.startedAt)}`);
  lines.push(`- **Completed:** ${fmtInstant(input.completedAt)}`);

  // Cost section (only when cost is recorded).
  if (input.costUsd !== null) {
    lines.push("", "## Cost", "", `- **Total:** ${fmtUsd(input.costUsd)}`);
  }

  // Linked issue section (only when there is a reference at all).
  if (input.linkedIssueRef !== null) {
    const link = wikilinkOr(input.linkedIssueSlug, input.linkedIssueRef);
    // When slug present, show "[[slug]] (ABC-123)" so both human ref + wikilink are visible.
    const display = input.linkedIssueSlug !== null ? `${link} (${input.linkedIssueRef})` : input.linkedIssueRef;
    lines.push("", "## Linked Issue", "", `- ${display}`);
  }

  // Summary section (omitted when null).
  if (input.summary !== null) {
    lines.push("", "## Summary", "", input.summary);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

// ----------------------------------------------------------------------------
// Decision body
// ----------------------------------------------------------------------------

export interface DecisionBodyInput {
  decisionId: string;
  rationale: string | null;
  status: "proposed" | "accepted" | "superseded" | "deprecated";
  contextIssueSlug: string | null;
  decidedByAgentSlug: string | null;
  projectSlug: string | null;
  alternatives: string[] | null;
  consequences: string[] | null;
}

export function renderDecisionBody(input: DecisionBodyInput): string {
  const lines: string[] = [];

  lines.push(`# Decision \`${input.decisionId}\``, "");
  lines.push("## Status", "", `- **Status:** ${input.status}`);

  // Context section - list whatever pieces of context exist.
  const contextItems: string[] = [];
  if (input.contextIssueSlug !== null) {
    contextItems.push(`- **Issue:** [[${input.contextIssueSlug}]]`);
  }
  if (input.decidedByAgentSlug !== null) {
    contextItems.push(`- **Decided by:** [[${input.decidedByAgentSlug}]]`);
  }
  if (input.projectSlug !== null) {
    contextItems.push(`- **Project:** [[${input.projectSlug}]]`);
  }
  if (contextItems.length > 0) {
    lines.push("", "## Context", "", ...contextItems);
  }

  if (input.rationale !== null) {
    lines.push("", "## Rationale", "", input.rationale);
  }

  if (input.alternatives !== null && input.alternatives.length > 0) {
    lines.push("", "## Alternatives", "");
    for (const alt of input.alternatives) lines.push(`- ${alt}`);
  }

  if (input.consequences !== null && input.consequences.length > 0) {
    lines.push("", "## Consequences", "");
    for (const c of input.consequences) lines.push(`- ${c}`);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

// ----------------------------------------------------------------------------
// Cost-rollup body
// ----------------------------------------------------------------------------

export interface CostRollupBodyInput {
  granularity: "weekly" | "monthly";
  periodStart: Date;
  periodEnd: Date;
  totalUsd: number;
  byAgent: Array<{ agentSlug: string; totalUsd: number }>;
  byProvider: Array<{ provider: string; totalUsd: number }>;
}

export function renderCostRollupBody(input: CostRollupBodyInput): string {
  const lines: string[] = [];
  const heading = input.granularity === "weekly" ? "Weekly Cost Rollup" : "Monthly Cost Rollup";
  lines.push(`# ${heading}`, "");
  lines.push(`**Period:** ${fmtDate(input.periodStart)} to ${fmtDate(input.periodEnd)}`, "");

  const empty = input.byAgent.length === 0 && input.byProvider.length === 0;
  if (empty) {
    lines.push("No costs recorded for this period.");
    return `${lines.join("\n").trimEnd()}\n`;
  }

  lines.push(`**Total:** ${fmtUsd(input.totalUsd)}`, "");

  if (input.byAgent.length > 0) {
    lines.push("## By Agent", "");
    lines.push("| Agent / Provider | Cost (USD) |", "| --- | --- |");
    for (const row of input.byAgent) {
      lines.push(`| [[${row.agentSlug}]] | ${fmtUsd(row.totalUsd)} |`);
    }
    lines.push("");
  }

  if (input.byProvider.length > 0) {
    lines.push("## By Provider", "");
    lines.push("| Agent / Provider | Cost (USD) |", "| --- | --- |");
    for (const row of input.byProvider) {
      lines.push(`| ${row.provider} | ${fmtUsd(row.totalUsd)} |`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
