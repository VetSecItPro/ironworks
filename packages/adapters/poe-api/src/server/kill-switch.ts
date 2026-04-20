/**
 * Kill-switch guard for the poe_api adapter.
 *
 * ADAPTER_DISABLE_POE_API=1 disables the adapter at the pre-flight level so operators
 * can stop all poe_api activity without redeploying. This is a per-adapter override —
 * it does not affect other adapters. Checked on every execute() and testEnvironment()
 * call so the kill-switch takes effect without process restart.
 */

export const KILL_SWITCH_ENV_KEY = "ADAPTER_DISABLE_POE_API";

/**
 * Returns true when the adapter has been disabled via the kill-switch env var.
 * Re-reads the env on every call so the switch can be toggled at runtime
 * (e.g. via Kubernetes config-map updates without pod restart).
 */
export function isAdapterDisabled(): boolean {
  return process.env[KILL_SWITCH_ENV_KEY] === "1";
}
