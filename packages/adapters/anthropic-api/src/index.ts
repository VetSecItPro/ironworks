/**
 * Root barrel for @ironworksai/adapter-anthropic-api.
 *
 * Server consumers should import from "@ironworksai/adapter-anthropic-api/server".
 * This root export is for discovery (adapter type constant + documentation).
 */

export { anthropicApiAdapter } from "./server/index.js";
export { agentConfigurationDoc } from "./shared/agent-configuration-doc.js";
export type { AnthropicAdapterConfig, ValidateAnthropicConfigResult } from "./shared/config.js";
export { validateAnthropicConfig } from "./shared/config.js";
export { ADAPTER_TYPE } from "./shared/constants.js";
export { ANTHROPIC_MODELS } from "./shared/models.js";
