# ADR: Deferred Sec-Ship Audit Findings

**Date:** 2026-05-10 (sweep closed 2026-05-14)
**Status:** ACCEPTED — sweep complete; 3 of 6 closed via batch E, 3 remain deferred with re-confirmed reasoning
**Authors:** Steel Motion
**Related:** `.sec-ship-reports/2026-05-09-comprehensive.md`

---

## Context

The 2026-05-09 comprehensive `/sec-ship` audit produced 29 findings. PRs #191, #192, #193, #194, and the batch-D PR (this one) close 11 of them. The remaining findings are deferred with explicit reasoning rather than silently dropped.

This ADR is the durable record of why each remaining finding is acceptable to defer, what trigger conditions would change that, and the bounded blast radius of each.

## Deferred findings

### SEC-API-HIGH-007 — OpenAPI spec drift

**Finding:** `doc/openapi.yaml` documents 11 routes; the implementation has ~456 routes. Spec covers <3% of attack surface.

**Why defer:**
- The OpenAPI doc was originally a partner-API subset, never a full mirror
- Auto-generating a 456-route spec from existing Express handlers would require non-trivial annotation work (Express has no native OpenAPI emit; would need `@fastify/swagger`-style migration or `tsoa`-style decorators)
- The actual risk addressed by spec-vs-impl diffing (auth-gate drift, response shape leakage) is mitigated by the viewer-write-protection regression test (PR #193) and the explicit per-route auth gates audited in batches A-C

**Trigger conditions to revisit:**
- Customer or partner asks for a complete API reference (commercial trigger)
- A new auth-gate-drift bug surfaces in a route that the regression test doesn't cover
- Decision to migrate from Express to Fastify for other reasons (would unlock auto-emit cheaply)

**Bounded blast radius:**
- The risk this finding represents is "implementation drifts from spec." Since most consumers don't have the spec to begin with, the practical impact is `~0` until customers exist.

### SEC-INFRA-AGENT13-004 — Globally-installed AI CLIs not integrity-verified

**Finding:** `Dockerfile:67` installs `@anthropic-ai/claude-code@2.1.92`, `@openai/codex@0.118.0`, `@google/gemini-cli@0.39.0`, `opencode-ai@0.3.1` via `npm install --global`. Versions are tag-pinned but not integrity-hashed.

**Why defer:**
- npm doesn't have first-class support for `--integrity` on `npm install --global` like pnpm + lockfiles have for project deps
- Computing + maintaining SHA512 hashes manually for these four packages would mean a churn loop on every CLI bump
- These are first-party packages from Anthropic, OpenAI, Google, and a known indie maintainer (opencode-ai). Supply-chain compromise of one of them is a tier-1 industry event, not a routine concern
- Could pin to deeper SHAs via `npm install --package-lock-only` followed by `npm ci --omit=dev`, but the bookkeeping cost is high relative to the marginal hardening for a self-hosted personal-use deployment

**Trigger conditions to revisit:**
- A real incident involving one of these packages (typosquat, takeover, or compromised release)
- Multi-tenant SaaS commercialization where supply-chain attestation matters
- Move to Sigstore / SLSA-style provenance for the whole image

**Mitigation in place:**
- The package versions are pinned in the Dockerfile. Re-pulling the same Dockerfile produces a deterministic version (modulo registry tampering, which is its own tier-1 event).
- Docker image is digest-pinned (this PR), so the *base image* can't shift under us.

### SEC-DEPLOY-005 — `StrictHostKeyChecking=no` on deploy SSH

**Finding:** `.github/workflows/deploy-vps.yml` SSHes with `StrictHostKeyChecking=no` over Tailscale.

**Why defer:**
- The SSH connection runs **inside the Tailscale tailnet**. Trust is established at the WireGuard layer (mutual key auth via Tailscale identity), not at the SSH host-key layer. A man-in-the-middle on this connection would require already having compromised the tailnet.
- The alternative — pinning a known_hosts file in the workflow — adds operational overhead (rotate the key when reprovisioning the VPS, check it into the repo) for marginal hardening *given* the tailnet trust model.
- This is the deploy script's auth pattern, not a customer-facing surface.

**Trigger conditions to revisit:**
- Tailscale itself is compromised at scale
- Move away from Tailscale-routed deploy (e.g., to public-internet SSH) — at that point, `StrictHostKeyChecking=accept-new` + a known_hosts file becomes mandatory

### SEC-PROMPT-INJECTION-RESID-006 — `[CLOSE_ALL_FROM_CHAT]` jailbreak residual

**Finding:** The Telegram bridge's `parseActions` correctly rejects literal action tags injected by users (via `sanitizeUserMessage`). However, a sophisticated user could craft natural-language input that *persuades* the LLM to emit `[CLOSE_ALL_FROM_CHAT]` action tags. The bridge would then execute them.

**Why defer:**
- Bounded blast radius: `[CLOSE_ALL_FROM_CHAT]` only closes issues that THIS chat session created (per-chat ledger via `chatFiledIssues` Map). It does not affect issues created by other channels, other users, or the agent fleet.
- The chat owner is the same actor who could just call `/close all` directly in the chat, so there's no privilege escalation in the residual case.
- Prompt-injection-resistant LLM behavior is an open research problem; a hard mitigation would either (a) require human-in-the-loop confirmation for every `CLOSE_ALL`, breaking UX, or (b) require a separate moderator LLM, doubling LLM cost.

**Trigger conditions to revisit:**
- A real exploit demonstrating `CLOSE_ALL_FROM_CHAT` being used to do something destructive beyond the per-chat ledger
- Multi-tenant deployment where chat sessions span multiple companies (current model is per-company-chat)
- LLM output handling proven untrustworthy in some other dimension (e.g., a `[CREATE_TASK]` tag with crafted body that causes downstream code injection)

### SEC-NPM-CLI-NAMING — Workspace package literally named "cli"

**Finding:** The CLI workspace package's `name` is just `"cli"`, which collides with a public npm package that has had a CVE (`GHSA-6cpc-mj5c-m9rq`). `pnpm audit` reports the CVE as a hit on this package because of the name.

**Why defer:**
- The actual workspace package is internal — it's never published to npm public, only consumed via `pnpm-workspace.yaml`'s linked path
- Renaming to `@ironworksai/cli` would require updating every internal reference (imports, `pnpm --filter` calls, CI/CD pipeline scripts, Dockerfile)
- The audit noise is cosmetic: re-reading the GHSA confirms the CVE is in the unrelated public `cli` package's source code, which we don't import

**Trigger conditions to revisit:**
- Decision to publish the CLI to npm (then naming becomes load-bearing)
- A future CVE on a public package that *also* matches the unscoped name (would compound the audit noise)
- Audit-skip-list bookkeeping becomes a maintenance pain

### SEC-LLM-COST-DOS-004 — Global rate limit too loose for LLM routes

**Finding:** Global rate limit is 600 req/min/IP. Several LLM-calling routes (chat, agent execution) are gated by this loose limit. A single bad client could burn through OpenRouter quota at 600 calls/min, which costs ~$10-40/min depending on model.

**Why defer:**
- Single-tenant personal deployment (current state of SteelMotion). The "single bad client" is the operator themselves; cost-DoS is a self-inflicted-foot-shot, not an attacker concern.
- The Telegram bridge has its own implicit rate limit via Telegram's `getUpdates` polling (~1 message/sec sustained max).
- A proper per-route LLM rate limiter requires distinguishing "LLM-calling" from "non-LLM-calling" routes, which is non-trivial across ~456 routes (most LLM calls are downstream of agent execution, not direct route invocations).

**Trigger conditions to revisit:**
- Multi-tenant deployment where one tenant's runaway can affect another tenant's quota
- Real cost incident showing the rate limit was the bottleneck
- Move to a cost-tracking middleware that emits alerts at threshold
- Customer with a public API that anonymous traffic can hit

**Mitigation in place:**
- OpenRouter account has a hard credit balance ($30 ceiling per the May 2026 audit). A runaway maxes out at $30 of damage before requests start 402'ing.
- The agent fleet's heartbeat cadence is operator-controlled (currently 15 minutes); a runaway requires the operator to misconfigure the heartbeat to 1-second intervals first.

## Consequences

### Accepted

- 6 deferred findings persist as documented technical debt
- Sec-ship will continue to flag these on every comprehensive run; the deferred-with-reason pattern in `.sec-ship-history.json` should suppress re-surfacing them as "new"
- Future audits should re-evaluate against the trigger conditions listed above

### Mitigations

- This ADR is committed to the repo so future maintainers see the decision context
- Every deferred finding has explicit trigger conditions (not just "we don't care")
- Bounded blast radius is documented per-finding so a future incident response can cite this ADR

## Status updates

- **2026-05-10:** Initial ADR. PRs #191-#194 + batch-D close 11 of 29 findings; remaining 18 findings deferred per this document. (Note: 18 includes 6 highlighted here + 12 lower-priority lows that were either already-clean or info-level.)
- **2026-05-14:** Reopened deferred-findings sweep ("batch E").
  - Closed **SEC-DEPLOY-005** via PR #196 — VPS host keys pinned via `VPS_HOST_KEY` repo secret; `StrictHostKeyChecking=yes`.
  - Closed **SEC-API-HIGH-007** via PR #197 — deleted `doc/openapi.yaml`, replaced with `doc/API.md` pointing at the route files as canonical.
  - Closed **SEC-PROMPT-INJECTION-RESID-006** via PR #198 — added `bridge.close_all_invoked` activity-log event that captures the triggering user message + LLM output every time the LLM emits a `CLOSE_ALL_FROM_CHAT` tag. Detection layer on top of the bounded-blast-radius mitigation.
  - Re-evaluated and **kept deferred SEC-LLM-COST-DOS-004** — threat model (single-tenant + $30 OpenRouter ceiling) didn't justify the UX cost of throttling non-LLM traffic. The original ADR reasoning held up under re-examination.
  - Re-evaluated and **kept deferred SEC-INFRA-AGENT13-004** — AI CLI integrity hashing is real but partial protection (registry tampering is its own tier-1 event independent of integrity), and the bookkeeping cost (regenerate lockfile on every CLI version bump) is ongoing. Marginal hardening per hour of work is low. Base image is already digest-pinned and CLI versions are exact-pinned.
  - Re-evaluated and **kept deferred SEC-NPM-CLI-NAMING** — the `pnpm audit` hit on the unscoped `cli` workspace name is cosmetic noise from a name collision with an unrelated public package whose code we don't import. We never publish this workspace publicly. Pure busywork for zero security benefit.
- **2026-05-14 (sweep close):** Final tally — **14 of 29 findings shipped** (11 in batches A-D + 3 in batch E), **3 deferred with re-confirmed reasoning**, **12 originally already-clean or info-level**. The deferred 3 each have explicit trigger conditions in this ADR. No further action items.
