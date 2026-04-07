import type { ServerAdapterModule } from "../types.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";

export const ollamaCloudAdapter: ServerAdapterModule = {
  type: "ollama_cloud",
  execute,
  testEnvironment,
  models: [
    { id: "kimi-k2.5", label: "Kimi K2.5 (Cloud)" },
    { id: "deepseek-v3.2", label: "DeepSeek V3.2 (Cloud)" },
    { id: "qwen3.5:397b", label: "Qwen 3.5 27B (Cloud)" },
  ],
  supportsLocalAgentJwt: false,
  agentConfigurationDoc: `# ollama_cloud agent configuration

Adapter: ollama_cloud

Core fields:
- apiKey (string, optional): Ollama Cloud API key. Falls back to OLLAMA_API_KEY env var.
- model (string, optional): Model to use. Default: kimi-k2.5
- url (string, optional): API endpoint. Default: https://ollama.com/api/chat
- maxOutputTokens (number, optional): Maximum tokens in the response. Default: 4096
`,
};
