import { cn } from "../../lib/utils";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

interface ChatInputAreaProps {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  isPending: boolean;
  isError: boolean;
  agentName: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function ChatInputArea({
  input,
  setInput,
  onSend,
  onKeyDown,
  isPending,
  isError,
  agentName,
  textareaRef,
}: ChatInputAreaProps) {
  return (
    <>
      {isError && (
        <p className="px-4 py-1 text-xs text-destructive">
          Failed to send message. Please try again.
        </p>
      )}

      <div className="border-t border-border px-4 py-3 flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Message ${agentName}...`}
          className={cn(
            "flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm",
            "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
            "min-h-[40px] max-h-[160px] overflow-y-auto",
          )}
          style={{ height: "auto" }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
          }}
          disabled={isPending}
        />
        <Button
          size="icon"
          onClick={onSend}
          disabled={!input.trim() || isPending}
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}
