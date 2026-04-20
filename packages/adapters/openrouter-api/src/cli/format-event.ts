/**
 * CLI stream-event formatter for the openrouter_api adapter.
 *
 * Mirrors the openclaw-gateway / poe-api pattern: callers pass each raw stdout
 * line from execute() and this function applies color in debug mode so operators
 * can distinguish event types in terminal output.
 */
import pc from "picocolors";

export function printOpenRouterApiStreamEvent(raw: string, debug: boolean): void {
  const line = raw.trim();
  if (!line) return;

  if (!debug) {
    console.log(line);
    return;
  }

  if (line.startsWith("[openrouter-api:event]")) {
    console.log(pc.cyan(line));
    return;
  }

  if (line.startsWith("[openrouter-api]")) {
    console.log(pc.blue(line));
    return;
  }

  console.log(pc.gray(line));
}
