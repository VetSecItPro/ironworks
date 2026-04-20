import { claudeLocalUIAdapter } from "./claude-local";
import { codexLocalUIAdapter } from "./codex-local";
import { cursorLocalUIAdapter } from "./cursor";
import { geminiLocalUIAdapter } from "./gemini-local";
import { httpUIAdapter } from "./http";
import { openClawGatewayUIAdapter } from "./openclaw-gateway";
import { openCodeLocalUIAdapter } from "./opencode-local";
import { piLocalUIAdapter } from "./pi-local";
import { processUIAdapter } from "./process";
import type { UIAdapterModule } from "./types";

const uiAdapters: UIAdapterModule[] = [
  claudeLocalUIAdapter,
  codexLocalUIAdapter,
  geminiLocalUIAdapter,
  openCodeLocalUIAdapter,
  piLocalUIAdapter,
  cursorLocalUIAdapter,
  openClawGatewayUIAdapter,
  processUIAdapter,
  httpUIAdapter,
];

const adaptersByType = new Map<string, UIAdapterModule>(uiAdapters.map((a) => [a.type, a]));

export function getUIAdapter(type: string): UIAdapterModule {
  return adaptersByType.get(type) ?? processUIAdapter;
}

export function listUIAdapters(): UIAdapterModule[] {
  return [...uiAdapters];
}
