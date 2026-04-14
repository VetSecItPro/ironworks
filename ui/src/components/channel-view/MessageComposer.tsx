import React from "react";
import { Send, MessageSquare, X } from "lucide-react";
import type { ChannelMessage } from "../../api/channels";
import { cn } from "../../lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface MessageComposerProps {
  draftBody: string;
  onDraftChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  isSending: boolean;
  replyToId: string | null;
  replyMap: Map<string, ChannelMessage>;
  onCancelReply: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  hidden: boolean;
}

export function MessageComposer({
  draftBody,
  onDraftChange,
  onKeyDown,
  onSend,
  isSending,
  replyToId,
  replyMap,
  onCancelReply,
  textareaRef,
  hidden,
}: MessageComposerProps) {
  return (
    <div className={cn("shrink-0 border-t border-border px-4 py-3", hidden && "hidden")}>
      {/* Reply indicator */}
      {replyToId && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-muted/30 rounded-md text-xs text-muted-foreground">
          <MessageSquare className="h-3 w-3 shrink-0" />
          <span className="truncate">
            Replying to: {replyMap.get(replyToId)?.body?.slice(0, 80) ?? "message"}
            {(replyMap.get(replyToId)?.body?.length ?? 0) > 80 ? "..." : ""}
          </span>
          <button
            onClick={onCancelReply}
            className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={draftBody}
          onChange={onDraftChange}
          onKeyDown={onKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 min-h-[36px] max-h-[160px] resize-none text-[13px] leading-snug py-2"
        />
        <Button
          size="sm"
          onClick={onSend}
          disabled={!draftBody.trim() || isSending}
          className="shrink-0 h-9 px-3"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Tip: Discussions happen here. Create issues for trackable work.
      </p>
    </div>
  );
}
