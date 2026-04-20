/**
 * Root barrel for @ironworksai/adapter-openrouter-api.
 *
 * Server consumers should import from "@ironworksai/adapter-openrouter-api/server".
 * This root export is for discovery (adapter type constant + documentation).
 */

export { openrouterApiAdapter } from "./server/index.js";
export { agentConfigurationDoc } from "./shared/agent-configuration-doc.js";
export type { OpenRouterAdapterConfig, ValidateOpenRouterConfigResult } from "./shared/config.js";
export { validateOpenRouterConfig } from "./shared/config.js";
export { ADAPTER_TYPE } from "./shared/constants.js";
export { OPENROUTER_MODELS } from "./shared/models.js";
