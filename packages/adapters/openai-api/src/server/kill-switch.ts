/**
 * Kill-switch guard for the openai_api adapter.
 * ADAPTER_DISABLE_OPENAI_API=1 disables the adapter at the pre-flight level.
 */

export const KILL_SWITCH_ENV_KEY = "ADAPTER_DISABLE_OPENAI_API";

export function isAdapterDisabled(): boolean {
  return process.env[KILL_SWITCH_ENV_KEY] === "1";
}
