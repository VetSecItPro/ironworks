import type { IssueComment } from "@ironworksai/shared";
import { ClipboardList, FileText, PlusCircle, Share2 } from "lucide-react";

export const POLL_INTERVAL_MS = 3_000;

export interface ChatMessage {
  id: string;
  body: string;
  fromUser: boolean;
  createdAt: Date;
  authorAgentId: string | null;
  authorUserId: string | null;
}

export function normalizeComments(comments: IssueComment[]): ChatMessage[] {
  return [...comments]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((c) => ({
      id: c.id,
      body: c.body,
      fromUser: c.authorUserId !== null && c.authorAgentId === null,
      createdAt: new Date(c.createdAt),
      authorAgentId: c.authorAgentId,
      authorUserId: c.authorUserId,
    }));
}

export const CHAT_TEMPLATES = [
  { label: "Review this code", prompt: "Review this code and provide feedback on quality, bugs, and improvements." },
  { label: "Write a report on...", prompt: "Write a report on " },
  {
    label: "Analyze project status",
    prompt: "Analyze the current project status and provide a summary of progress, blockers, and next steps.",
  },
  { label: "What are you working on?", prompt: "What are you currently working on? Give me a status update." },
];

export function getSuggestedActions(lastAgentMessage: string | null): { label: string; icon: React.ElementType }[] {
  if (!lastAgentMessage) return [];
  const actions: { label: string; icon: React.ElementType }[] = [];

  const lower = lastAgentMessage.toLowerCase();

  if (lastAgentMessage.length > 80) {
    actions.push({ label: "Create issue from this", icon: PlusCircle });
  }

  if (
    lower.includes("summary") ||
    lower.includes("report") ||
    lower.includes("analysis") ||
    lower.includes("findings")
  ) {
    actions.push({ label: "Share to channel", icon: Share2 });
  }

  if (lower.includes("task") || lower.includes("issue") || lower.includes("todo") || lower.includes("item")) {
    actions.push({ label: "View related issues", icon: ClipboardList });
  }

  if (lower.includes("code") || lower.includes("review") || lower.includes("bug") || lower.includes("fix")) {
    actions.push({ label: "Request detailed review", icon: FileText });
  }

  return actions.slice(0, 3);
}

export const SUGGESTED_ACTION_PROMPTS: Record<string, string> = {
  "Create issue from this": "Based on your last response, create a new issue with a clear title and description.",
  "Share to channel": "Format your last response as a brief update that can be shared with the team.",
  "View related issues": "List any related issues or tasks that are connected to what you just described.",
  "Request detailed review": "Provide a more detailed code review with specific line-by-line feedback.",
};
