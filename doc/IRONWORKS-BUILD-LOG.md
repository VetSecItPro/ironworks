# Ironworks Build Log — What We Built on Top of Paperclip

> This document tracks all modifications, new features, and integration wiring
> added to the Paperclip fork to create the Ironworks product.
> Use this as the reference when deploying, demoing, or continuing development.

## Origin

- **Forked from:** paperclipai/paperclip
- **Goal:** Internal AI workforce orchestration platform + hosted service offering
- **VPS:** ironworks-vps (76.13.99.74 / 100.93.111.58) — missionreadytech.cloud

---

## New Features Built

### 1. Library (File Explorer + Document Management)
**What:** Two-pane file explorer for browsing, reading, and managing files created by agents.

**Components:**
- `server/src/routes/library.ts` — API endpoints (tree, file, search, scan, register, events)
- `server/src/services/library.ts` — DB service (CRUD, events, contributors)
- `ui/src/pages/Library.tsx` — Two-pane UI (file tree + markdown reader)
- `ui/src/api/library.ts` — Frontend API client
- `ui/src/components/LibrarySettings.tsx` — ACL settings dialog
- `server/src/onboarding-assets/library-naming-policy.md` — Naming convention policy

**DB Tables:** `library_files`, `library_file_events` (migration 0046)

**Features:**
- Filesystem browsing with path sandboxing (no directory traversal)
- Markdown rendering with GFM, mermaid diagrams, syntax highlighting
- Content search (search inside file contents, not just filenames)
- DB-backed metadata: ownership, visibility, edit history, contributors
- ACL settings: default visibility, agent home directories, shared folder write access
- Auto-seeding: directory structure + naming policy created on first boot
- Org-chart-based visibility filtering (CEO sees all, managers see reports' files)

**Integration wiring:**
- Project creation → auto-creates `projects/<name>/` in library
- Agent hire → auto-creates `agents/<name>/daily/` and `agents/<name>/drafts/` in library
- Playbook step completion → auto-scans and registers new library files
- Naming policy referenced in default AGENTS.md for all agents

---

### 2. Playbooks (Multi-Agent Workflow Orchestration)
**What:** Reusable workflow templates that stamp out Goals + Issues with dependencies.

**Components:**
- `server/src/services/playbooks.ts` — CRUD, seed defaults (7 built-in playbooks)
- `server/src/services/playbook-execution.ts` — Execution engine + dependency resolution
- `server/src/routes/playbooks.ts` — API endpoints (CRUD, run, seed, runs tracking)
- `ui/src/pages/Playbooks.tsx` — Two-pane UI (list + step timeline detail)
- `ui/src/components/NewPlaybookDialog.tsx` — Creation dialog (Manual + AI-Assisted)
- `ui/src/api/playbooks.ts` — Frontend API client

**DB Tables:** `playbooks`, `playbook_steps`, `playbook_runs`, `playbook_run_steps` (migrations 0047, 0048)

**7 Seed Playbooks:**
1. New Client Onboarding (6 steps, 5 roles)
2. Security Audit (7 steps, 3 roles)
3. Product Launch (8 steps, 5 roles)
4. Incident Response (6 steps, 4 roles)
5. Content Campaign (7 steps, 3 roles)
6. Weekly Operations Review (5 steps, 2 roles)
7. Lead Generation Funnel (8 steps, 4 roles)

**Execution Engine:**
- "Run Playbook" creates: Project + Goal + Library folder + Issues (all linked)
- Issues get proper dependencies (blocked until prerequisites complete)
- When an issue is marked "done," downstream steps automatically unblock
- When all steps complete, goal auto-achieves and run status → completed
- Optional workspace attachment if repo URL provided

**Validation:**
- Skill check: warns if company is missing required skills for steps
- Budget check: warns at 80% utilization, flags critical at 95%

---

### 3. AI-Assisted Generation
**What:** Natural language → structured playbook generation.

**Components:**
- `server/src/routes/ai-generate.ts` — Generation endpoint
- Frontend wired into NewPlaybookDialog auto mode

**How it works:**
- If `ANTHROPIC_API_KEY` is set: calls Claude Sonnet to generate structured playbook JSON
- Fallback: template-based generation using heuristics (category detection, generic 5-step structure)
- Generated playbook populates the manual form for review/editing before saving

---

### 4. Role Templates & Team Packs
**What:** Pre-built agent roles with complete SOUL.md and AGENTS.md for instant team creation.

**Components:**
- `server/src/onboarding-assets/role-templates.ts` — 8 role templates + 3 team packs
- `server/src/routes/team-templates.ts` — API endpoints for packs and roles
- `ui/src/api/teamTemplates.ts` — Frontend API client

**8 Role Templates:**
CEO, CTO, CMO, VP of HR, Senior Engineer, DevOps Engineer, Security Engineer, Content Marketer

**3 Team Packs:**
- Startup (3 agents: CEO, CTO, Senior Engineer)
- Agency (5 agents: + CMO, Content Marketer)
- Enterprise (8 agents: full C-suite + specialists)

---

### 5. Goal Progress Auto-Calculation
**What:** Goals automatically update their status based on child issue statuses.

**Component:** `server/src/services/goal-progress.ts`

**How:** When any issue status changes, if it has a goalId, the goal's status is recalculated:
- All issues done → goal achieved
- Any in progress → goal active
- All cancelled → goal cancelled

---

### 6. Org-Chart-Based ACLs
**What:** Library visibility filtered by the agent reporting chain.

**Component:** `server/src/services/org-visibility.ts`

**Rules:**
- Board users (humans): see everything
- CEO (reportsTo = null): see everything
- Managers: see company + project + own + direct reports' private files
- ICs: see company + project + own private files only

---

### 7. Routine → Playbook Integration
**What:** Routines can trigger playbooks instead of creating single issues.

**Schema change:** Added `playbookId` column to `routines` table (migration 0049)

**How:** When a routine fires and has `playbookId` set, it calls the playbook execution engine instead of the single-issue creation flow.

---

## Modifications to Existing Code

### Branding
- `ui/src/components/CompanyRail.tsx` — Paperclip icon → Hammer icon
- Routines "Beta" badge removed from sidebar and page

### UI Polish
- `ui/src/components/ui/button.tsx` — All buttons changed to pill-shaped (rounded-full)
- `ui/src/components/Sidebar.tsx` — Added Library + Playbooks nav items

### Bug Fixes
- `server/scripts/dev-watch.ts` — Fixed tsx import path for Node 22+ compatibility
- `ui/src/App.tsx` — Added unprefixed route redirects for /library and /playbooks

### Integration Hooks (in existing routes)
- `server/src/routes/issues.ts` — Added playbook dependency resolution + goal progress recalculation on issue status change
- `server/src/routes/projects.ts` — Added library folder auto-creation on project creation
- `server/src/routes/agents.ts` — Added library folder auto-creation on agent hire
- `server/src/services/routines.ts` — Added playbook execution branch in routine dispatch

---

## Database Migrations Added

| Migration | Tables | Purpose |
|---|---|---|
| 0046 | library_files, library_file_events | Library file registry + edit history |
| 0047 | playbooks, playbook_steps | Playbook templates |
| 0048 | playbook_runs, playbook_run_steps | Playbook execution tracking |
| 0049 | routines (alter) | Add playbookId to routines |
| 0050 | playbook_steps (alter) | Add requiredSkills to playbook steps |

---

## Integration Map (All Connections)

```
Playbooks ──→ Projects (auto-create on run)
Playbooks ──→ Goals (auto-create on run)
Playbooks ──→ Issues (stamp out with dependencies)
Playbooks ──→ Library (auto-create project folder)
Playbooks ──→ Workspaces (attach if repo URL provided)
Playbooks ──→ Skills (validate before run)
Playbooks ──→ Budgets (warn before run)
Projects  ──→ Library (auto-create folder on project creation)
Agents    ──→ Library (auto-create folder on agent hire)
Issues    ──→ Goals (auto-recalculate progress on status change)
Issues    ──→ Playbooks (unblock downstream steps on completion)
Issues    ──→ Library (auto-scan and register files on step completion)
Routines  ──→ Playbooks (can trigger playbook instead of single issue)
Org Chart ──→ Library ACLs (visibility filtering by reporting chain)
```

---

## Files Created (New)

### Server
- `server/src/routes/library.ts`
- `server/src/routes/playbooks.ts`
- `server/src/routes/team-templates.ts`
- `server/src/routes/ai-generate.ts`
- `server/src/services/library.ts`
- `server/src/services/playbooks.ts`
- `server/src/services/playbook-execution.ts`
- `server/src/services/goal-progress.ts`
- `server/src/services/org-visibility.ts`
- `server/src/onboarding-assets/role-templates.ts`
- `server/src/onboarding-assets/library-naming-policy.md`

### Database
- `packages/db/src/schema/library_files.ts`
- `packages/db/src/schema/library_file_events.ts`
- `packages/db/src/schema/playbooks.ts`
- `packages/db/src/schema/playbook_runs.ts`
- `packages/db/src/migrations/0046_married_tattoo.sql`
- `packages/db/src/migrations/0047_steady_firebird.sql`
- `packages/db/src/migrations/0048_cynical_skullbuster.sql`
- `packages/db/src/migrations/0049_flimsy_slayback.sql`
- `packages/db/src/migrations/0050_marvelous_wilson_fisk.sql`

### UI
- `ui/src/pages/Library.tsx`
- `ui/src/pages/Playbooks.tsx`
- `ui/src/api/library.ts`
- `ui/src/api/playbooks.ts`
- `ui/src/api/teamTemplates.ts`
- `ui/src/components/LibrarySettings.tsx`
- `ui/src/components/NewPlaybookDialog.tsx`

### Compliance & Privacy
- `server/src/routes/privacy.ts` — Data export, erasure, retention cleanup, privacy summary
- `ui/src/pages/PrivacySettings.tsx` — Privacy & Data settings page
- `ui/src/pages/PrivacyPolicy.tsx` — Full GDPR/CCPA privacy policy
- `ui/src/components/CookieConsent.tsx` — Cookie consent banner + management dialog
- `ui/src/api/privacy.ts` — Privacy API client

### Costs Page Enhancements
- `server/src/services/equivalent-spend.ts` — Rate card + equivalent spend calculator (25+ models)
- `ui/src/components/NewFinanceEventDialog.tsx` — Finance event creation form
- `ui/src/components/NewBudgetDialog.tsx` — Budget policy creation form (agent/project/company)

### Documentation
- `doc/IRONWORKS-BUILD-LOG.md` (this file)
