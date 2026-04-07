/**
 * Channel message extraction utilities.
 *
 * Agents include [CHANNEL #name] blocks in their LLM output to post messages
 * to named channels. This module provides a pure extraction function so the
 * logic can be unit-tested independently of the database or heartbeat service.
 *
 * Security notes (LLM02-A):
 *  - Nested [CHANNEL] tags in the captured body are stripped to prevent
 *    injection chaining (an LLM-crafted body cannot hijack additional channels).
 *  - Bodies are capped at 2000 chars to limit oversized LLM output from
 *    flooding channels.
 *  - Duplicate channel names are deduplicated; only the first occurrence wins.
 *  - Bodies shorter than 5 chars are discarded as noise.
 */

export interface ChannelMessage {
  channel: string;
  body: string;
}

/**
 * Extract [CHANNEL #name] message blocks from an LLM output string.
 *
 * @param text - Raw LLM output (e.g. agent run summary)
 * @returns Array of unique channel messages, in order of first appearance.
 */
export function extractChannelMessages(text: string): ChannelMessage[] {
  if (!text) return [];

  const channelPattern =
    /\[CHANNEL\s+#(\w[\w-]*)\]\s*(.+?)(?=\[CHANNEL\s+#|\[FACT\]|\[ASSESSMENT\]|\[SPECULATION\]|$)/gs;

  const results: ChannelMessage[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = channelPattern.exec(text)) !== null) {
    const channel = match[1].trim().toLowerCase();

    // Strip nested [CHANNEL] tags (LLM02-A injection defense)
    let body = match[2]
      .trim()
      .replace(/\[CHANNEL\s+#[\w-]+\]/gi, "")
      .trim();

    // Length cap to prevent channel flooding
    if (body.length > 2000) {
      body = body.slice(0, 2000);
    }

    // Discard noise and duplicates
    if (!body || body.length < 5 || seen.has(channel)) continue;

    seen.add(channel);
    results.push({ channel, body });
  }

  return results;
}
