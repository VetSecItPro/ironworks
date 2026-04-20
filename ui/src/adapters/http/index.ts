import type { UIAdapterModule } from "../types";
import { buildHttpConfig } from "./build-config";
import { HttpConfigFields } from "./config-fields";
import { parseHttpStdoutLine } from "./parse-stdout";

export const httpUIAdapter: UIAdapterModule = {
  type: "http",
  label: "HTTP Webhook",
  parseStdoutLine: parseHttpStdoutLine,
  ConfigFields: HttpConfigFields,
  buildAdapterConfig: buildHttpConfig,
};
