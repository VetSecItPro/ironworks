/**
 * Root barrel for @ironworksai/adapter-poe-api.
 *
 * Server consumers should import from "@ironworksai/adapter-poe-api/server".
 * This root export is for discovery (adapter type constant + documentation).
 */

export { ADAPTER_TYPE } from "./shared/constants.js";
export { agentConfigurationDoc } from "./shared/agent-configuration-doc.js";
export { POE_MODELS } from "./shared/models.js";
export { validatePoeConfig } from "./shared/config.js";
export type { PoeAdapterConfig, ValidatePoeConfigResult } from "./shared/config.js";
export { poeApiAdapter } from "./server/index.js";
