import { buildPiLocalConfig, parsePiStdoutLine } from "@ironworksai/adapter-pi-local/ui";
import type { UIAdapterModule } from "../types";
import { PiLocalConfigFields } from "./config-fields";

export const piLocalUIAdapter: UIAdapterModule = {
  type: "pi_local",
  label: "Pi (local)",
  parseStdoutLine: parsePiStdoutLine,
  ConfigFields: PiLocalConfigFields,
  buildAdapterConfig: buildPiLocalConfig,
};
