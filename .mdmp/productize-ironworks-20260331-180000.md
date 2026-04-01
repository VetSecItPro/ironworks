# MDMP Orders: Productize IronWorks — COA 2

**Classification:** STRATEGIC
**Created:** 2026-03-31 18:00
**Updated:** 2026-03-31 19:30
**Status:** 🟡 AWAITING EXECUTION

---

## Mission Statement

Transform IronWorks from an internal AI workforce orchestration tool into a revenue-generating SaaS product that Steel Motion LLC sells to external customers via the domain ironworksapp.ai, hosted on Contabo VDS infrastructure, with full legal protection, Stripe billing, and per-company scoped access.

## Commander's Intent

Clients buy a subscription, receive an invite link, log into IronWorks at app.ironworksapp.ai, and get the FULL IronWorks experience — War Room, Issues, Goals, Agents, Org Chart, Library, Knowledge Base, Playbooks, Routines, Costs, Agent Performance — all scoped to their company. They enter their own LLM API keys (zero-interest model). Steel Motion administers the platform as instance admin, provisions clients, and never accesses client data except for platform maintenance.

---

## Decision Log

**Selected:** COA 2 — Full IronWorks Access, Scoped by Company

**Key Decisions Made During Planning:**

1. **No separate Client Portal** — clients get the same IronWorks UI as Steel Motion, scoped to their company. Instance-admin features hidden for non-admins.
2. **Zero-interest data processor model** — Steel Motion CAN access client data but contractually commits to NOT accessing it. Client is data controller, Steel Motion is data processor.
3. **BYOK (Bring Your Own Keys)** — clients pay their own LLM costs directly to Anthropic/OpenAI. Steel Motion charges only for the platform.
4. **Per-client Docker containers on Contabo VDS** — each client gets an isolated container with resource limits.
5. **Legal docs built into the platform** — TOS, AUP, DPA, Privacy Policy accessible from app footer and required during onboarding.
6. **One company per subscription** (Starter/Growth), up to 5 for Enterprise.

**Rejected Alternatives:**
- COA 1 (Manual managed service only): No self-serve, doesn't scale
- COA 3 (Per-client VPS instances): Premature infrastructure complexity

---

## Domain & Infrastructure

### Domain: ironworksapp.ai (Hostinger)

| Subdomain | Purpose | Points To |
|---|---|---|
| `ironworksapp.ai` | Landing page (marketing, pricing, legal) | Vercel or Hostinger static |
| `app.ironworksapp.ai` | Client IronWorks instances | Contabo VDS |
| `missionreadytech.cloud` | Steel Motion internal instance | Hostinger VPS (unchanged) |

### Infrastructure: Contabo VDS

**Starting:** Cloud VDS S — $34/mo
- 3 dedicated physical CPU cores (AMD EPYC)
- 24GB dedicated RAM
- 180GB NVMe storage
- Unlimited traffic
- US datacenter (St. Louis — central, low latency coast-to-coast)

**Architecture: SHARED INSTANCE (not per-client containers)**
IronWorks already supports multiple companies in one instance, isolated by company_id at the database level. Each client is a "company" in the same database. No per-client Docker containers needed.

- 1 IronWorks instance = 50-100 clients
- Cost per client: ~$0.50/mo (just DB rows + files)
- Business tier clients who need full isolation get a dedicated instance (custom pricing)

**Scale path:**

| Clients | Infrastructure | Monthly Cost |
|---|---|---|
| 1-50 | VDS M (4 cores, 32GB) — shared instance | $45 |
| 50-100 | VDS M + add RAM if needed | $45-65 |
| 20-30 | VDS L (6 cores, 48GB) | $64 |
| 30-40 | VDS XL (8 cores, 64GB) | $82 |
| 40+ | Dedicated Ryzen 12 or multiple VDS | $96+ |

**Capacity alerts (add capacity when ANY hits):**
- RAM sustained above 80% for 1 hour
- CPU sustained above 70% for 1 hour
- Disk usage above 75%

### Tier Limits (enforced at application level, not container level)

All clients share one IronWorks instance. Limits enforced by the tier-limits middleware.

| Tier | Projects | Storage | Companies | Playbook Runs | KB Pages | Messaging |
|---|---|---|---|---|---|---|
| Trial (14 days) | 1 | 500MB | 1 | 5/mo | 5 | Email |
| Starter ($79/mo) | 5 | 5GB | 1 | 50/mo | 50 | Email + Telegram |
| Growth ($199/mo) | 25 | 15GB | 2 | Unlimited | Unlimited | + Slack + Discord |
| Business ($599/mo) | Unlimited | 50GB | 5 | Unlimited | Unlimited | All 4 |

All tiers: unlimited agents, unlimited users. No seat limits.
No permanent free tier. 14-day trial with Starter features, no credit card required.
After trial: account freezes, data kept 30 days, can upgrade anytime to restore.

---

## Pricing Model: Platform Fee + BYOK

| | Free | Starter | Growth | Business |
|---|---|---|---|---|
| **Monthly** | $0 | $79/mo | $199/mo | $599/mo |
| **Annual** | $0 | $63/mo | $159/mo | $479/mo |
| **Agents** | Unlimited | Unlimited | Unlimited | Unlimited |
| **Projects** | 1 | 5 | 25 | Unlimited |
| **Storage** | 500MB | 5GB | 15GB | 50GB |
| **Companies** | 1 | 1 | 2 | 5 |
| **Playbook Runs** | 5/mo | 50/mo | Unlimited | Unlimited |
| **KB Pages** | 5 | 50 | Unlimited | Unlimited |
| **Messaging** | Email | Email + Telegram | + Slack + Discord | All 4 |
| **Support** | Docs only | Email | Email | Email |

**All tiers:** Unlimited agents. Unlimited users. Client pays their own LLM costs via BYOK.
**Headline:** "Unlimited AI agents. One flat price."
**Messaging platforms supported:** Email, Telegram, Slack, Discord. No WhatsApp, Teams, Signal, or others.
**Support:** Email for all paid tiers. Free tier gets docs only. No SLAs, no phone calls, no dedicated support.
**Revenue math:** 10 Starter clients = $790/mo revenue, $45/mo infrastructure = 94.3% margin.
**Annual discount:** 20% (effectively 2.4 months free). Display as "$63/mo billed annually."

---

## Legal Framework: Zero-Interest Data Processor

### Position
Steel Motion LLC hosts and operates the platform. We do NOT access, use, or monitor client data except to maintain the service. Client is the data controller who owns their data and is responsible for what their agents produce.

### Required Documents

| Document | Content Source | Status |
|---|---|---|
| Terms of Service (TOS) | Modeled after Vercel/Render SaaS TOS | To build |
| Acceptable Use Policy (AUP) | Modeled after Anthropic/Render AUP | To build |
| Privacy Policy | Update existing + add data processor language | To build |
| Data Processing Agreement (DPA) | Standard GDPR/CCPA processor/controller template | To build |
| Service Level Agreement (SLA) | Define uptime commitment + support response | To build |

### 5 Non-Negotiable Clauses

1. **AI-Generated Content Disclaimer** — Client solely responsible for all agent output
2. **Data Processor Status** — Steel Motion = processor, Client = controller
3. **Liability Cap** — Total liability capped at 12 months fees paid
4. **Right to Suspend** — Immediate suspension for AUP violations
5. **BYOK Disclaimer** — Not responsible for third-party AI provider charges or outages

### Safe Harbor Position
- Section 230 protects platforms from third-party content liability
- No pre-screening, monitoring, or endorsement of client content
- Act expeditiously to remove illegal content when notified
- DMCA takedown process for copyright claims

---

## Assumptions & Constraints

### Assumptions
- [ ] Clients will accept the data processor / BYOK model
- [ ] 5-10 initial clients is the target for Phase 1
- [ ] Single Contabo VDS S can handle 10-12 companies
- [ ] Clients bring their own LLM API keys
- [ ] Stripe is the billing provider
- [ ] Legal templates from established SaaS companies are sufficient until lawyer review

### Constraints
- Must not break existing internal use (SteelMotion LLC company on missionreadytech.cloud)
- No dedicated legal counsel yet — docs are templates pending future lawyer review ($500-1K when revenue allows)
- Budget is constrained — phased rollout
- Contabo TOS allows reselling without special agreement (confirmed)

---

## Risk Register

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R1 | Cross-tenant data leak via DB scoping bug | Low | Critical | Write tenant isolation tests before first client |
| R2 | Agent process-level file access across tenants | Medium | High | Per-client Docker containers with filesystem isolation |
| R3 | Runaway costs on client's API key | Medium | High | Mandatory budget caps at company creation |
| R4 | Client generates illegal content via agents | Low | High | AUP + right to suspend + no monitoring = safe harbor |
| R5 | Stripe billing misconfiguration | Low | Medium | Start with manual invoicing, automate later |
| R6 | VDS capacity exceeded | Low | Medium | Monitor RAM/CPU/disk, alert at 80%/70%/75% thresholds |
| R7 | No lawyer review of legal docs | Medium | High | Use industry-standard templates, flag as v0.1 pending review |
| R8 | Instance admin blast radius | Medium | High | Careful admin access, activity logging proves non-access |
| R9 | Data portability (client wants to leave) | Low | Medium | Company export already exists; need import path too |

---

## Phase Dependency Graph

```
Phase 1: Legal Documents          ──┐
  (no dependencies)                 │
                                    ├──→ Phase 6: Footer & Legal Integration
Phase 2: User Invite & Onboarding ─┤       (depends on Phase 1 + Phase 2)
  (no dependencies)                 │
                                    ├──→ Phase 8: Testing & Validation
Phase 3: Permission Scoping ────────┤       (depends on Phase 2 + 3 + 5)
  (no dependencies)                 │
                                    │
Phase 4: HTTPS & Infrastructure ────┼──→ Phase 7: Landing Page
  (no dependencies)                 │       (depends on Phase 4 for DNS/HTTPS)
                                    │
Phase 5: Billing via Stripe ────────┘
  (no dependencies)                      Phase 9: Messaging Integrations
                                           (depends on Phase 2 for onboarding wizard)
                                           (can start after Phase 2 is complete)
```

## Parallelization Guide

**Wave 1 (can all run in parallel — no dependencies):**
- Phase 1: Legal Documents (5 tasks) — pure content, no code deps
- Phase 2: User Invite & Onboarding (5 tasks) — backend + UI
- Phase 3: Permission Scoping (3 tasks) — backend + tests
- Phase 4: HTTPS & Infrastructure (4 tasks) — DevOps, separate from code
- Phase 5: Billing via Stripe (3 tasks) — separate integration

**Wave 2 (depends on Wave 1 outputs):**
- Phase 6: Footer & Legal Integration (2 tasks) — needs Phase 1 pages to link to
- Phase 7: Landing Page (3 tasks) — needs Phase 4 DNS + Phase 5 pricing
- Phase 9: Messaging Integrations (4 tasks) — needs Phase 2 onboarding wizard

**Wave 3 (depends on Wave 1 + 2):**
- Phase 8: Testing & Validation (3 tasks) — needs everything else built first

## Subagent Allocation Plan

When executing, spawn agents as follows:

| Agent | Phases | Runs In | Isolation |
|---|---|---|---|
| Agent A | Phase 1 (Legal docs) | Background | Worktree — pure new pages, no conflicts |
| Agent B | Phase 2 (Onboarding) + Phase 3 (Permissions) | Background | Worktree — modifies auth/access code |
| Agent C | Phase 4 (Infrastructure) | Background | No worktree — SSH/DevOps, not code |
| Agent D | Phase 5 (Billing/Stripe) | Background | Worktree — new service + routes |
| — | Wait for Wave 1 to complete | — | — |
| Agent E | Phase 6 (Footer) + Phase 7 (Landing) | Background | Worktree — UI changes |
| Agent F | Phase 9 (Messaging) | Background | Worktree — new bridge services |
| — | Wait for Wave 2 to complete | — | — |
| Agent G | Phase 8 (Testing) | Foreground | Main branch — validates everything |

**Max parallel agents in Wave 1:** 5 (one per phase)
**Max parallel agents in Wave 2:** 2
**Wave 3:** 1 (sequential, validates everything)

**Merge order:** A → D → B → E → F → G (legal first, then billing, then auth, then UI, then messaging, then tests)

---

## Execution Tasks

### Phase 1: Legal Documents (5 tasks)
_Owner: Product/Legal — Build as pages in IronWorks app_

- [x] **Task 1.1**: Create Terms of Service page
  - Files: `ui/src/pages/TermsOfService.tsx`, route + unprefixed redirect in `App.tsx`
  - Content: Modeled after Vercel/Render TOS — billing, access, liability cap (12mo fees), termination, data ownership, BYOK disclaimer
  - Acceptance: Accessible at `/terms`, linked from footer

- [x] **Task 1.2**: Create Acceptable Use Policy page
  - Files: `ui/src/pages/AcceptableUsePolicy.tsx`, route in `App.tsx`
  - Content: Modeled after Anthropic/Render AUP — prohibited uses (illegal content, copyright infringement, harassment, fraud, malware), client responsible for agent output, right to suspend, no monitoring obligation
  - Acceptance: Accessible at `/aup`, linked from footer

- [x] **Task 1.3**: Update Privacy Policy for multi-tenant
  - Files: `ui/src/pages/PrivacyPolicy.tsx`
  - Content: Add data processor language, company-scoped data handling, data retention policy, data export rights, sub-processor list (Contabo, Stripe)
  - Acceptance: Updated at `/privacy`

- [x] **Task 1.4**: Create Data Processing Agreement page
  - Files: `ui/src/pages/DataProcessingAgreement.tsx`, route in `App.tsx`
  - Content: Steel Motion = processor, Client = controller, data handling obligations, breach notification (72hr), sub-processors, data deletion on termination
  - Acceptance: Accessible at `/dpa`, linked from footer

- [x] **Task 1.5**: Create Service Level Agreement page
  - Files: `ui/src/pages/ServiceLevelAgreement.tsx`, route in `App.tsx`
  - Content: 99.5% uptime target, planned maintenance windows, support response times by tier, incident communication process
  - Acceptance: Accessible at `/sla`, linked from footer

### Phase 2: User Invite & Onboarding (5 tasks)
_Owner: Engineering_

- [x] **Task 2.1**: Build user invite flow
  - Server: email invite endpoint, invite token generation with expiry, invite acceptance with password setup
  - UI: invite acceptance page — set password, see company name
  - Acceptance: Instance admin invites user to company, user receives link, sets password, lands in their company War Room

- [x] **Task 2.2**: Add TOS + AUP acceptance to registration
  - Files: registration/onboarding flow
  - UI: checkbox "I agree to the Terms of Service and Acceptable Use Policy" with links to both
  - Server: store acceptance timestamp + document version in user record
  - Acceptance: Cannot create account without accepting TOS+AUP, acceptance logged

- [x] **Task 2.3**: Zero-knowledge API key onboarding
  - UI: first-login wizard step — "Enter your Anthropic API key" with validation
  - Server: validate key against Anthropic API (test call), save to company-scoped secrets (encrypted)
  - Support: Anthropic + OpenAI key validation
  - Uses existing secrets manager
  - Acceptance: Client enters API key, validates, saves, agents can use it

- [x] **Task 2.4**: Mandatory budget caps at company creation
  - Server: require budget policy when provisioning a client company
  - Default: $500/month for Starter, $2,000/month for Growth, $10,000/month for Enterprise
  - Alert: auto-notify client when 80% of budget consumed (via email or in-app notification)
  - Acceptance: No client company can exist without a budget cap

- [x] **Task 2.5**: Welcome experience for new client users
  - UI: first-login guided tour — 5 steps showing War Room, Issues, Agents, KB, Costs
  - Dismissable, stored in localStorage
  - Contextual: "Create your first issue", "Check your agents", "Read the Knowledge Base"
  - Acceptance: New user sees orientation on first login

### Phase 3: Permission Scoping (3 tasks)
_Owner: Engineering/Security_

- [x] **Task 3.1**: Hide instance-admin UI for non-admin users
  - Files: `Layout.tsx`, `Sidebar.tsx`, instance settings routes
  - Hide: Instance Settings page, company creation, company switcher (show only their company), admin user management
  - Show: Everything company-scoped (War Room, Issues, Goals, Agents, Org Chart, Library, KB, Playbooks, Routines, Costs, Performance, Skills, Activity, Settings)
  - Acceptance: Non-admin user sees full IronWorks scoped to their company, zero instance-admin leakage

- [x] **Task 3.2**: Define client user role permissions
  - Server: use existing `membershipRole` field
  - Roles: "owner" (full access within company), "admin" (full access minus billing), "member" (standard access), "viewer" (read-only)
  - Owner: can manage billing, invite users, configure agents, everything
  - Admin: can configure agents, create issues, manage KB, run playbooks
  - Member: can create issues, comment, edit KB, view everything
  - Viewer: read-only across all pages, can comment on issues
  - Acceptance: Four distinct permission levels enforced in UI and API

- [x] **Task 3.3**: Write tenant isolation tests
  - Tests: company A user cannot see company B's agents, issues, projects, goals, KB pages, costs, activity, secrets
  - Test: API-level cross-tenant access returns 403
  - Test: UI-level company switcher only shows authorized companies
  - Acceptance: Full test suite passes, zero cross-tenant data leaks

### Phase 4: HTTPS & Infrastructure (7 tasks)
_Owner: DevOps_
_NOTE: VDS M recommended over VDS S for growth headroom ($45/mo vs $34/mo). Supports 15-20 clients without migration._

- [ ] **Task 4.1**: Provision Contabo VDS M
  - Order: Cloud VDS M from Contabo US (St. Louis) — 4 dedicated cores, 32GB RAM, 240GB NVMe
  - Setup: Ubuntu 24.04, Docker + Docker Compose, Caddy, SSH keys (deploy key from GitHub Actions)
  - Configure: firewall (ufw), fail2ban, automatic security updates
  - Install: Beszel agent for monitoring
  - **REQUIRES:** Contabo account ($45/mo)
  - Acceptance: VDS accessible via SSH, Docker running, Beszel agent reporting

- [ ] **Task 4.2**: Enable HTTPS with auto-TLS via Caddy
  - Configure: app.ironworksapp.ai with automatic Let's Encrypt certificate
  - Caddy reverse proxy: route *.app.ironworksapp.ai to correct Docker container
  - Wildcard cert or per-subdomain cert for client isolation
  - **REQUIRES:** ironworksapp.ai DNS configured (A record for app subdomain → VDS IP)
  - Acceptance: `https://app.ironworksapp.ai` serves IronWorks with valid cert

- [ ] **Task 4.3**: Set up automated backups
  - Configure rclone to backup to Google Drive or S3-compatible storage
  - Schedule: daily backup at 3 AM CT, 30-day retention
  - Backup scope: all client databases + library files + secrets (encrypted)
  - Restore test: verify backup can be restored to a fresh container
  - **REQUIRES:** Google Drive or S3-compatible storage account (free tier sufficient)
  - Acceptance: Backups run automatically, verified restore tested

- [ ] **Task 4.4**: Deploy Beszel monitoring hub
  - Install Beszel hub on the VDS (lightweight, ~15MB RAM)
  - Web dashboard accessible at a protected URL (e.g., monitor.ironworksapp.ai)
  - Configure per-container monitoring (auto-discovers Docker containers)
  - **REQUIRES:** Nothing — Beszel is free, self-hosted, open-source
  - Acceptance: Web dashboard shows CPU/RAM/disk for server + all containers

- [ ] **Task 4.5**: Configure monitoring alerts
  - Beszel alerts for:
    - CPU sustained above 70% for 15 minutes → Email + Telegram
    - RAM above 80% → Email + Telegram
    - Disk above 75% → Email + Telegram
    - Any container down → Email + Telegram (immediate)
  - UptimeRobot external ping:
    - Monitor health endpoint every 5 minutes
    - Alert on downtime → Email + Telegram
  - **REQUIRES:** UptimeRobot free account (50 monitors), Telegram bot token for notifications
  - Acceptance: Test alerts fire correctly, receive notifications on phone

- [ ] **Task 4.6**: Build capacity planning API
  - Server endpoint: GET /admin/capacity (instance admin only)
  - Returns: total containers, resources used/available, per-container stats, recommendation
  - Logic: calculate max clients based on tier mix and remaining resources
  - Alert: auto-log activity when capacity exceeds 75%
  - Acceptance: /admin/capacity returns accurate data, tested with multiple containers

- [ ] **Task 4.7**: Build client provisioning script
  - Script: provision-client.sh --name "acme" --tier starter
  - Creates: Docker Compose file with tier-appropriate resource limits
  - Creates: data directory with correct permissions
  - Adds: Caddy reverse proxy entry for client subdomain
  - Starts: container and verifies health check
  - **Resource limits per tier:**
    - Starter: 0.5 CPU limit / 0.25 reserved, 2GB RAM limit / 1GB reserved, 15GB disk
    - Growth: 1.0 CPU limit / 0.5 reserved, 4GB RAM limit / 2GB reserved, 25GB disk
    - Enterprise: 2.0 CPU limit / 1.0 reserved, 8GB RAM limit / 4GB reserved, 50GB disk
  - Acceptance: Script provisions a new client container that is accessible via HTTPS and monitored by Beszel

### Phase 5: Billing via Polar (3 tasks)
_Owner: Engineering/Product_
_NOTE: Switched from Stripe to Polar (Merchant of Record). Polar handles all tax/VAT/compliance._

- [x] **Task 5.1**: Integrate Polar Checkout for subscriptions
  - Server: Polar webhook handler for subscription lifecycle events (checkout.created, subscription.active, subscription.updated, subscription.canceled, subscription.revoked)
  - Tiers: Free ($0), Starter ($79/mo), Growth ($199/mo), Business ($599/mo)
  - Store: polar_subscription_id, plan_tier, status on company record
  - **REQUIRES:** Polar account (free to create, 4% + 40c per transaction)
  - Acceptance: Client subscribes via Polar Checkout, subscription status reflected in IronWorks

- [ ] **Task 5.2**: Enforce tier limits
  - Server: check project count / storage / company count against subscription tier
  - UI: show upgrade prompt when limit reached
  - Grace: don't delete data if limit exceeded, just prevent new creation
  - Acceptance: Starter client cannot create 6th project, gets upgrade prompt

- [ ] **Task 5.3**: Subscription management in Settings
  - UI: current plan display, usage vs limits, upgrade/downgrade button
  - Server: Stripe Customer Portal link for self-serve billing management
  - Show: next billing date, payment method, invoice history
  - Acceptance: Client can view plan, manage billing, download invoices

### Phase 6: Footer & Legal Integration (2 tasks)
_Owner: Engineering/UX_

- [ ] **Task 6.1**: Update footer with all legal links
  - Files: `Layout.tsx`
  - Add: Terms, AUP, DPA, SLA links alongside existing Privacy and Cookie Settings
  - Acceptance: Footer shows all legal document links for logged-in and logged-out states

- [ ] **Task 6.2**: Create `/legal` index page
  - Files: new `LegalIndex.tsx`, route in `App.tsx`
  - Content: organized list of all legal documents with brief descriptions and last-updated dates
  - Mark all docs as "v0.1 — pending legal review"
  - Acceptance: `/legal` shows all docs, accessible without login

### Phase 7: Landing Page (3 tasks)
_Owner: Marketing/Engineering_

- [ ] **Task 7.1**: Build landing page at ironworksapp.ai
  - Tech: Next.js on Vercel (free tier) or static HTML on Hostinger
  - Sections: Hero with War Room screenshot, 3 key features, pricing table, CTA, footer with legal links
  - Acceptance: Landing page live at ironworksapp.ai

- [ ] **Task 7.2**: Build pricing page
  - Show 3 tiers with feature comparison table
  - CTA: "Get Started" links to Stripe Checkout or "Book a Demo" for Enterprise
  - Acceptance: Clear pricing visible, CTAs work

- [ ] **Task 7.3**: Connect domain DNS
  - Configure: ironworksapp.ai A record to Vercel/Hostinger
  - Configure: app.ironworksapp.ai CNAME to Contabo VDS
  - SSL: auto-provisioned by Caddy (app) and Vercel (landing)
  - Acceptance: Both domains resolve and serve HTTPS

### Phase 8: Testing & Validation (3 tasks)
_Owner: QA_

- [ ] **Task 8.1**: End-to-end client onboarding test
  - Test: receive invite → accept → accept TOS/AUP → enter API key → see War Room → create issue → assign agent
  - Acceptance: Full flow works without errors

- [ ] **Task 8.2**: Permission boundary test
  - Test: client user cannot access instance settings, other companies, admin-only features
  - Test: viewer role cannot create issues or modify agents
  - Acceptance: All unauthorized access returns 403 or redirects

- [ ] **Task 8.3**: Billing lifecycle test
  - Test: subscribe → use platform → hit tier limit → upgrade → downgrade → cancel → access revoked
  - Acceptance: Subscription changes reflect correctly in IronWorks access and tier limits

### Phase 9: Messaging Integrations (4 tasks)
_Owner: Engineering — Post-launch enhancement, strong differentiator_

**Supported platforms (final):** Email, Telegram, Slack, Discord. Nothing else.
**Launch with:** Email (automatic) + Telegram (paste one token)
**Add after launch:** Slack + Discord (one-click OAuth)

- [ ] **Task 9.1**: Auto-configured email bridge
  - Setup: inbound email address per company — `ceo@{company-slug}.ironworksapp.ai`
  - Client emails the address, it creates an Issue assigned to CEO agent
  - Agent response sent back as email reply
  - **REQUIRES:** Mailgun or SendGrid account + MX/DNS records on ironworksapp.ai (see Third-Party Dependencies)
  - Acceptance: Client sends email, gets agent response back via email

- [ ] **Task 9.2**: Telegram bridge auto-provisioning
  - Extend existing `telegram-bridge/bot.mjs` to support multi-tenant (one bot per company)
  - Onboarding wizard step: "Paste your Telegram bot token" with link to @BotFather instructions
  - Server: store token in company secrets, spin up bridge process per company
  - **REQUIRES:** Nothing from Steel Motion — each client creates their own bot via @BotFather (free)
  - Acceptance: Client pastes token in onboarding, bridge starts, messages route to CEO agent

- [ ] **Task 9.3**: Slack integration (one-click OAuth)
  - Build: "Add to Slack" OAuth flow
  - Client clicks button, selects workspace, authorizes
  - Bot joins default channel, routes messages to CEO agent via Issues API
  - **REQUIRES:** Create a Slack App in Slack Developer Portal (one-time Steel Motion setup, free). Need OAuth redirect URL, bot token scopes (chat:write, channels:history, channels:read)
  - Acceptance: Client clicks "Add to Slack", bot appears in their workspace, messages route correctly

- [ ] **Task 9.4**: Discord integration (one-click OAuth)
  - Build: "Add to Discord" OAuth flow
  - Client clicks button, selects server, authorizes
  - Bot joins server, routes messages to CEO agent via Issues API
  - **REQUIRES:** Create a Discord Application in Discord Developer Portal (one-time Steel Motion setup, free). Need OAuth2 redirect URL, bot permissions (Send Messages, Read Message History)
  - Acceptance: Client clicks "Add to Discord", bot appears in their server

### Messaging Integration: Onboarding UI

Add optional step to onboarding wizard after API key entry:

```
Step: Connect Messaging (optional)

  [Email]      Auto-configured ✓          Free
  [Telegram]   Paste bot token            Free
  [Slack]      Add to Slack →             Free (Growth+ tier)
  [Discord]    Add to Discord →           Free (Growth+ tier)

  [Skip for now]
```

### Messaging by Tier

| Tier | Included Integrations |
|---|---|
| Free ($0) | Email only |
| Starter ($79/mo) | Email + Telegram |
| Growth ($199/mo) | Email + Telegram + Slack + Discord |
| Business ($599/mo) | All 4 (Email + Telegram + Slack + Discord) |

---

## Third-Party Dependencies Registry

**CRITICAL: Every external service, account, or configuration required for this plan.**

### Required Before Any Client (Steel Motion One-Time Setup)

| Dependency | What To Do | Cost | Needed For |
|---|---|---|---|
| **Contabo account** | Sign up at contabo.com, order VDS S (US/St. Louis) | $34/mo | Phase 4 — client hosting |
| **Stripe account** | Sign up at stripe.com, complete identity verification | Free (2.9% + 30c per transaction) | Phase 5 — billing |
| **ironworksapp.ai domain** | Purchase on Hostinger, configure DNS | ~$50-80/yr (.ai TLD) | Phase 7 — landing page + app subdomain |
| **Mailgun or SendGrid account** | Sign up, verify domain, configure MX records on ironworksapp.ai | Free tier (100 emails/day) | Phase 9.1 — email bridge |
| **Slack Developer account** | Create app at api.slack.com, configure OAuth redirect URLs | Free | Phase 9.3 — Slack integration |
| **Discord Developer account** | Create app at discord.com/developers, configure OAuth2 | Free | Phase 9.4 — Discord integration |
| **Vercel account** (optional) | Sign up for landing page hosting | Free tier | Phase 7.1 — landing page |
| **UptimeRobot account** | Sign up for monitoring | Free tier (50 monitors) | Phase 4.4 — uptime monitoring |

### Required Per Client (Client Setup During Onboarding)

| Dependency | What Client Does | What We Automate |
|---|---|---|
| **Anthropic/OpenAI API key** | Client creates account, generates key, pastes in onboarding wizard | We validate key, store encrypted in company secrets |
| **Telegram bot token** (optional) | Client messages @BotFather on Telegram, creates bot, copies token | We deploy bridge, wire to their CEO agent |
| **Slack workspace auth** (optional) | Client clicks "Add to Slack", authorizes our app | OAuth flow stores workspace token, bot auto-joins |
| **Discord server auth** (optional) | Client clicks "Add to Discord", authorizes our app | OAuth flow stores bot token, bot auto-joins |

### NOT Required (Deferred)

| Dependency | When Needed | Why Deferred |
|---|---|---|
| **Let's Encrypt** | Handled by Caddy automatically | No separate account needed |
| **Google Drive / S3** (backups) | Phase 4.3 | rclone supports both, configure during VDS setup |

---

## Phased Execution Timeline

| Week | Phases | Milestone | Third-Party Setup Needed |
|---|---|---|---|
| 1 | Phase 1 (Legal docs) + Phase 4.1 (Provision VDS) | Legal protection + infra ready | Contabo account, ironworksapp.ai domain |
| 2 | Phase 2 (Onboarding) + Phase 3 (Permissions) | Users can be invited + securely scoped | None (code only) |
| 3 | Phase 4.2-4.4 (HTTPS/Backup/Monitor) + Phase 5 (Billing) | Production-ready with billing | Stripe account, UptimeRobot, backup storage |
| 4 | Phase 6 (Footer) + Phase 7 (Landing page) | Public-facing presence | Vercel account (optional), DNS configuration |
| 5 | Phase 8 (Testing) + Phase 9.1-9.2 (Email + Telegram) | Messaging integrations | Mailgun/SendGrid account |
| 6 | First client onboarding | Revenue starts | Client's API key + optional Telegram token |
| 7+ | Phase 9.3-9.4 (Slack + Discord) | Full messaging suite | Slack Developer app, Discord Developer app |

---

## Rollback Plan

If critical issues are discovered:
1. Disable user invites (revert to internal-only access)
2. All legal pages are static content — can be updated without deploy
3. Stripe subscriptions can be cancelled/refunded manually
4. Company data is isolated per container — deleting a client container removes all their data
5. Contabo VDS can be deprovisioned independently of Hostinger VPS
6. Domain DNS can be redirected back to a "Coming Soon" page in minutes
7. Messaging bridges can be stopped per-company without affecting core platform

---

## Post-Launch Triggers

### Lawyer Review ($2-3K MRR)
- Engage a startup SaaS lawyer ($500-1K)
- Review TOS, AUP, DPA, Privacy Policy, SLA
- Specific focus: AI output liability clauses, data processor obligations
- Update docs from "v0.1" to "v1.0 — reviewed"

### Infrastructure Scale (80% capacity on VDS S)
- Upgrade to VDS M ($45/mo) or add second VDS S ($34/mo)
- Decision: vertical (bigger server) vs horizontal (multiple servers by region)

### Scale Features (10+ Business clients)
- Dedicated instance option (COA 3 path)
- Custom domain per client (client.ironworksapp.ai)
- External help docs at ironworksapp.ai/docs

---

## SITREP

**Status:** 🟡 IN PROGRESS — Wave 1 complete, Wave 2 starting

**Wave 1 Completed:**
- [x] Phase 1: Legal docs (TOS, AUP, DPA, SLA, Privacy, Legal Index)
- [x] Phase 2: User invite flow, TOS checkbox, API key onboarding, welcome banner, budget caps
- [x] Phase 3: 4 user roles, instance admin hiding, 25 tenant isolation tests
- [x] Phase 5: Polar billing integration, tier enforcement, pricing table

**Wave 2 In Progress:**
- [ ] Tier-gated company creation ("+" button respects subscription limits)
- [ ] Replace free tier with 14-day trial
- [ ] Update pricing code to final tiers ($79/$199/$599)

**Architecture Decision (finalized):**
Shared instance, NOT per-client containers. One IronWorks instance serves 50-100 clients. Clients are companies in the same database, isolated by company_id. Business tier clients who need full isolation get a dedicated instance at custom pricing.

**Messaging Decision (finalized):**
Email, Telegram, Slack, Discord. Nothing else. No WhatsApp, Teams, Signal.

**Support Decision (finalized):**
Email for all paid tiers. Docs only for trial. No SLAs, no phone calls, no dedicated support.

**Before Going Live, Commander Must:**
1. Purchase ironworksapp.ai domain on Hostinger
2. Create Contabo account + order VDS M ($45/mo) when ready for clients
3. Create Polar account and configure products

**Revenue Target:** First paying client by end of Week 6.

---

## APPENDIX A: Market Research Report

### Competitive Landscape Analysis — March 2026

#### 1. Direct Competitors

| Competitor | What They Do | Pricing | IronWorks Advantage |
|---|---|---|---|
| **Paperclip** (upstream) | Open-source framework, no hosted offering | Free, self-hosted | IronWorks = "managed Paperclip with batteries included" — playbooks, ratings, messaging, KB, team packs |
| **CrewAI + AMP** | Multi-agent platform, workflow-centric crews | $99-$10K+/mo | IronWorks has the "company metaphor" — org charts, roles, performance reviews, ratings. CrewAI has "crews" not "companies" |
| **Zero Human Labs** | YAML-config governance platform | Custom/enterprise | IronWorks has accessible dashboard. ZHL requires DevOps skills |
| **MetaGPT / MGX** | Software company simulation with roles | Free, open-source | Only does software dev. IronWorks supports any business function |
| **Autonomi / Loki Mode** | 41 agents build software from PRD | BSL 1.1 | Single-purpose builder. IronWorks manages ongoing operations |

#### 2. Adjacent Products

| Product | Category | Pricing | Difference from IronWorks |
|---|---|---|---|
| **Lindy AI** | No-code AI workforce builder | Free-$299/mo | Task-specific automations, no org hierarchy or governance |
| **Taskade** | AI project management | $6-$99/mo | Agents assist human teams, not autonomous workforce |
| **LangGraph** (LangChain) | Agent orchestration framework | Free-$39/user/mo | Infrastructure/framework, not management UI |
| **n8n** | Workflow automation | Free-$20/mo | Workflow tool, not workforce manager. Complementary |
| **Relevance AI** | Sales-focused agent platform | Free-$349/mo | Vertical (sales only). IronWorks is horizontal |

#### 3. Enterprise Players

| Company | Pricing | Gap for IronWorks |
|---|---|---|
| **Salesforce Agentforce** | Enterprise licensing ($540M revenue) | Locked into Salesforce ecosystem. IronWorks is vendor-agnostic |
| **ServiceNow AI Agent** | Enterprise licensing | IT-focused, expensive. IronWorks is lightweight and SMB-accessible |
| **Kore.ai** | Enterprise custom | Enterprise-only positioning. IronWorks serves underserved SMB market |

#### 4. Indie Hackers & Emerging

- **Orloj** — Agent infrastructure as code (YAML + GitOps). Early stage.
- **CrewForm** — Open-source multi-agent orchestration. Very new.
- **Orchastra** — "Scratch for AI agents" visual builder. Pre-launch.
- **ai-simulated-startup** — Experimental self-sustaining AI startup.

#### 5. Agent Marketplaces

- **Agentalent.ai** (monday.com) — Enterprises post roles, hire agents. 20-25% success fee.
- **Agent.ai** (HubSpot) — Professional network for AI agents.

IronWorks opportunity: integrate with marketplaces as a deployment target.

#### 6. Pricing Models in Market

| Model | Examples | Trend |
|---|---|---|
| Per-seat subscription | CrewAI, LangGraph | Declining (56% now use hybrid) |
| Credit/usage-based | Lindy, Relevance AI | Growing fast |
| Outcome-based | Salesforce, Sierra ($X/resolution) | Emerging for enterprise |
| Hybrid (base + usage) | Devin ($20/mo + $2.25/ACU) | Dominant model |
| Platform + BYOK | **IronWorks** | Aligned with market trend |

#### 7. Market Size

- **2025:** $7.63B global AI agents market
- **2026:** $8.5-10.91B projected
- **2030:** $35B projected
- **2033:** $183B projected (49.6% CAGR)
- 82% of executives expect AI agents in workforce within 18 months
- Organizations with mature agent orchestration by mid-2026 capture 2-3x more value

#### 8. IronWorks' 7 Strategic Gaps to Exploit

1. **"Managed Paperclip"** — No hosted Paperclip exists. IronWorks is the Vercel to their Next.js.
2. **"Company metaphor"** — No competitor fully models agents as employees with org charts, performance reviews, ratings, and career progression.
3. **SMB gap** — Enterprise players price out small teams. Frameworks require engineering. IronWorks owns the middle.
4. **Playbooks + routines** — Nobody combines workforce management with reusable workflow execution.
5. **Messaging integrations** — Talk to agents on Telegram/Slack makes it feel like managing real employees.
6. **Governance + accessibility** — Strong governance WITH accessible dashboard (competitors have one or the other).
7. **Vertical packaging** — Pre-built "AI companies" as templates (AI Marketing Agency, AI Dev Shop, AI Support Team).

#### Sources

- [CrewAI](https://crewai.com/) | [Pricing](https://crewai.com/pricing)
- [Paperclip](https://paperclip.ing/) | [GitHub](https://github.com/paperclipai/paperclip)
- [Lindy AI](https://www.lindy.ai) | [Pricing](https://www.lindy.ai/pricing)
- [Taskade](https://www.taskade.com/pricing)
- [LangGraph](https://www.langchain.com/pricing-langgraph-platform)
- [Zero Human Labs](https://zero-human-labs.com)
- [MetaGPT GitHub](https://github.com/FoundationAgents/MetaGPT)
- [Autonomi.dev](https://www.autonomi.dev/)
- [Agentalent.ai](https://agentalent.ai/)
- [Deloitte: AI Agent Orchestration](https://www.deloitte.com/us/en/insights/industry/technology/technology-media-and-telecom-predictions/2026/ai-agent-orchestration.html)
- [Grand View Research: AI Agents Market](https://www.grandviewresearch.com/industry-analysis/ai-agents-market-report)
- [Salesforce Agentforce](https://www.salesforce.com/agentforce/)
- [Kore.ai](https://www.kore.ai/ai-agent-platform/multi-agent-orchestration)
