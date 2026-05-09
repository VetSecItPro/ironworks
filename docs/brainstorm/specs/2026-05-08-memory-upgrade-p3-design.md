# Design Spec: Memory Upgrade Phase 3 — Vault Export Endpoint

**Date:** 2026-05-08
**Approach:** A (walk knowledge_pages + render virtual entities) + archiver streaming + defer P3.2 snapshot cron
**Status:** APPROVED

---

## Problem

Phase 3 of the Memory + Knowledge Layer Upgrade. P0/P1/P2 turned the bulk of the knowledge layer into a connected, semantically-retrievable, periodically-rolled-up corpus. P3 makes that corpus portable: customers can download their entire knowledge base as an Obsidian-compatible vault zip in one click and either browse it locally, archive it, or take it elsewhere.

This is the "no lock-in" guarantee + the practical archival win. It also serves as the foundation for any future stakeholder-portal work (P4 if pursued).

## Goal

After P3:

- `GET /companies/:companyId/vault-export.zip` returns a streaming zip with the full company KB.
- Folder tree mirrors canonical entity types (knowledge / decisions / agents / finance / skills / issues).
- Every `.md` file is canonical-Frontmatter-prefixed (`---\n...\n---`) followed by markdown body — render output is already this shape from P0/P1/P2 work.
- Every `[[wikilink]]` already in page bodies works in Obsidian without modification (slug-based, P1 ensures consistency).
- Optional minimal `.obsidian/app.json` config so the vault opens with sensible defaults.
- Streaming response — does not buffer the whole zip in memory; works for KBs of 10K+ pages.
- Same `assertCompanyAccess` auth as existing portability `/export` endpoint — caller must be a member of the target company.

P3.2 (scheduled snapshot to R2/S3 bucket) is **explicitly deferred** until a customer asks for it. R2 is the target bucket when that work lands; the existing `@aws-sdk/client-s3` dep works against R2 via endpoint override.

## Non-Goals

- ❌ NOT replacing the existing `/api/companies/:id/export` JSON portability endpoint. Both coexist; they serve different purposes (portability bundle vs. vault read-only mirror).
- ❌ NOT supporting partial export (single agent or single project). Full company only. Partial export is a future flag if asked for.
- ❌ NOT building a UI button that triggers the export. Endpoint is sufficient; existing portability UI can add a "Download as Vault" button later. (Out of scope for P3 ship.)
- ❌ NOT round-tripping vault edits back into Postgres. Read-only export only. (Hard constraint per `ironworks-memory-upgrade.md`.)
- ❌ NOT including binary attachments (library files, PDFs) in the vault. The vault is the markdown corpus only; binary asset export is a separate concern.
- ❌ NOT P3.2 (scheduled snapshot cron). Deferred.

## Approach

### High-level architecture

```
GET /api/companies/:companyId/vault-export.zip
    │
    ▼
authMiddleware → assertCompanyAccess
    │
    ▼
vault-export service:
    ┌────────────────────────────────────────┐
    │ 1. Set response headers (Content-Type, │
    │    Content-Disposition: attachment;    │
    │    filename=<companyName>-vault.zip)   │
    └────────────────────────────────────────┘
    ┌────────────────────────────────────────┐
    │ 2. Create archiver instance (zip).     │
    │    Pipe directly into res.             │
    └────────────────────────────────────────┘
    ┌────────────────────────────────────────┐
    │ 3. Stream contents:                    │
    │   a. Walk knowledge_pages → write each │
    │      as `<slug>.md` (folder hierarchy  │
    │      from slug; e.g. agents/foo/runs/  │
    │      2026-05-01/abc12345.md)           │
    │   b. Render agent profiles → virtual   │
    │      `agents/<slug>/profile.md`        │
    │   c. Render issue summaries → virtual  │
    │      `issues/<id>.md`                  │
    │   d. Render skill bodies → virtual     │
    │      `skills/<name>.md`                │
    │   e. Add `.obsidian/app.json` (minimal │
    │      config) + `index.md` (vault root  │
    │      table of contents)                │
    └────────────────────────────────────────┘
    ┌────────────────────────────────────────┐
    │ 4. archive.finalize() → end of stream  │
    └────────────────────────────────────────┘
```

### Why archiver over JSZip

`archiver` streams entries to the HTTP response without buffering the full zip in memory. For a company with 10K knowledge pages averaging 5KB each (~50MB raw), JSZip would buffer the whole 50MB before sending the first byte. archiver streams entries as they're added. ~80KB lib, MIT-licensed, canonical Node choice.

### Why walk knowledge_pages (not regenerate from source tables)

P0/P1/P2 work has already shaped most exportable content as `knowledge_pages` rows:
- Decisions live at `decisions/<id>` (P2)
- Agent run notes at `agents/<slug>/runs/<date>/<id>` (P2)
- Cost rollups at `finance/cost-rollups/<period>/<key>` (P2)
- Authored knowledge at any slug under `knowledge/` (P0)
- All have canonical Frontmatter (P0) and `[[wikilinks]]` parsed by P1

So the export is mostly a `SELECT * FROM knowledge_pages WHERE company_id = $1` walk, writing each row as `<slug>.md` with `renderFrontmatter(fm) + body`. The Frontmatter shape already matches what Obsidian expects.

The handful of non-page entities (agent profiles, issue summaries, skill bodies) need rendering at export time using their canonical Frontmatter types from P0.

### Why defer P3.2

P3.2 (cron snapshot to bucket) requires:
- Per-company bucket configuration (URL + credentials + key prefix)
- New cron in periodic-notes scheduler
- Integration tests with bucket mocks
- R2 endpoint override docs

None of that is useful until a customer says "I want my vault backed up to my bucket every day." Building it now is dead code. The export endpoint (P3.1) is pull-based — customer can curl/script it themselves until then.

When P3.2 lands: ~1 day of work, mostly reuses the renderer + composer we're building now, plus R2 endpoint config and cron registration.

## Architecture

### Components to Create

| Component | Path | Purpose |
|---|---|---|
| Vault export composer | `server/src/services/vault-export/composer.ts` | `composeVault(deps, companyId, archive)` — orchestrates walk + render + archiver.append |
| Knowledge page renderer | `server/src/services/vault-export/render-knowledge.ts` | Convert `knowledge_pages` row → `{ path, content }` with frontmatter + body |
| Agent profile renderer | `server/src/services/vault-export/render-agent.ts` | Convert `agents` row → `agents/<slug>/profile.md` |
| Issue renderer | `server/src/services/vault-export/render-issue.ts` | Convert `issues` row → `issues/<id>.md` |
| Skill renderer | `server/src/services/vault-export/render-skill.ts` | Convert `company_skills` row → `skills/<name>.md` |
| Index renderer | `server/src/services/vault-export/render-index.ts` | Build `index.md` (vault root TOC) |
| Obsidian config | `server/src/services/vault-export/obsidian-config.ts` | Emit minimal `.obsidian/app.json` + `.obsidian/community-plugins.json` (empty) |
| Service entry | `server/src/services/vault-export/index.ts` | Public API: `streamVaultExport(deps, companyId, res)` |
| Tests | `server/src/services/vault-export/__tests__/*.test.ts` (5 files) | Renderer + composer + integration |
| Route integration test | `server/src/__tests__/vault-export-route.test.ts` | E2E: HTTP request, zip extracted, files asserted |

### Components to Modify

| File | What Changes | Why |
|---|---|---|
| `server/src/routes/companies.ts` | Add `GET /:companyId/vault-export.zip` route with `assertCompanyAccess` + streaming response | Surface endpoint |
| `server/package.json` | Add `archiver` + `@types/archiver` | Streaming zip |
| `pnpm-lock.yaml` | Updated by add | Lockfile |
| `CHANGELOG.md` `[Unreleased]` | "Added: GET /api/companies/:id/vault-export.zip emits Obsidian-compatible folder-tree zip with all KB content + agent profiles + issues + skills" | Release trail |
| `docs/OPERATIONS.md` | New section: vault export usage, troubleshooting | Runbook |

### Data Model

No schema changes. Pure read + render.

### API

| Endpoint | Method | Auth | Input | Output |
|---|---|---|---|---|
| `/api/companies/:companyId/vault-export.zip` | GET | `assertCompanyAccess(companyId)` | Path param `:companyId` | Streaming `application/zip`; `Content-Disposition: attachment; filename="<companyName>-vault-<YYYY-MM-DD>.zip"` |

### Folder structure inside zip

```
<CompanyName>-vault/
├── index.md                        ← TOC, links to top-level folders
├── .obsidian/
│   ├── app.json                    ← minimal Obsidian config
│   └── community-plugins.json      ← empty array
├── knowledge/                       ← all knowledge_pages with slug NOT under
│   ├── engineering/                  agents/ decisions/ finance/ etc
│   │   ├── api-conventions.md
│   │   └── error-handling.md
│   └── ...
├── decisions/                       ← knowledge_pages with slug "decisions/*"
│   ├── d-12345.md
│   └── d-67890.md
├── agents/                          ← agents table + their P2 run notes
│   └── <agent-slug>/
│       ├── profile.md               ← virtual, rendered from agents row
│       └── runs/
│           └── 2026-05-01/
│               └── abc12345.md     ← knowledge_pages row
├── finance/                         ← knowledge_pages with slug "finance/*"
│   └── cost-rollups/
│       ├── weekly/
│       │   └── 2026-W18.md
│       └── monthly/
│           └── 2026-04.md
├── issues/                          ← virtual, rendered from issues table
│   ├── ABC-123.md
│   └── ABC-124.md
└── skills/                          ← virtual, rendered from company_skills table
    ├── design-review.md
    └── code-review.md
```

### Dispatching knowledge_pages by slug prefix

```typescript
// composer.ts
async function streamKnowledgePages(deps, companyId, archive) {
  // Page through knowledge_pages in batches of 200 (memory bound)
  let offset = 0;
  while (true) {
    const batch = await deps.db
      .select()
      .from(knowledgePages)
      .where(eq(knowledgePages.companyId, companyId))
      .orderBy(asc(knowledgePages.slug))
      .limit(200)
      .offset(offset);
    if (batch.length === 0) break;
    for (const page of batch) {
      const content = renderKnowledgePage(page);
      // Slug "decisions/foo" lands at "decisions/foo.md"
      // Slug "engineering/api-conventions" lands at "knowledge/engineering/api-conventions.md"
      // Top-level prefixes (decisions, finance, agents, skills, issues) keep their prefix.
      // Other slugs go under "knowledge/".
      const path = pathFromSlug(page.slug);
      archive.append(content, { name: path });
    }
    offset += batch.length;
  }
}
```

### Path mapping rule

```typescript
const TOP_LEVEL_PREFIXES = new Set(["decisions", "agents", "finance", "skills", "issues"]);

function pathFromSlug(slug: string): string {
  const segments = slug.split("/");
  const prefix = segments[0];
  if (TOP_LEVEL_PREFIXES.has(prefix)) {
    return `${slug}.md`;
  }
  return `knowledge/${slug}.md`;
}
```

### Issue rendering

`issues` rows aren't knowledge_pages. The renderer reads each issue with its title + description + status + assignees + comments and produces:

```markdown
---
type: issue
id: <issue.id>
ref: ABC-123
title: <issue.title>
status: <issue.status>
priority: <issue.priority>
assigned_agent_id: <agent.id>
assigned_agent_slug: <agent slug if exists>
created_at: <created_at>
updated_at: <updated_at>
---

# ABC-123: <title>

## Description
<issue.description>

## Comments
[[<comment author slug>]] said on <date>:
> <comment text>
```

If the issue's `assigned_agent_slug` is set, body uses `[[<agent-slug>]]` so the agent profile page shows the issue in its backlinks panel (P1 link parser already handles this for resolved-at-write pages, but the vault export is read-only so the wikilink is just text — Obsidian resolves it natively).

### Agent profile rendering

`agents` rows. Renderer:

```markdown
---
type: agent
id: <agent.id>
slug: <agent.slug>
title: <agent.name>
status: <agent.status>
created_at: <created_at>
---

# <agent.name>

<agent.system_prompt or first 1000 chars of role description>

## Recent Runs
- [[agents/<slug>/runs/2026-05-01/abc12345]]
- [[agents/<slug>/runs/2026-04-30/def56789]]
```

The "Recent Runs" section uses canonical wikilink slugs that resolve in Obsidian to the run-note pages (which are knowledge_pages with the same slugs).

### Skill rendering

`company_skills` rows. Renderer outputs the skill body with frontmatter (id, name, description, capabilities). Skills are typically markdown-shaped already; minimal transformation.

### Index page

`index.md` at vault root. Brief TOC:

```markdown
---
type: index
title: <CompanyName> Vault
generated_at: <ISO instant>
---

# <CompanyName> Knowledge Vault

This vault was exported from Ironworks on <date>.

## Sections
- [[knowledge/]] — Authored knowledge pages
- [[decisions/]] — Logged decisions with backlinks to source
- [[agents/]] — Agent profiles + run histories
- [[issues/]] — Issue records with comments
- [[finance/cost-rollups/]] — Weekly + monthly cost summaries
- [[skills/]] — Skill libraries

## Stats
- Knowledge pages: <count>
- Decisions: <count>
- Agents: <count>
- Issues: <count>
- Generated by Ironworks vault-export
```

### `.obsidian/app.json` minimal config

```json
{
  "useMarkdownLinks": false,
  "newLinkFormat": "shortest",
  "alwaysUpdateLinks": true
}
```

This makes Obsidian honor the `[[slug]]` wikilink format that P1 emits.

## User Flow

1. Customer (board member or operator) calls:
   ```
   curl -H "Authorization: Bearer <token>" \
        -o my-company-vault.zip \
        https://app.ironworks.example/api/companies/<company-id>/vault-export.zip
   ```
2. Server validates auth, asserts company access.
3. Server sets headers: `Content-Type: application/zip`, `Content-Disposition: attachment; filename="<CompanyName>-vault-<YYYY-MM-DD>.zip"`.
4. Server creates archiver, pipes into response, walks tables, appends entries.
5. Customer downloads the zip, unpacks, opens folder in Obsidian.
6. Obsidian renders the vault: graph view shows the link graph, backlinks panel resolves `[[]]` references, search works on bodies.

## Edge Cases

| Case | Behavior |
|---|---|
| Company has zero knowledge pages | Zip still emits index.md + agents/issues/skills (whichever entities exist) + `.obsidian/`. Empty vault is not an error. |
| Company has zero rows in everything | Zip emits just index.md + `.obsidian/`. |
| Company doesn't exist | 404 |
| Caller not a member of company | 403 |
| Page slug contains characters that aren't safe for filesystems | Sanitize: replace `/` segments are fine (used as folder separator); replace any of `\:*?"<>|` with `_`; preserve trailing dots |
| Slug collision after sanitization | Append `-<short-id>` to dedup. Log warning. Should never happen with valid slugs. |
| Page body contains 100KB+ markdown | Pass-through; archiver handles arbitrary entry sizes |
| Archive size > 1GB | archiver streams; no memory pressure. HTTP response just keeps streaming. |
| Network drops mid-stream | Client gets a truncated zip; retry from start. We don't support resumable downloads in this version. |
| Concurrent export requests for same company | Each gets its own archiver; no shared state |
| Aliases on a knowledge page | Frontmatter includes `aliases: [...]`; Obsidian honors them natively for incoming links |
| Agent has no runs | Profile renders without the "Recent Runs" section |
| Issue has thousands of comments | All included; document body grows accordingly |
| Issue with no assigned agent | Frontmatter omits the agent fields; body still renders comments |
| Archive flushed but client cancels | archiver gracefully ends; no partial state in DB |

## Constraints

- Streaming output (no buffering full zip in memory)
- All Frontmatter from canonical types (P0)
- All wikilinks use slug format (P1) — Obsidian-compatible
- `assertCompanyAccess` enforces tenant isolation
- No `as any`
- Tests ship with code (~12-15 new tests)

## Testing Strategy

- **Renderer unit tests:** each renderer produces expected markdown given fixture row inputs (snapshot or string-include).
- **Composer integration:** seed knowledge pages + 1 agent + 1 issue + 1 skill → run composer with a mock archiver → assert `archive.append` called with expected paths + content
- **Path mapping:** unit test for `pathFromSlug` covering all top-level prefix cases + nested cases
- **Route integration:** seed full company → GET `/vault-export.zip` → assert response headers + extract zip in test → walk extracted files → assert structure + counts
- **Auth:** unauthenticated request → 401; cross-tenant → 403; missing company → 404
- **Empty company:** zip still emits index.md + `.obsidian/`

## Rollout

1. Ship `archiver` dep + lockfile update.
2. Ship renderer + composer + service modules + tests (no route yet).
3. Ship route + integration tests.
4. Documentation in CHANGELOG + OPERATIONS.md.
5. Manual smoke test: `curl` on staging, open in Obsidian, verify graph + backlinks render.
6. Ship.

No feature flag — endpoint is additive (new URL, no existing behavior changed).

## Out of Scope (Revisit Later)

- **P3.2 — Scheduled snapshot to R2 bucket.** Tracked as follow-up. R2 is the target when this lands; same code with R2 endpoint override.
- **Partial export** (single agent, single project). Add a query string filter when asked.
- **Binary asset inclusion** (PDFs, images uploaded via library service). Requires content-addressable storage walk + zip-into-vault. Separate concern.
- **UI button** "Download as Vault" on Company Settings page. Trivial follow-up; not blocking.
- **Resumable downloads** (HTTP Range requests on streaming archives). Edge case; not needed for v1.
- **Diff-based exports** (export only what changed since last export). Future feature when snapshot cron lands.
- **Vault import** (upload an Obsidian vault, mount as KB). Anti-recommendation per `ironworks-memory-upgrade.md` (write-side rules out two-way sync).

## Open Questions

None.

---

## Implementation Handoff

Ready for `/subagent-dev docs/brainstorm/specs/2026-05-08-memory-upgrade-p3-design.md`.

Task decomposition:

1. **Add `archiver` + `@types/archiver` dependency** to `server/package.json` + lockfile
2. **Knowledge page + path-mapping renderer** — `render-knowledge.ts` + `pathFromSlug` + tests
3. **Agent profile renderer** — `render-agent.ts` (reads agents table, optionally fetches recent runs from heartbeat_runs) + tests
4. **Issue renderer** — `render-issue.ts` (reads issues + comments) + tests
5. **Skill renderer** — `render-skill.ts` + tests
6. **Index + Obsidian config emitters** — `render-index.ts`, `obsidian-config.ts` + tests
7. **Composer** — `composer.ts` orchestrating all renderers + archiver.append calls + integration tests with mock archiver
8. **Service entry + streaming** — `index.ts` exposing `streamVaultExport(deps, companyId, res)` that creates archiver, pipes to res, calls composer, finalizes
9. **Route** — `GET /:companyId/vault-export.zip` in `routes/companies.ts` + integration tests (unzip + assert files)
10. **CHANGELOG + ops docs**

Total: 10 tasks. Projected ~2-3 days with two-stage review per task. Smaller than P0-P2 because the heavy lifting (Frontmatter shapes, link graph, periodic notes) was done in prior phases.
