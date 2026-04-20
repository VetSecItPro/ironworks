/**
 * Root barrel for @ironworksai/adapter-openai-api.
 *
 * Server consumers should import from "@ironworksai/adapter-openai-api/server".
 * This root export is for discovery (adapter type constant + documentation).
 */

export { openaiApiAdapter } from "./server/index.js";
export { agentConfigurationDoc } from "./shared/agent-configuration-doc.js";
export type { OpenAIAdapterConfig, ValidateOpenAIConfigResult } from "./shared/config.js";
export { validateOpenAIConfig } from "./shared/config.js";
export { ADAPTER_TYPE } from "./shared/constants.js";
export { OPENAI_MODELS } from "./shared/models.js";
