import { buildCodexLocalConfig, parseCodexStdoutLine } from "@ironworksai/adapter-codex-local/ui";
import type { UIAdapterModule } from "../types";
import { CodexLocalConfigFields } from "./config-fields";

export const codexLocalUIAdapter: UIAdapterModule = {
  type: "codex_local",
  label: "Codex (local)",
  parseStdoutLine: parseCodexStdoutLine,
  ConfigFields: CodexLocalConfigFields,
  buildAdapterConfig: buildCodexLocalConfig,
};
