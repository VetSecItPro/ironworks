import { buildOpenCodeLocalConfig, parseOpenCodeStdoutLine } from "@ironworksai/adapter-opencode-local/ui";
import type { UIAdapterModule } from "../types";
import { OpenCodeLocalConfigFields } from "./config-fields";

export const openCodeLocalUIAdapter: UIAdapterModule = {
  type: "opencode_local",
  label: "OpenCode (local)",
  parseStdoutLine: parseOpenCodeStdoutLine,
  ConfigFields: OpenCodeLocalConfigFields,
  buildAdapterConfig: buildOpenCodeLocalConfig,
};
