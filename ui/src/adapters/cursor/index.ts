import { buildCursorLocalConfig, parseCursorStdoutLine } from "@ironworksai/adapter-cursor-local/ui";
import type { UIAdapterModule } from "../types";
import { CursorLocalConfigFields } from "./config-fields";

export const cursorLocalUIAdapter: UIAdapterModule = {
  type: "cursor",
  label: "Cursor CLI (local)",
  parseStdoutLine: parseCursorStdoutLine,
  ConfigFields: CursorLocalConfigFields,
  buildAdapterConfig: buildCursorLocalConfig,
};
