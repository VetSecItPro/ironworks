import type { AgentDetail } from "@ironworksai/shared";
import { MessageSquare, X } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";
import { AgentChat } from "../AgentChat";

interface AgentChatSlideOutProps {
  agent: AgentDetail;
  companyId: string;
}

export function AgentChatSlideOut({ agent, companyId }: AgentChatSlideOutProps) {
  const [chatSlideOpen, setChatSlideOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setChatSlideOpen(!chatSlideOpen)}
        className={cn(
          "fixed bottom-6 right-6 z-40 flex items-center justify-center h-12 w-12 rounded-full shadow-lg transition-all duration-200",
          chatSlideOpen ? "bg-foreground text-background" : "bg-foreground text-background hover:scale-105",
        )}
        aria-label="Chat with agent"
      >
        {chatSlideOpen ? <X className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
      </button>

      {/* Chat slide-out panel */}
      {chatSlideOpen && (
        <div className="fixed inset-y-0 right-0 z-30 w-[400px] max-w-[90vw] border-l border-border bg-background shadow-xl animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-medium">Chat with {agent.name}</span>
            <button
              type="button"
              onClick={() => setChatSlideOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="h-[calc(100vh-52px)]">
            <AgentChat agent={agent} companyId={companyId} />
          </div>
        </div>
      )}
    </>
  );
}
