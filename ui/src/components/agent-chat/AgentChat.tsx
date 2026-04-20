import type { AgentDetail } from "@ironworksai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { agentsApi } from "../../api/agents";
import { issuesApi } from "../../api/issues";
import { queryKeys } from "../../lib/queryKeys";
import { ChatInputArea } from "./ChatInputArea";
import { ChatMessageList } from "./ChatMessageList";
import { ChatToolbar } from "./ChatToolbar";
import { getSuggestedActions, normalizeComments, POLL_INTERVAL_MS, SUGGESTED_ACTION_PROMPTS } from "./chat-helpers";

interface AgentChatProps {
  agent: AgentDetail;
  companyId: string;
}

export function AgentChat({ agent, companyId }: AgentChatProps) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { data: chatIssue, isLoading: issueLoading } = useQuery({
    queryKey: queryKeys.agentChat.issue(companyId, agent.id),
    queryFn: () => agentsApi.getChatIssue(companyId, agent.id),
    refetchInterval: POLL_INTERVAL_MS,
  });

  const issueId = chatIssue?.id ?? null;
  const { data: commentsRaw, isLoading: commentsLoading } = useQuery({
    queryKey: issueId
      ? queryKeys.agentChat.comments(companyId, agent.id, issueId)
      : ["agent-chat", companyId, agent.id, "comments", "__none__"],
    queryFn: () => issuesApi.listComments(issueId!),
    enabled: !!issueId,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const messages = commentsRaw ? normalizeComments(commentsRaw) : [];

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter((m) => m.body.toLowerCase().includes(q));
  }, [messages, searchQuery]);

  const lastAgentMessage = useMemo(() => {
    const agentMsgs = messages.filter((m) => !m.fromUser);
    return agentMsgs.length > 0 ? agentMsgs[agentMsgs.length - 1].body : null;
  }, [messages]);

  const suggestedActions = useMemo(() => getSuggestedActions(lastAgentMessage), [lastAgentMessage]);

  const isTyping = !!chatIssue && chatIssue.status === "in_progress";

  useEffect(() => {
    if (!searchQuery.trim()) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, isTyping, searchQuery]);

  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus();
  }, [showSearch]);

  const sendMutation = useMutation({
    mutationFn: async (message: string) => agentsApi.sendChat(companyId, agent.id, message),
    onSuccess: ({ issueId: newIssueId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agentChat.issue(companyId, agent.id) });
      if (newIssueId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.agentChat.comments(companyId, agent.id, newIssueId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(newIssueId) });
      }
    },
  });

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || sendMutation.isPending) return;
    setInput("");
    setShowTemplates(false);
    sendMutation.mutate(trimmed);
  }, [input, sendMutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleTemplateSelect = useCallback((prompt: string) => {
    setInput(prompt);
    setShowTemplates(false);
    textareaRef.current?.focus();
  }, []);

  const handleSuggestedAction = useCallback((label: string) => {
    const prompt = SUGGESTED_ACTION_PROMPTS[label] ?? label;
    setInput(prompt);
    textareaRef.current?.focus();
  }, []);

  const isEmpty = !issueLoading && messages.length === 0 && !isTyping;
  const displayMessages = showSearch ? filteredMessages : messages;

  return (
    <div className="flex flex-col h-full min-h-[60vh] max-h-[80vh]">
      <ChatToolbar
        showSearch={showSearch}
        setShowSearch={setShowSearch}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filteredCount={filteredMessages.length}
        showTemplates={showTemplates}
        setShowTemplates={setShowTemplates}
        onTemplateSelect={handleTemplateSelect}
        searchInputRef={searchInputRef}
      />
      <ChatMessageList
        agent={agent}
        messages={displayMessages}
        isTyping={isTyping}
        isEmpty={isEmpty}
        showSearch={showSearch}
        searchQuery={searchQuery}
        filteredCount={filteredMessages.length}
        suggestedActions={suggestedActions}
        onSuggestedAction={handleSuggestedAction}
        bottomRef={bottomRef}
        issueLoading={issueLoading}
        commentsLoading={commentsLoading}
        rawMessageCount={messages.length}
      />
      <ChatInputArea
        input={input}
        setInput={setInput}
        onSend={handleSend}
        onKeyDown={handleKeyDown}
        isPending={sendMutation.isPending}
        isError={sendMutation.isError}
        agentName={agent.name}
        textareaRef={textareaRef}
      />
    </div>
  );
}
