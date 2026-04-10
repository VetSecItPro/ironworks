import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FooterBarProps {
  isPending: boolean;
  isError: boolean;
  errorMessage: string;
  canDiscardDraft: boolean;
  titleEmpty: boolean;
  onDiscard: () => void;
  onSubmit: () => void;
}

export function FooterBar({
  isPending,
  isError,
  errorMessage,
  canDiscardDraft,
  titleEmpty,
  onDiscard,
  onSubmit,
}: FooterBarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-border shrink-0">
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={onDiscard}
        disabled={isPending || !canDiscardDraft}
      >
        Discard Draft
      </Button>
      <div className="flex items-center gap-3">
        <div className="min-h-5 text-right">
          {isPending ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Creating issue...
            </span>
          ) : isError ? (
            <span className="text-xs text-destructive">{errorMessage}</span>
          ) : null}
        </div>
        <Button
          size="sm"
          className="min-w-[8.5rem] disabled:opacity-100"
          disabled={titleEmpty || isPending}
          onClick={onSubmit}
          aria-busy={isPending}
        >
          <span className="inline-flex items-center justify-center gap-1.5">
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            <span>{isPending ? "Creating..." : "Create Issue"}</span>
          </span>
        </Button>
      </div>
    </div>
  );
}
