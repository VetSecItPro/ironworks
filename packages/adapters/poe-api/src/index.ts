/**
 * Root barrel for @ironworksai/adapter-poe-api.
 *
 * Server consumers should import from "@ironworksai/adapter-poe-api/server".
 * This root export is for discovery (adapter type constant + documentation).
 */

export { poeApiAdapter } from "./server/index.js";
export { agentConfigurationDoc } from "./shared/agent-configuration-doc.js";
export type { PoeAdapterConfig, ValidatePoeConfigResult } from "./shared/config.js";
export { validatePoeConfig } from "./shared/config.js";
export { ADAPTER_TYPE } from "./shared/constants.js";
export { POE_MODELS } from "./shared/models.js";
