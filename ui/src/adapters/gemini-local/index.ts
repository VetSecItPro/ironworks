import { buildGeminiLocalConfig, parseGeminiStdoutLine } from "@ironworksai/adapter-gemini-local/ui";
import type { UIAdapterModule } from "../types";
import { GeminiLocalConfigFields } from "./config-fields";

export const geminiLocalUIAdapter: UIAdapterModule = {
  type: "gemini_local",
  label: "Gemini CLI (local)",
  parseStdoutLine: parseGeminiStdoutLine,
  ConfigFields: GeminiLocalConfigFields,
  buildAdapterConfig: buildGeminiLocalConfig,
};
