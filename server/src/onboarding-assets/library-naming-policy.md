# Ironworks Library — File Naming & Organization Policy

> This is the authoritative naming convention for all files in the company library.
> Every agent MUST read and follow this policy before creating any file.

## File Naming Convention

All files MUST follow this pattern:

```
YYYY-MM-DD-<project-slug>-<purpose>-<author>.<ext>
```

### Components

| Component | Rules | Examples |
|---|---|---|
| **Date** | ISO format, date file was created | `2026-03-30` |
| **Project slug** | Lowercase, hyphens, matches project name | `onboarding`, `rowan-app`, `dfw-ops` |
| **Purpose** | What the file IS (see Purpose Tags below) | `strategy`, `api-design`, `security-audit` |
| **Author** | Agent name, lowercase | `ceo`, `cto`, `securityengineer` |
| **Extension** | File type | `.md`, `.json`, `.yaml` |

### Examples

```
2026-03-30-onboarding-strategy-ceo.md
2026-03-30-rowan-app-api-design-cto.md
2026-03-28-dfw-ops-security-audit-securityengineer.md
2026-03-29-shared-hiring-policy-ceo.md
2026-03-30-shared-weekly-status-report-ceo.md
```

### Purpose Tags

Use these standardized purpose tags. Combine with hyphens for specificity:

| Tag | When to use |
|---|---|
| `strategy` | High-level plans, roadmaps, direction docs |
| `design` | Architecture, system design, technical specs |
| `plan` | Implementation plans, project plans, timelines |
| `audit` | Security audits, code reviews, compliance checks |
| `report` | Status reports, analysis results, summaries |
| `policy` | Policies, SOPs, governance docs |
| `guide` | How-to guides, onboarding docs, runbooks |
| `notes` | Meeting notes, research notes, brainstorms |
| `review` | Code reviews, PR reviews, retrospectives |
| `spec` | API specs, feature specs, requirements |
| `analysis` | Data analysis, market analysis, technical analysis |

Combine for specificity: `api-design`, `security-audit`, `weekly-report`, `hiring-policy`

## Directory Structure

```
/library/
  shared/               <-- Company-wide documents
    policies/           <-- SOPs, governance, conventions
    reports/            <-- Company-wide reports and summaries
    guides/             <-- Onboarding, how-tos, runbooks
  projects/
    <project-slug>/     <-- One directory per project
  agents/
    <agent-name>/       <-- Agent personal workspace
      daily/            <-- Daily notes (YYYY-MM-DD.md)
      drafts/           <-- Work in progress
```

### Where to put files

| File type | Directory | Example |
|---|---|---|
| Company policies, SOPs | `shared/policies/` | `shared/policies/2026-03-30-shared-naming-convention-policy-ceo.md` |
| Company-wide reports | `shared/reports/` | `shared/reports/2026-03-30-shared-weekly-status-report-ceo.md` |
| Guides and runbooks | `shared/guides/` | `shared/guides/2026-03-30-shared-onboarding-guide-ceo.md` |
| Project deliverables | `projects/<slug>/` | `projects/onboarding/2026-03-30-onboarding-strategy-ceo.md` |
| Daily notes | `agents/<name>/daily/` | `agents/ceo/daily/2026-03-30.md` |
| Drafts, WIP | `agents/<name>/drafts/` | `agents/ceo/drafts/2026-03-30-investor-pitch-draft-ceo.md` |

## Rules

1. **Never create a file named just `strategy.md` or `report.md`.** Always include date, project, purpose, and author.
2. **One file, one purpose.** Don't mix a security audit with a design doc.
3. **Date is creation date.** If you revise a file later, keep the original date. Add a `## Revision History` section inside the document.
4. **Shared = company-wide.** Only put files in `shared/` if they apply to the entire company.
5. **Project files stay in the project.** Even if the CEO writes it, if it's for the Rowan App project, it goes in `projects/rowan-app/`.
6. **Daily notes are the exception.** Daily notes use simple `YYYY-MM-DD.md` naming in your agent's daily folder.
7. **Don't duplicate.** Before creating a file, check if one already exists for this purpose. Update the existing file instead.
8. **All markdown files must have a title.** Start every `.md` file with a `# Title` heading.

## Revision History

When updating an existing document, add an entry to the revision history at the bottom:

```markdown
## Revision History

| Date | Author | Change |
|---|---|---|
| 2026-03-30 | CEO | Initial version |
| 2026-04-01 | CTO | Added technical requirements section |
```

## Version Policy

If a document needs a complete rewrite (not just edits), create a new file with `v2` suffix:

```
2026-03-30-onboarding-strategy-ceo.md       <-- original
2026-04-15-onboarding-strategy-v2-ceo.md    <-- major rewrite
```
