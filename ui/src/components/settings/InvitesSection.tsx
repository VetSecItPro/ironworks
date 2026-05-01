import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HintIcon } from "../agent-config-primitives";

interface InvitesSectionProps {
  isGenerating: boolean;
  inviteError: string | null;
  inviteSnippet: string | null;
  snippetCopied: boolean;
  snippetCopyDelightId: number;
  onGenerate: () => void;
  onCopySnippet: () => void;
}

export function InvitesSection({
  isGenerating,
  inviteError,
  inviteSnippet,
  snippetCopied,
  snippetCopyDelightId,
  onGenerate,
  onCopySnippet,
}: InvitesSectionProps) {
  return (
    <div id="invites" className="space-y-4 scroll-mt-6">
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Agent Invites</h2>
      <div className="space-y-3 rounded-md border border-border px-4 py-4">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">
            Bootstrap a remote AI agent worker (OpenClaw CLI runtime) into this workspace. For inviting{" "}
            <span className="font-medium">people</span>, use Team Members above.
          </span>
          <HintIcon text="Creates a short-lived agent-runtime invite token and renders a copy-ready prompt for the OpenClaw CLI to consume. Not used for human teammates." />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onGenerate} disabled={isGenerating}>
            {isGenerating ? "Generating..." : "Generate OpenClaw Invite Prompt"}
          </Button>
        </div>
        {inviteError && (
          <p role="alert" className="text-sm text-destructive">
            {inviteError}
          </p>
        )}
        {inviteSnippet && (
          <div className="rounded-md border border-border bg-muted/30 p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">OpenClaw Invite Prompt</div>
              {snippetCopied && (
                <span
                  key={snippetCopyDelightId}
                  className="flex items-center gap-1 text-xs text-green-600 animate-pulse"
                >
                  <Check className="h-3 w-3" />
                  Copied
                </span>
              )}
            </div>
            <div className="mt-1 space-y-1.5">
              <textarea
                className="h-[28rem] w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none"
                value={inviteSnippet}
                readOnly
              />
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" onClick={onCopySnippet}>
                  {snippetCopied ? "Copied snippet" : "Copy snippet"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
