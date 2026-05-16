# ADR: Hosted deployments permit only network adapters; local-process adapters are self-host only

**Date:** 2026-05-16
**Status:** ACCEPTED
**Authors:** Steel Motion
**Related:** `docs/deploy/deployment-modes.md`, `server/src/deployment-mode.ts`

---

## Context

Ironworks is a shared-instance multi-tenant platform. One Postgres instance and
one Node process serve every customer; tenants are logical (`company_id`
foreign keys) and isolated at the request layer by `assertCompanyAccess()`.
That model is sound for the control plane (API, dashboard, database).

It is not sound for agent code execution. An agent can be configured with a
local-process adapter (`process`, `claude_local`, `codex_local`,
`opencode_local`, `pi_local`, `cursor`, `hermes_local`). When such an agent
runs, the heartbeat scheduler spawns a CLI tool (`claude`, `codex`, `python3`,
`node`, ...) as a child process **inside the shared server container**. That
process inherits:

- the container filesystem, including every other company's workspace files;
- the process environment, including `DATABASE_URL` (Postgres credentials for
  all tenants) and any tenant secrets present in the environment;
- the same cgroup as the control plane.

`company_id` scoping and `assertCompanyAccess()` protect API requests. They do
nothing for a spawned child process. The `ALLOWED_COMMANDS` whitelist in the
process adapter constrains the binary name, not behavior: `python3 -c '...'`
and `node -e '...'` are arbitrary code execution. A prompt-injected or buggy
agent from one tenant could therefore read every other tenant's data and the
master database credentials.

Before this ADR there was no deployment-mode gate anywhere: a tenant in
`authenticated` (hosted) mode could create a `process`-adapter agent, and
`process` was the schema default for `adapterType`. The hole sat behind the
default setting.

The platform is pre-launch. There are no external customers yet, so this is a
"close before customer #1" change rather than an incident response.

## Decision

**In `authenticated` (hosted, multi-tenant) deployments, only network adapters
are permitted: the API adapters (`anthropic_api`, `openai_api`,
`openrouter_api`, `poe_api`), the `http` webhook adapter, and the remote
gateway/cloud adapters (`openclaw_gateway`, `ollama_cloud`). Local-process
adapters are rejected.**

Local-process adapters remain fully available in `local_trusted` (single-
operator self-host) deployments, which are single-tenant by definition and
therefore have no cross-tenant exposure.

Hosted customers who need code execution have two paths that do not require
Ironworks to host an untrusted-code sandbox:

1. The `http` adapter, pointed at customer-owned infrastructure
   (bring-your-own execution).
2. Self-hosting Ironworks in `local_trusted` mode.

Hosted, in-platform code execution is deliberately deferred. If it is built
later it must run in a per-run isolation boundary (ephemeral container or
microVM), not as a child process of the control plane, and that work will most
likely also move execution off the single VPS.

## Implementation

- Classification lives in `@ironworksai/shared`:
  `LOCAL_PROCESS_ADAPTER_TYPES`, `CLOUD_ADAPTER_TYPES`,
  `isLocalProcessAdapterType()`. A test enforces that the two sets partition
  `AGENT_ADAPTER_TYPES` exactly, so a new adapter cannot ship unclassified.
  `isLocalProcessAdapterType()` fails closed: unknown types are treated as
  local-process, because `getServerAdapter()` falls back to the process
  adapter for unknown types.
- `server/src/deployment-mode.ts` resolves the process-wide deployment mode
  and exposes `assertAdapterTypeAllowedForDeployment()`.
- The gate is enforced at the single persistence chokepoint,
  `agentService.create()` / `.update()` (`server/src/services/agents.ts`), so
  every create path is covered: REST create, `agent-hires`, company onboard
  (the signup path), and YAML import.
- A defense-in-depth runtime guard in `heartbeat.ts` refuses to spawn a
  local-process adapter in `authenticated` mode even if such a row exists
  (for example, an agent created while the deployment was `local_trusted`,
  then converted to `authenticated`).

## Consequences

- Hosted agent creation must specify a network adapter. The schema default for
  `adapterType` remains `process`; a hosted create that does not override it
  receives a clear 400 explaining the options. The hosted onboarding UI should
  default `adapterType` to an API adapter so operators do not hit the error.
- Self-host behavior is unchanged.
- The vulnerability and the product decision ("hosted = network adapters
  only") are closed by the same change.

## Re-evaluation triggers

Revisit this decision if any of the following becomes true:

- Hosted, in-platform code execution becomes a committed roadmap item. At that
  point design a per-run sandbox (ephemeral container or microVM) and an
  execution fleet; do not relax this gate to run code in the shared container.
- Ironworks moves off the single-VPS deployment to an orchestrated fleet,
  which changes the isolation options available.
