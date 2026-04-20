import type {
  AdapterEnvironmentTestContext,
  AdapterExecutionContext,
  AdapterExecutionResult,
  ServerAdapterModule,
} from "@ironworksai/adapter-utils";
import { transport } from "@ironworksai/adapter-utils/http/transport";
import { agentConfigurationDoc } from "../shared/agent-configuration-doc.js";
import { ADAPTER_TYPE } from "../shared/constants.js";
import { POE_MODELS } from "../shared/models.js";
import { execute as executeWithTransport } from "./execute.js";
import { sessionCodec } from "./session-codec.js";
import { getSkillSnapshot } from "./skills.js";
import { testEnvironment as testEnvWithTransport } from "./test.js";

// Module-level transport instance — shared across calls for connection pooling.
const sharedTransport = transport.createTransport();

async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  return executeWithTransport(ctx, sharedTransport);
}

async function testEnvironment(ctx: AdapterEnvironmentTestContext) {
  // testEnvironment uses a minimal context shape
  const minCtx = { adapterType: ctx.adapterType, config: ctx.config };
  return testEnvWithTransport(minCtx, sharedTransport);
}

export const poeApiAdapter: ServerAdapterModule = {
  type: ADAPTER_TYPE,
  execute,
  testEnvironment,
  sessionCodec,
  listSkills: async (ctx) => getSkillSnapshot(ctx),
  supportsLocalAgentJwt: false,
  models: POE_MODELS.map((m) => ({ id: m.id, label: m.label })),
  agentConfigurationDoc,
};

export { execute, getSkillSnapshot, sessionCodec, testEnvironment };
