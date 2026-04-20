/**
 * CLI stream-event formatter for the poe_api adapter.
 *
 * Mirrors the openclaw-gateway pattern: callers pass each raw stdout line from
 * the adapter's execute() stream and this function applies color when debug mode
 * is on so operators can quickly distinguish event types in terminal output.
 *
 * Why three branches: [poe-api:event] lines are SSE event payloads (cyan),
 * [poe-api] lines are structured adapter log messages (blue), everything else
 * is raw LLM text or unrecognized output (gray in debug, plain otherwise).
 */
import pc from "picocolors";

export function printPoeApiStreamEvent(raw: string, debug: boolean): void {
  const line = raw.trim();
  if (!line) return;

  if (!debug) {
    console.log(line);
    return;
  }

  if (line.startsWith("[poe-api:event]")) {
    console.log(pc.cyan(line));
    return;
  }

  if (line.startsWith("[poe-api]")) {
    console.log(pc.blue(line));
    return;
  }

  console.log(pc.gray(line));
}
