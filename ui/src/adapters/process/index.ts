import type { UIAdapterModule } from "../types";
import { buildProcessConfig } from "./build-config";
import { ProcessConfigFields } from "./config-fields";
import { parseProcessStdoutLine } from "./parse-stdout";

export const processUIAdapter: UIAdapterModule = {
  type: "process",
  label: "Shell Process",
  parseStdoutLine: parseProcessStdoutLine,
  ConfigFields: ProcessConfigFields,
  buildAdapterConfig: buildProcessConfig,
};
