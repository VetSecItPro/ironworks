# ADR: Stakeholder Publish Portal (P4) — Decision Deferred

**Date:** 2026-05-08
**Status:** DECIDED — defer indefinitely; re-evaluate when triggered
**Authors:** Steel Motion
**Related:** `ironworks-memory-upgrade.md` Phase 4

---

## Context

Phase 4 of the Memory + Knowledge Layer Upgrade was originally scoped as a "stakeholder publish portal" — a public-ish read-only website mirroring a curated subset of the company KB for non-Ironworks-users (board members, investors, customer prospects).

Concept:
- Pages tagged `audience: stakeholder` in their canonical Frontmatter (P0) get filtered out of internal browsing.
- Cost rollups + decisions + project status + selected knowledge pages render as a branded static site.
- Internal-only artifacts (agent prompts, raw runs, infrastructure docs, security policies) excluded.
- Authentication: public + slug-obscure URL OR shared link with token; not full SSO.
- Deployment: GitHub Pages or Cloudflare Pages workflow taking the static output.

P0-P3 are now shipped and provide the substrate this would consume:
- P0: canonical Frontmatter (an `audience` field is an additive extension)
- P1: `[[wikilinks]]` for cross-page navigation
- P2: cost rollups + decision pages (the high-value stakeholder content)
- P3: vault export endpoint (could be the source of the static-site build input)
- P3.2: scheduled R2 snapshots (orthogonal — operates on the same data)

## Decision

**Defer P4 implementation indefinitely.** Capture the design intent here so it's not lost. Re-evaluate when one of the trigger conditions below fires.

## Rationale

### Why defer

1. **No stakeholder need exists yet.** Solo-developer + dogfooding-on-personal-deployment scenario at the time of this ADR. Building a portal for an audience that doesn't exist is dead code.
2. **Commercial product strategy may eclipse it.** The `steelmotion.steelmotionllc.ai` deployment will be where the commercial Ironworks dogfoods. If the commercial offering matures into a multi-tenant SaaS where customers want to share board views, P4's value spikes — but the implementation may need to be shaped differently than what the original upgrade doc envisions (per-tenant publish vs. operator-managed publish).
3. **`BoardBriefing.tsx` + the existing UI already cover most internal-board-member needs.** The remaining gap is "show this to someone who doesn't have a login." That's a real but narrow use case.
4. **The vault export from P3.1 already gives manual workarounds.** A board member can be sent a vault zip; they get the same content read-only without a publish portal.
5. **Implementation cost is non-trivial** (~1-2 weeks per the upgrade doc) for a feature with currently zero validated demand.

### Why not scrap entirely

The audience-filtering primitive (frontmatter `audience: stakeholder` + filter middleware on the read paths) is small enough to ship at any time and would unlock the rest of P4 incrementally. But even that is YAGNI until a stakeholder actually exists.

## Trigger conditions for revisiting

Build P4 if any of these fire:

1. **Customer asks for stakeholder/investor view.** Even one customer asking is enough; the feature scales to N customers cheaply.
2. **SteelMotion personal deployment needs a public-facing project page.** If the user wants to publish project status to a public URL (e.g. for the SteelMotion company itself), a small subset of P4 (decisions + cost summary + roadmap) becomes useful immediately.
3. **Commercial product launch readiness checklist requires it.** If the commercial Ironworks ships and "shareable board view" makes the launch checklist, P4 is required.
4. **Compliance / audit requires read-only externally-auditable artifacts.** SOC 2 or similar might demand a stakeholder view of decisions + audit trail; vault export is sufficient for now but a portal could be cleaner.

## Consequences

### Positive

- ~1-2 weeks of engineering time freed up for higher-priority work
- Avoids building a UI affordance that may need to change shape based on actual customer feedback
- Vault export (P3.1) is a working substitute for the immediate use case ("show this to someone who doesn't have a login")
- The substrate (canonical Frontmatter, link graph, cost rollups, decision pages) is in place so when P4 is built, it builds fast — most of the work is already done

### Negative

- No stakeholder audit trail visible without an Ironworks login
- Operator must manually generate + share vault zips when an external party wants visibility
- A "share this dashboard" affordance customers may eventually expect is absent
- The audience-filtering primitive is forgone, so when P4 lands it's a from-scratch decision rather than incremental

### Mitigations

- Vault export (P3.1) covers the manual-share case
- This ADR documents the trigger conditions so the decision can be re-litigated cheaply when one fires
- If a partial step is wanted before full P4, "add `audience: stakeholder` filter to vault export endpoint" is a 2-hour change that gives operators control over what goes into shareable zips

## What P4 would look like if/when built

Scope (from the upgrade doc):

1. **Audience filtering primitive.** Add `audience` field to canonical Frontmatter shapes. Default `internal`. Pages tagged `stakeholder` opt into the publish portal.
2. **Static site builder.** Walks knowledge_pages with `audience: stakeholder`, plus all decision pages, plus cost rollups (always public). Renders to static HTML using a minimal stakeholder-themed template (no React app overhead — read-only).
3. **Hosting.** Cloudflare Pages workflow (R2 already in use per P3.2 — same provider) OR GitHub Pages.
4. **Auth model.** Two options:
   - Slug-obscure URL (security through obscurity, fine for low-stakes board view)
   - Shared link with HMAC-signed token + expiry (better; small infra cost)
5. **Branding.** Per-company theme + logo (`companies.theme` field — already exists for in-app theming, reuse).
6. **Updates.** Re-publish on each P3.2 snapshot tick OR on every relevant page edit (slower but fresher).

Estimated effort: 1-2 weeks if built fresh against the existing P0-P3 substrate. Could be smaller with an off-the-shelf static-site generator (Astro, Eleventy) consuming the vault export as input.

## References

- `ironworks-memory-upgrade.md` (live planning doc)
- `docs/brainstorm/specs/2026-05-08-memory-upgrade-p3-design.md` (P3.1 spec)
- `docs/brainstorm/specs/2026-05-08-memory-upgrade-p3.2-design.md` (P3.2 spec)
- `ui/src/pages/BoardBriefing.tsx` (existing internal stakeholder view)

## Status updates

- **2026-05-08:** Initial ADR. Decision: defer indefinitely. P0-P3 + P3.2 substrate complete; P4 conditions not met.
