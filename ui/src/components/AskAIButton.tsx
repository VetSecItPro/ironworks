import { useState, useRef, useEffect } from "react";
import { useLocation } from "@/lib/router";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Send, X, MessageCircle } from "lucide-react";

/**
 * Contextual AI Assistant - floating "Ask AI" button (bottom-right, fixed).
 * Opens a small chat panel that is context-aware (shows current page name).
 * Input field + send button, mock response, dismissible.
 */

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

function getPageContext(pathname: string): string {
  // Extract meaningful page name from URL
  const segments = pathname.split("/").filter(Boolean);
  // Remove company prefix (first segment is typically the prefix)
  const meaningful = segments.length > 1 ? segments.slice(1) : segments;

  if (meaningful.length === 0) return "Dashboard";

  const page = meaningful[0];
  const pageMap: Record<string, string> = {
    dashboard: "War Room",
    issues: "Issues",
    agents: "Agents",
    projects: "Projects",
    goals: "Goals",
    routines: "Routines",
    playbooks: "Playbooks",
    costs: "Costs",
    performance: "Agent Performance",
    "board-briefing": "Board Briefing",
    deliverables: "Deliverables",
    knowledge: "Knowledge Base",
    activity: "Company Activity",
    "audit-log": "Audit Log",
    library: "Library",
    skills: "Skills",
    org: "Org Chart",
    hiring: "Hiring",
    inbox: "Inbox",
    "company": "Company Settings",
    automation: "Automation Rules",
    "client-portal": "Client Portal",
    marketplace: "Agent Marketplace",
  };

  return pageMap[page] ?? page.charAt(0).toUpperCase() + page.slice(1).replace(/-/g, " ");
}

function generateMockResponse(pageContext: string, userMessage: string): string {
  const lowerMsg = userMessage.toLowerCase();

  if (lowerMsg.includes("help") || lowerMsg.includes("what can")) {
    return `I can help you with the ${pageContext} page. Here are some things I can assist with:\n\n- Explain what you see on this page\n- Help you take actions\n- Answer questions about your data\n- Suggest next steps\n\nWhat would you like to know?`;
  }

  if (lowerMsg.includes("create") || lowerMsg.includes("add") || lowerMsg.includes("new")) {
    return `To create something new on the ${pageContext} page, look for the "+" or "New" button in the top area. I can walk you through the process if you need guidance.`;
  }

  if (lowerMsg.includes("filter") || lowerMsg.includes("search") || lowerMsg.includes("find")) {
    return `You can use the search and filter controls at the top of the ${pageContext} page to narrow down results. Try using the filter bar or the search field.`;
  }

  return `I can help you with ${pageContext}. Based on your question about "${userMessage.slice(0, 50)}", here are some suggestions:\n\n1. Check the current page for relevant actions\n2. Use the sidebar to navigate to related sections\n3. Try the search (Cmd+K) for quick access\n\nWould you like more specific help?`;
}

export function AskAIButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const pageContext = getPageContext(location.pathname);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Add welcome message when opened with no messages
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: `Hi! I can help you with the ${pageContext} page. What would you like to know?`,
        },
      ]);
    }
  }, [isOpen, pageContext, messages.length]);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // Simulate AI response delay
    setTimeout(() => {
      const response = generateMockResponse(pageContext, trimmed);
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: response,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsTyping(false);
    }, 800 + Math.random() * 500);
  }

  function handleClose() {
    setIsOpen(false);
  }

  function handleClear() {
    setMessages([]);
  }

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={cn(
            "fixed bottom-6 right-6 z-50",
            "w-12 h-12 rounded-full",
            "bg-primary text-primary-foreground",
            "shadow-lg hover:shadow-xl",
            "flex items-center justify-center",
            "transition-all duration-200 hover:scale-105",
            "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2",
          )}
          title="Ask AI"
        >
          <MessageCircle className="h-5 w-5" />
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50",
            "w-80 sm:w-96 h-[28rem]",
            "rounded-xl border border-border bg-card shadow-2xl",
            "flex flex-col overflow-hidden",
            "animate-in slide-in-from-bottom-4 fade-in duration-200",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2 min-w-0">
              <Bot className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-semibold">AI Assistant</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  Context: {pageContext}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {messages.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleClear}
                  title="Clear chat"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleClose}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 text-foreground",
                  )}
                >
                  {msg.content.split("\n").map((line, i) => (
                    <span key={i}>
                      {line}
                      {i < msg.content.split("\n").length - 1 && <br />}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-muted/50 rounded-lg px-3 py-2 text-xs text-muted-foreground">
                  <span className="inline-flex gap-1">
                    <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything..."
                className="text-xs h-8 flex-1"
                disabled={isTyping}
              />
              <Button
                type="submit"
                size="icon-sm"
                disabled={!input.trim() || isTyping}
                className="shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
