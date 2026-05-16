import { DEPLOYMENT_MODES, type DeploymentMode, isLocalProcessAdapterType } from "@ironworksai/shared";
import { badRequest } from "./errors.js";

/**
 * Process-wide deployment mode.
 *
 * The mode (`local_trusted` vs `authenticated`) is a single resolved constant
 * for a running server - it does not vary per request - so it is stored at
 * module scope rather than threaded through every service constructor. Boot
 * resolves it once (env > config file > default, via loadConfig) and calls
 * `setDeploymentMode`; see server/src/index.ts.
 */

let bootMode: DeploymentMode | undefined;
let testOverride: DeploymentMode | undefined;

/**
 * Record the deployment mode resolved at server startup. Call once during
 * boot so request handlers and the heartbeat scheduler can consult it without
 * re-reading config.
 */
export function setDeploymentMode(mode: DeploymentMode): void {
  bootMode = mode;
}

/** Test-only override. Pass `undefined` to clear it. */
export function __setDeploymentModeForTest(mode: DeploymentMode | undefined): void {
  testOverride = mode;
}

/**
 * The active deployment mode. When boot has not called `setDeploymentMode`
 * (e.g. a partial test harness) this falls back to the
 * `IRONWORKS_DEPLOYMENT_MODE` env var, then to `local_trusted`. The fallback
 * is permissive on purpose: `local_trusted` is single-tenant, so a missed
 * init can only ever fail open toward self-host behavior - it cannot widen
 * cross-tenant exposure in a hosted deployment.
 */
export function getDeploymentMode(): DeploymentMode {
  if (testOverride !== undefined) return testOverride;
  if (bootMode !== undefined) return bootMode;
  const envMode = process.env.IRONWORKS_DEPLOYMENT_MODE;
  return envMode && (DEPLOYMENT_MODES as readonly string[]).includes(envMode)
    ? (envMode as DeploymentMode)
    : "local_trusted";
}

/**
 * Reject local-process adapters in hosted (`authenticated`) deployments.
 *
 * A local-process adapter spawns a CLI agent as a child process that inherits
 * this container's filesystem and environment - including `DATABASE_URL` and
 * every tenant's resolved secrets. In a shared multi-tenant deployment that
 * breaks tenant isolation: one company's agent could read another company's
 * data. No-op in `local_trusted` (single-operator self-host, single-tenant).
 *
 * Throws a 400 `HttpError`; its message is also surfaced as the heartbeat
 * run-failure reason when the runtime guard calls this.
 *
 * See docs/adr/2026-05-16-hosted-adapter-policy.md.
 */
export function assertAdapterTypeAllowedForDeployment(
  adapterType: string,
  deploymentMode: DeploymentMode = getDeploymentMode(),
): void {
  if (deploymentMode === "authenticated" && isLocalProcessAdapterType(adapterType)) {
    throw badRequest(
      `Adapter type "${adapterType}" runs as a local child process and is not ` +
        `available on hosted (authenticated) deployments, where it would share ` +
        `this container - filesystem, environment, DATABASE_URL - with every ` +
        `other tenant. Use an API adapter (anthropic_api, openai_api, ` +
        `openrouter_api, poe_api) or the http adapter (bring-your-own ` +
        `execution). Local-process adapters remain available in self-hosted ` +
        `(local_trusted) deployments.`,
    );
  }
}
