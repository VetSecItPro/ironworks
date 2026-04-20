/**
 * CLI stream-event formatter for the anthropic_api adapter.
 *
 * Mirrors the openclaw-gateway / poe-api pattern: callers pass each raw stdout
 * line from execute() and this function applies color in debug mode so operators
 * can distinguish event types in terminal output.
 */
import pc from "picocolors";

export function printAnthropicApiStreamEvent(raw: string, debug: boolean): void {
  const line = raw.trim();
  if (!line) return;

  if (!debug) {
    console.log(line);
    return;
  }

  if (line.startsWith("[anthropic-api:event]")) {
    console.log(pc.cyan(line));
    return;
  }

  if (line.startsWith("[anthropic-api]")) {
    console.log(pc.blue(line));
    return;
  }

  console.log(pc.gray(line));
}
