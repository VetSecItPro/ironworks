import { agents, companySkills, type Db, heartbeatRuns, issueComments, issues, knowledgePages } from "@ironworksai/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { getObsidianConfigFiles } from "./obsidian-config.js";
import { type RecentRunSummary, renderAgentProfile, slugifyAgentName } from "./render-agent.js";
import { type IndexCounts, renderIndex } from "./render-index.js";
import { renderIssue } from "./render-issue.js";
import { renderKnowledgePage } from "./render-knowledge.js";
import { renderSkill } from "./render-skill.js";

/**
 * Minimal append surface we use against the archive. Matches the subset of
 * `archiver.Archiver` we need (only `append`). Declaring it as an interface
 * decouples the composer from the archiver lib for testing - a unit test
 * can pass a recorder object that captures the path + content stream of
 * each call without spinning up a real zip.
 *
 * The signature deliberately accepts `string | Buffer` because archiver's
 * own typings widen to `Buffer | Readable | string`, and downstream we
 * only emit strings.
 */
export interface VaultArchive {
  append(content: string | Buffer, opts: { name: string }): unknown;
}

export interface ComposerDeps {
  db: Db;
}

export interface ComposeVaultArgs {
  companyId: string;
  companyName: string;
  archive: VaultArchive;
  /** Override the wall-clock used for the index page. Tests pin this so
   *  snapshot-style assertions are deterministic. */
  now?: () => Date;
}

/**
 * Knowledge-pages walk batch size. 200 is the same value the P0/P1 backfill
 * scripts use - large enough to amortize round-trips, small enough that any
 * single batch's worth of `body` text stays well under V8's young-gen limit.
 */
const PAGE_BATCH_SIZE = 200;

/**
 * Recent-runs cap per agent. Matches the spec's "up to 10 most recent". The
 * agent profile is meant to be a quick reference, not a complete history -
 * the run notes themselves live as knowledge_pages and ship via step 1.
 */
const RECENT_RUNS_PER_AGENT = 10;

/**
 * Walk every exportable entity for `companyId` and append it to the
 * provided archive. Caller owns the archive lifecycle (creation +
 * `finalize()`); we only enqueue entries.
 *
 * Order matters: the index page is appended LAST so its counts reflect
 * exactly what was emitted in this run. (We can't pre-count cheaply
 * without paying for COUNT(*) queries - easier to tally during the walk.)
 */
export async function composeVault(deps: ComposerDeps, args: ComposeVaultArgs): Promise<IndexCounts> {
  const { db } = deps;
  const { companyId, companyName, archive } = args;
  const now = args.now ?? (() => new Date());

  let knowledgePagesCount = 0;
  let decisionsCount = 0;

  // 1. Knowledge pages - paged walk by slug. Decisions live as a slug
  //    prefix (`decisions/...`), so we tally them here rather than
  //    re-querying.
  let offset = 0;
  while (true) {
    const batch = await db
      .select()
      .from(knowledgePages)
      .where(eq(knowledgePages.companyId, companyId))
      .orderBy(asc(knowledgePages.slug))
      .limit(PAGE_BATCH_SIZE)
      .offset(offset);
    if (batch.length === 0) break;
    for (const page of batch) {
      const file = renderKnowledgePage(page);
      archive.append(file.content, { name: file.path });
      knowledgePagesCount += 1;
      if (page.slug.startsWith("decisions/")) decisionsCount += 1;
    }
    offset += batch.length;
  }

  // 2. Agent profiles - one query per agent for recent runs. Could be
  //    JOIN'd, but agent counts are small (10s, not 1000s) so per-row is
  //    fine and keeps the SQL legible.
  const agentRows = await db.select().from(agents).where(eq(agents.companyId, companyId)).orderBy(asc(agents.name));

  for (const agent of agentRows) {
    const runRows = await db
      .select({
        id: heartbeatRuns.id,
        startedAt: heartbeatRuns.startedAt,
        finishedAt: heartbeatRuns.finishedAt,
      })
      .from(heartbeatRuns)
      .where(and(eq(heartbeatRuns.companyId, companyId), eq(heartbeatRuns.agentId, agent.id)))
      .orderBy(desc(heartbeatRuns.startedAt))
      .limit(RECENT_RUNS_PER_AGENT);

    const recentRuns: RecentRunSummary[] = runRows.map((r) => ({
      id: r.id,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
    }));

    const file = renderAgentProfile({ agent, recentRuns });
    archive.append(file.content, { name: file.path });
  }

  // 3. Issues - pull each issue's comments + resolve any assigned-agent
  //    slug from the agent rows we already loaded above.
  const agentSlugById = new Map<string, string>();
  for (const agent of agentRows) {
    agentSlugById.set(agent.id, slugifyAgentName(agent.name, agent.id));
  }

  const issueRows = await db
    .select()
    .from(issues)
    .where(eq(issues.companyId, companyId))
    .orderBy(asc(issues.createdAt));

  let issuesCount = 0;
  for (const issue of issueRows) {
    const comments = await db
      .select()
      .from(issueComments)
      .where(eq(issueComments.issueId, issue.id))
      .orderBy(asc(issueComments.createdAt));

    const assignedAgentSlug = issue.assigneeAgentId ? (agentSlugById.get(issue.assigneeAgentId) ?? null) : null;

    const file = renderIssue({ issue, comments, assignedAgentSlug });
    archive.append(file.content, { name: file.path });
    issuesCount += 1;
  }

  // 4. Skills.
  const skillRows = await db
    .select()
    .from(companySkills)
    .where(eq(companySkills.companyId, companyId))
    .orderBy(asc(companySkills.name));

  for (const skill of skillRows) {
    const file = renderSkill(skill);
    archive.append(file.content, { name: file.path });
  }

  // 5. Obsidian config files - fixed content, always emitted so the vault
  //    opens cleanly even when the company is empty.
  for (const file of getObsidianConfigFiles()) {
    archive.append(file.content, { name: file.path });
  }

  // 6. Index page - emitted LAST so the counts are accurate.
  const counts: IndexCounts = {
    knowledgePages: knowledgePagesCount,
    decisions: decisionsCount,
    agents: agentRows.length,
    issues: issuesCount,
    skills: skillRows.length,
  };
  const indexFile = renderIndex({ companyName, generatedAt: now(), counts });
  archive.append(indexFile.content, { name: indexFile.path });

  return counts;
}
