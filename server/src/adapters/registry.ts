import {
  agentConfigurationDoc as claudeAgentConfigurationDoc,
  models as claudeModels,
} from "@ironworksai/adapter-claude-local";
import {
  execute as claudeExecute,
  getQuotaWindows as claudeGetQuotaWindows,
  sessionCodec as claudeSessionCodec,
  testEnvironment as claudeTestEnvironment,
  listClaudeSkills,
  syncClaudeSkills,
} from "@ironworksai/adapter-claude-local/server";
import {
  agentConfigurationDoc as codexAgentConfigurationDoc,
  models as codexModels,
} from "@ironworksai/adapter-codex-local";
import {
  execute as codexExecute,
  getQuotaWindows as codexGetQuotaWindows,
  sessionCodec as codexSessionCodec,
  testEnvironment as codexTestEnvironment,
  listCodexSkills,
  syncCodexSkills,
} from "@ironworksai/adapter-codex-local/server";
import {
  agentConfigurationDoc as cursorAgentConfigurationDoc,
  models as cursorModels,
} from "@ironworksai/adapter-cursor-local";
import {
  execute as cursorExecute,
  sessionCodec as cursorSessionCodec,
  testEnvironment as cursorTestEnvironment,
  listCursorSkills,
  syncCursorSkills,
} from "@ironworksai/adapter-cursor-local/server";
import {
  agentConfigurationDoc as geminiAgentConfigurationDoc,
  models as geminiModels,
} from "@ironworksai/adapter-gemini-local";
import {
  execute as geminiExecute,
  sessionCodec as geminiSessionCodec,
  testEnvironment as geminiTestEnvironment,
  listGeminiSkills,
  syncGeminiSkills,
} from "@ironworksai/adapter-gemini-local/server";
import {
  agentConfigurationDoc as openclawGatewayAgentConfigurationDoc,
  models as openclawGatewayModels,
} from "@ironworksai/adapter-openclaw-gateway";
import {
  execute as openclawGatewayExecute,
  testEnvironment as openclawGatewayTestEnvironment,
} from "@ironworksai/adapter-openclaw-gateway/server";
import { agentConfigurationDoc as openCodeAgentConfigurationDoc } from "@ironworksai/adapter-opencode-local";
import {
  listOpenCodeModels,
  listOpenCodeSkills,
  execute as openCodeExecute,
  sessionCodec as openCodeSessionCodec,
  testEnvironment as openCodeTestEnvironment,
  syncOpenCodeSkills,
} from "@ironworksai/adapter-opencode-local/server";
import { agentConfigurationDoc as piAgentConfigurationDoc } from "@ironworksai/adapter-pi-local";
import {
  listPiModels,
  listPiSkills,
  execute as piExecute,
  sessionCodec as piSessionCodec,
  testEnvironment as piTestEnvironment,
  syncPiSkills,
} from "@ironworksai/adapter-pi-local/server";
import { getAdapterSessionManagement } from "@ironworksai/adapter-utils";
import { agentConfigurationDoc as hermesAgentConfigurationDoc, models as hermesModels } from "hermes-paperclip-adapter";
import {
  execute as hermesExecute,
  sessionCodec as hermesSessionCodec,
  testEnvironment as hermesTestEnvironment,
} from "hermes-paperclip-adapter/server";
import { listCodexModels } from "./codex-models.js";
import { listCursorModels } from "./cursor-models.js";
import { httpAdapter } from "./http/index.js";
import { ollamaCloudAdapter } from "./ollama-cloud/index.js";
import { processAdapter } from "./process/index.js";
import type { ServerAdapterModule } from "./types.js";

const claudeLocalAdapter: ServerAdapterModule = {
  type: "claude_local",
  execute: claudeExecute,
  testEnvironment: claudeTestEnvironment,
  listSkills: listClaudeSkills,
  syncSkills: syncClaudeSkills,
  sessionCodec: claudeSessionCodec,
  sessionManagement: getAdapterSessionManagement("claude_local") ?? undefined,
  models: claudeModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: claudeAgentConfigurationDoc,
  getQuotaWindows: claudeGetQuotaWindows,
};

const codexLocalAdapter: ServerAdapterModule = {
  type: "codex_local",
  execute: codexExecute,
  testEnvironment: codexTestEnvironment,
  listSkills: listCodexSkills,
  syncSkills: syncCodexSkills,
  sessionCodec: codexSessionCodec,
  sessionManagement: getAdapterSessionManagement("codex_local") ?? undefined,
  models: codexModels,
  listModels: listCodexModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: codexAgentConfigurationDoc,
  getQuotaWindows: codexGetQuotaWindows,
};

const cursorLocalAdapter: ServerAdapterModule = {
  type: "cursor",
  execute: cursorExecute,
  testEnvironment: cursorTestEnvironment,
  listSkills: listCursorSkills,
  syncSkills: syncCursorSkills,
  sessionCodec: cursorSessionCodec,
  sessionManagement: getAdapterSessionManagement("cursor") ?? undefined,
  models: cursorModels,
  listModels: listCursorModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: cursorAgentConfigurationDoc,
};

const geminiLocalAdapter: ServerAdapterModule = {
  type: "gemini_local",
  execute: geminiExecute,
  testEnvironment: geminiTestEnvironment,
  listSkills: listGeminiSkills,
  syncSkills: syncGeminiSkills,
  sessionCodec: geminiSessionCodec,
  sessionManagement: getAdapterSessionManagement("gemini_local") ?? undefined,
  models: geminiModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: geminiAgentConfigurationDoc,
};

const openclawGatewayAdapter: ServerAdapterModule = {
  type: "openclaw_gateway",
  execute: openclawGatewayExecute,
  testEnvironment: openclawGatewayTestEnvironment,
  models: openclawGatewayModels,
  supportsLocalAgentJwt: false,
  agentConfigurationDoc: openclawGatewayAgentConfigurationDoc,
};

const openCodeLocalAdapter: ServerAdapterModule = {
  type: "opencode_local",
  execute: openCodeExecute,
  testEnvironment: openCodeTestEnvironment,
  listSkills: listOpenCodeSkills,
  syncSkills: syncOpenCodeSkills,
  sessionCodec: openCodeSessionCodec,
  sessionManagement: getAdapterSessionManagement("opencode_local") ?? undefined,
  models: [],
  listModels: listOpenCodeModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: openCodeAgentConfigurationDoc,
};

const piLocalAdapter: ServerAdapterModule = {
  type: "pi_local",
  execute: piExecute,
  testEnvironment: piTestEnvironment,
  listSkills: listPiSkills,
  syncSkills: syncPiSkills,
  sessionCodec: piSessionCodec,
  sessionManagement: getAdapterSessionManagement("pi_local") ?? undefined,
  models: [],
  listModels: listPiModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: piAgentConfigurationDoc,
};

const hermesLocalAdapter: ServerAdapterModule = {
  type: "hermes_local",
  execute: hermesExecute,
  testEnvironment: hermesTestEnvironment,
  sessionCodec: hermesSessionCodec,
  models: hermesModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: hermesAgentConfigurationDoc,
};

const adaptersByType = new Map<string, ServerAdapterModule>(
  [
    claudeLocalAdapter,
    codexLocalAdapter,
    openCodeLocalAdapter,
    piLocalAdapter,
    cursorLocalAdapter,
    geminiLocalAdapter,
    openclawGatewayAdapter,
    hermesLocalAdapter,
    ollamaCloudAdapter,
    processAdapter,
    httpAdapter,
  ].map((a) => [a.type, a]),
);

export function getServerAdapter(type: string): ServerAdapterModule {
  const adapter = adaptersByType.get(type);
  if (!adapter) {
    // Fall back to process adapter for unknown types
    return processAdapter;
  }
  return adapter;
}

export async function listAdapterModels(type: string): Promise<{ id: string; label: string }[]> {
  const adapter = adaptersByType.get(type);
  if (!adapter) return [];
  if (adapter.listModels) {
    const discovered = await adapter.listModels();
    if (discovered.length > 0) return discovered;
  }
  return adapter.models ?? [];
}

export function listServerAdapters(): ServerAdapterModule[] {
  return Array.from(adaptersByType.values());
}

export function findServerAdapter(type: string): ServerAdapterModule | null {
  return adaptersByType.get(type) ?? null;
}
