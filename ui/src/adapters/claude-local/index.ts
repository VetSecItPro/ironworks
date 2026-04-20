import { buildClaudeLocalConfig, parseClaudeStdoutLine } from "@ironworksai/adapter-claude-local/ui";
import type { UIAdapterModule } from "../types";
import { ClaudeLocalConfigFields } from "./config-fields";

export const claudeLocalUIAdapter: UIAdapterModule = {
  type: "claude_local",
  label: "Claude Code (local)",
  parseStdoutLine: parseClaudeStdoutLine,
  ConfigFields: ClaudeLocalConfigFields,
  buildAdapterConfig: buildClaudeLocalConfig,
};
