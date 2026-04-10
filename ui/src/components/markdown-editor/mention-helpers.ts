import { buildAgentMentionHref, buildProjectMentionHref } from "@ironworksai/shared";
import type { MentionOption } from "./types";

export interface MentionState {
  query: string;
  top: number;
  left: number;
  /** Viewport-relative coords for portal positioning */
  viewportTop: number;
  viewportLeft: number;
  textNode: Text;
  atPos: number;
  endPos: number;
}

export function detectMention(container: HTMLElement): MentionState | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;

  const range = sel.getRangeAt(0);
  const textNode = range.startContainer;
  if (textNode.nodeType !== Node.TEXT_NODE) return null;
  if (!container.contains(textNode)) return null;

  const text = textNode.textContent ?? "";
  const offset = range.startOffset;

  // Walk backwards from cursor to find @
  let atPos = -1;
  for (let i = offset - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === "@") {
      if (i === 0 || /\s/.test(text[i - 1])) {
        atPos = i;
      }
      break;
    }
    if (/\s/.test(ch)) break;
  }

  if (atPos === -1) return null;

  const query = text.slice(atPos + 1, offset);

  // Get position relative to container
  const tempRange = document.createRange();
  tempRange.setStart(textNode, atPos);
  tempRange.setEnd(textNode, atPos + 1);
  const rect = tempRange.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  return {
    query,
    top: rect.bottom - containerRect.top,
    left: rect.left - containerRect.left,
    viewportTop: rect.bottom,
    viewportLeft: rect.left,
    textNode: textNode as Text,
    atPos,
    endPos: offset,
  };
}

export function mentionMarkdown(option: MentionOption): string {
  if (option.kind === "project" && option.projectId) {
    return `[@${option.name}](${buildProjectMentionHref(option.projectId, option.projectColor ?? null)}) `;
  }
  const agentId = option.agentId ?? option.id.replace(/^agent:/, "");
  return `[@${option.name}](${buildAgentMentionHref(agentId, option.agentIcon ?? null)}) `;
}

/** Replace `@<query>` in the markdown string with the selected mention token. */
export function applyMention(markdown: string, query: string, option: MentionOption): string {
  const search = `@${query}`;
  const replacement = mentionMarkdown(option);
  const idx = markdown.lastIndexOf(search);
  if (idx === -1) return markdown;
  return markdown.slice(0, idx) + replacement + markdown.slice(idx + search.length);
}
