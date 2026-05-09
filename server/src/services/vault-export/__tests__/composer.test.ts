/**
 * Composer integration test against an embedded postgres. We use a
 * recording archive (capturing every `append` call) instead of a real
 * archiver so the assertions can inspect path + content directly without
 * unzipping. This is the spec-mandated mock-archiver pattern.
 */

import { randomUUID } from "node:crypto";
import {
  agents,
  companies,
  companySkills,
  createDb,
  getEmbeddedPostgresTestSupport,
  heartbeatRuns,
  issueComments,
  issues,
  knowledgePages,
  startEmbeddedPostgresTestDatabase,
} from "@ironworksai/db";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { composeVault, type VaultArchive } from "../composer.js";

const support = await getEmbeddedPostgresTestSupport();
const describeIfSupported = support.supported ? describe : describe.skip;

if (!support.supported) {
  console.warn(`Skipping composer integration test: ${support.reason ?? "unsupported"}`);
}

interface RecordedEntry {
  path: string;
  content: string;
}

function makeRecorder(): { archive: VaultArchive; entries: RecordedEntry[] } {
  const entries: RecordedEntry[] = [];
  const archive: VaultArchive = {
    append(content, opts) {
      // We only ever feed strings in the composer; the type widens to
      // string | Buffer for archiver-compat, so coerce here for assertions.
      const asString = typeof content === "string" ? content : content.toString("utf8");
      entries.push({ path: opts.name, content: asString });
      return undefined;
    },
  };
  return { archive, entries };
}

describeIfSupported("composeVault", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let companyId!: string;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("ironworks-vault-composer-");
    db = createDb(tempDb.connectionString);
    companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Composer Test Co" });
  }, 120_000);

  afterEach(async () => {
    // Order matters: comments → issues, runs → agents, then the rest.
    await db.delete(issueComments);
    await db.delete(issues);
    await db.delete(heartbeatRuns);
    await db.delete(agents);
    await db.delete(companySkills);
    await db.delete(knowledgePages);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("emits index + obsidian config + every entity for a populated company", async () => {
    // Seed: 5 knowledge pages including 1 decision + 1 cost rollup, 2 agents
    // (one with a heartbeat run), 3 issues with comments, 4 skills.
    await db.insert(knowledgePages).values([
      { id: randomUUID(), companyId, slug: "decisions/d-test", title: "Decision Test", body: "decided." },
      {
        id: randomUUID(),
        companyId,
        slug: "finance/cost-rollups/weekly/2026-W18",
        title: "Weekly cost rollup 2026-W18",
        body: "rollup body",
      },
      { id: randomUUID(), companyId, slug: "engineering/api-conventions", title: "API Conventions", body: "conv" },
      { id: randomUUID(), companyId, slug: "engineering/error-handling", title: "Errors", body: "err" },
      { id: randomUUID(), companyId, slug: "playbooks/onboarding", title: "Onboarding", body: "ob" },
    ]);

    const agentAId = randomUUID();
    const agentBId = randomUUID();
    await db.insert(agents).values([
      { id: agentAId, companyId, name: "Alpha Bot" },
      { id: agentBId, companyId, name: "Beta Bot" },
    ]);

    await db.insert(heartbeatRuns).values({
      id: randomUUID(),
      companyId,
      agentId: agentAId,
      status: "completed",
      startedAt: new Date("2026-05-01T09:00:00Z"),
      finishedAt: new Date("2026-05-01T09:05:00Z"),
    });

    const issue1Id = randomUUID();
    const issue2Id = randomUUID();
    const issue3Id = randomUUID();
    await db.insert(issues).values([
      {
        id: issue1Id,
        companyId,
        title: "Wire OAuth",
        identifier: "ENG-1",
        assigneeAgentId: agentAId,
        createdAt: new Date("2026-05-01T00:00:00Z"),
      },
      {
        id: issue2Id,
        companyId,
        title: "Fix login redirect",
        identifier: "ENG-2",
        createdAt: new Date("2026-05-02T00:00:00Z"),
      },
      {
        id: issue3Id,
        companyId,
        title: "Refactor logger",
        identifier: "ENG-3",
        createdAt: new Date("2026-05-03T00:00:00Z"),
      },
    ]);

    await db.insert(issueComments).values([
      { id: randomUUID(), companyId, issueId: issue1Id, body: "First comment", authorAgentId: agentAId },
      { id: randomUUID(), companyId, issueId: issue1Id, body: "Second comment", authorUserId: "u-1" },
      { id: randomUUID(), companyId, issueId: issue2Id, body: "Triage note" },
    ]);

    await db.insert(companySkills).values([
      { id: randomUUID(), companyId, key: "code-review", slug: "code-review", name: "Code Review", markdown: "# CR" },
      {
        id: randomUUID(),
        companyId,
        key: "design-review",
        slug: "design-review",
        name: "Design Review",
        markdown: "# DR",
      },
      { id: randomUUID(), companyId, key: "qa-pass", slug: "qa-pass", name: "QA Pass", markdown: "# QA" },
      { id: randomUUID(), companyId, key: "perf-audit", slug: "perf-audit", name: "Perf Audit", markdown: "# PA" },
    ]);

    const { archive, entries } = makeRecorder();
    const counts = await composeVault(
      { db },
      {
        companyId,
        companyName: "Composer Test Co",
        archive,
        now: () => new Date("2026-05-08T12:00:00Z"),
      },
    );

    expect(counts).toEqual({
      knowledgePages: 5,
      decisions: 1,
      agents: 2,
      issues: 3,
      skills: 4,
    });

    const paths = entries.map((e) => e.path);

    // Knowledge: decisions/finance keep their prefix; non-prefixed slugs go under knowledge/.
    expect(paths).toContain("decisions/d-test.md");
    expect(paths).toContain("finance/cost-rollups/weekly/2026-W18.md");
    expect(paths).toContain("knowledge/engineering/api-conventions.md");
    expect(paths).toContain("knowledge/engineering/error-handling.md");
    expect(paths).toContain("knowledge/playbooks/onboarding.md");

    // Agents - slugified by name.
    expect(paths).toContain("agents/alpha-bot/profile.md");
    expect(paths).toContain("agents/beta-bot/profile.md");

    // Agent A has a run; profile includes Recent Runs with the run-slug pattern.
    const alphaProfile = entries.find((e) => e.path === "agents/alpha-bot/profile.md");
    expect(alphaProfile?.content).toContain("## Recent Runs");
    expect(alphaProfile?.content).toContain("[[agents/alpha-bot/runs/2026-05-01/");
    // Agent B has no runs - no Recent Runs section.
    const betaProfile = entries.find((e) => e.path === "agents/beta-bot/profile.md");
    expect(betaProfile?.content).not.toContain("## Recent Runs");

    // Issues - by identifier; assigned issue carries the agent slug.
    expect(paths).toContain("issues/ENG-1.md");
    expect(paths).toContain("issues/ENG-2.md");
    expect(paths).toContain("issues/ENG-3.md");
    const eng1 = entries.find((e) => e.path === "issues/ENG-1.md");
    expect(eng1?.content).toContain("Assigned: [[alpha-bot]]");
    expect(eng1?.content).toContain("First comment");
    expect(eng1?.content).toContain("Second comment");

    // Skills.
    expect(paths).toContain("skills/code-review.md");
    expect(paths).toContain("skills/design-review.md");
    expect(paths).toContain("skills/qa-pass.md");
    expect(paths).toContain("skills/perf-audit.md");

    // Obsidian config - always present.
    expect(paths).toContain(".obsidian/app.json");
    expect(paths).toContain(".obsidian/community-plugins.json");

    // Index - last entry, with accurate counts.
    expect(paths.at(-1)).toBe("index.md");
    const indexEntry = entries.find((e) => e.path === "index.md");
    expect(indexEntry?.content).toContain("Knowledge pages: 5");
    expect(indexEntry?.content).toContain("Decisions: 1");
    expect(indexEntry?.content).toContain("Agents: 2");
    expect(indexEntry?.content).toContain("Issues: 3");
    expect(indexEntry?.content).toContain("Skills: 4");
    expect(indexEntry?.content).toContain('title: "Composer Test Co Vault"');
  });

  it("emits only index + obsidian config for an empty company", async () => {
    const { archive, entries } = makeRecorder();
    const counts = await composeVault(
      { db },
      {
        companyId,
        companyName: "Composer Test Co",
        archive,
        now: () => new Date("2026-05-08T00:00:00Z"),
      },
    );

    expect(counts).toEqual({ knowledgePages: 0, decisions: 0, agents: 0, issues: 0, skills: 0 });
    const paths = entries.map((e) => e.path);
    expect(paths.sort()).toEqual([".obsidian/app.json", ".obsidian/community-plugins.json", "index.md"]);
  });

  it("pages through knowledge_pages in batches without dropping rows", async () => {
    // Seed slightly more than one batch (PAGE_BATCH_SIZE=200) to exercise the
    // pagination loop. 250 keeps the test fast (<2s) while crossing the boundary.
    const total = 250;
    const rows = Array.from({ length: total }, (_, i) => ({
      id: randomUUID(),
      companyId,
      // zero-padded so lexical sort matches numeric sort and we can assert order.
      slug: `bulk/page-${String(i).padStart(4, "0")}`,
      title: `Page ${i}`,
      body: "ok",
    }));
    // Insert in chunks to stay under postgres parameter limits.
    for (let i = 0; i < rows.length; i += 100) {
      await db.insert(knowledgePages).values(rows.slice(i, i + 100));
    }

    const { archive, entries } = makeRecorder();
    const counts = await composeVault(
      { db },
      {
        companyId,
        companyName: "Composer Test Co",
        archive,
        now: () => new Date("2026-05-08T00:00:00Z"),
      },
    );

    expect(counts.knowledgePages).toBe(total);
    const knowledgePaths = entries.map((e) => e.path).filter((p) => p.startsWith("knowledge/bulk/"));
    expect(knowledgePaths).toHaveLength(total);
  });
});
