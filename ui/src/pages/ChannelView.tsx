import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Pin } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "@/lib/router";
import { agentsApi } from "../api/agents";
import { authApi } from "../api/auth";
import type { Channel, ChannelMessage } from "../api/channels";
import { channelsApi } from "../api/channels";
import type { FilterMode } from "../components/channel-view";
import { ChannelAnalyticsPanel, ChannelHeader, MessageComposer, MessageRow } from "../components/channel-view";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";

// ---- Filters ----
function matchesFilter(msg: ChannelMessage, mode: FilterMode): boolean {
  if (mode === "all") return true;
  if (mode === "analytics") return true;
  return msg.messageType === "decision" || msg.messageType === "escalation";
}

// ---- Main ChannelView ----
export function ChannelView() {
  const { channelId } = useParams<{ channelId: string }>();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [draftBody, setDraftBody] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [pinnedExpanded, setPinnedExpanded] = useState(true);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const prevMessageCount = useRef(0);
  const [newMessageDividerIndex, setNewMessageDividerIndex] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [lastReadTimestamp, setLastReadTimestamp] = useState<string | null>(() => {
    if (!channelId) return null;
    return localStorage.getItem(`ironworks:channel-last-read:${channelId}`);
  });

  // Fetch channels list to find the current channel name
  const { data: channels } = useQuery({
    queryKey: queryKeys.channels.list(selectedCompanyId!),
    queryFn: () => channelsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const channel: Channel | undefined = channels?.find((c) => c.id === channelId);

  // Fetch messages with polling
  const { data: messages = [] } = useQuery({
    queryKey: queryKeys.channels.messages(selectedCompanyId!, channelId!),
    queryFn: () => channelsApi.messages(selectedCompanyId!, channelId!),
    enabled: !!selectedCompanyId && !!channelId,
    refetchInterval: 5_000,
  });

  // Unread tracking
  const unreadCount = useMemo(() => {
    if (!lastReadTimestamp) return 0;
    return messages.filter((m) => m.createdAt > lastReadTimestamp).length;
  }, [messages, lastReadTimestamp]);

  function markAllRead() {
    if (messages.length === 0) return;
    const latest = messages[messages.length - 1].createdAt;
    setLastReadTimestamp(latest);
    if (channelId) localStorage.setItem(`ironworks:channel-last-read:${channelId}`, latest);
    setNewMessageDividerIndex(null);
  }

  // Fetch agents slim for name/icon resolution
  const { data: agentSlims = [] } = useQuery({
    queryKey: queryKeys.agents.slim(selectedCompanyId!),
    queryFn: () => agentsApi.slim(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // Fetch session for authorUserId
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });

  // Fetch pinned messages
  const { data: pinnedMessages = [] } = useQuery({
    queryKey: queryKeys.channels.pinned(selectedCompanyId!, channelId!),
    queryFn: () => channelsApi.pinned(selectedCompanyId!, channelId!),
    enabled: !!selectedCompanyId && !!channelId,
  });

  // Pin / unpin mutations
  const pinMutation = useMutation({
    mutationFn: (messageId: string) => channelsApi.pinMessage(selectedCompanyId!, channelId!, messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.channels.pinned(selectedCompanyId!, channelId!),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.channels.list(selectedCompanyId!),
      });
    },
  });

  const unpinMutation = useMutation({
    mutationFn: (messageId: string) => channelsApi.unpinMessage(selectedCompanyId!, channelId!, messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.channels.pinned(selectedCompanyId!, channelId!),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.channels.list(selectedCompanyId!),
      });
    },
  });

  // Build agent map
  const agentMap = new Map(
    agentSlims.map((a) => [
      a.id,
      {
        name: a.name,
        icon: a.icon,
        role: a.role,
        employmentType: undefined as string | undefined,
      },
    ]),
  );

  // Build reply map
  const replyMap = new Map(messages.map((m) => [m.id, m]));

  // Issue map
  const issueMap = new Map<string, { identifier: string; title: string; status?: string }>();

  // Build thread map: parentId -> replies
  const threadMap = useMemo(() => {
    const map = new Map<string, ChannelMessage[]>();
    for (const m of messages) {
      if (m.replyToId) {
        const arr = map.get(m.replyToId) ?? [];
        arr.push(m);
        map.set(m.replyToId, arr);
      }
    }
    return map;
  }, [messages]);

  // Top-level messages (not replies), chronological order (oldest first)
  const topLevelMessages = useMemo(() => [...messages.filter((m) => !m.replyToId)].reverse(), [messages]);

  // Breadcrumbs
  useEffect(() => {
    const channelName = channel?.name ?? channelId ?? "";
    setBreadcrumbs([{ label: "Channels" }, { label: `#${channelName}` }]);
  }, [setBreadcrumbs, channel, channelId]);

  // Track new messages arriving and set divider
  useEffect(() => {
    const currentCount = topLevelMessages.length;
    if (prevMessageCount.current > 0 && currentCount > prevMessageCount.current) {
      setNewMessageDividerIndex(prevMessageCount.current);
    }
    prevMessageCount.current = currentCount;
  }, [topLevelMessages.length]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Post message mutation
  const postMutation = useMutation({
    mutationFn: ({ body, replyTo }: { body: string; replyTo?: string | null }) =>
      channelsApi.postMessage(selectedCompanyId!, channelId!, {
        body,
        messageType: "message",
        ...(replyTo ? { replyToId: replyTo } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.channels.messages(selectedCompanyId!, channelId!),
      });
      setDraftBody("");
      setReplyToId(null);
    },
  });

  const handleSend = useCallback(() => {
    const trimmed = draftBody.trim();
    if (!trimmed || postMutation.isPending) return;
    postMutation.mutate({ body: trimmed, replyTo: replyToId });
  }, [draftBody, postMutation, replyToId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraftBody(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  // Create issue from message mutation
  const createIssueMutation = useMutation({
    mutationFn: (messageId: string) =>
      channelsApi.createIssueFromMessage(selectedCompanyId!, channelId!, messageId, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.channels.messages(selectedCompanyId!, channelId!),
      });
    },
  });

  const filteredMessages = useMemo(() => {
    let msgs = topLevelMessages.filter((m) => matchesFilter(m, filter));
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      msgs = msgs.filter((m) => m.body.toLowerCase().includes(q));
    }
    return msgs;
  }, [topLevelMessages, filter, searchTerm]);

  const channelName = channel?.name ?? channelId ?? "";

  return (
    <div className="flex flex-col h-full min-h-0">
      <ChannelHeader
        channelName={channelName}
        unreadCount={unreadCount}
        onMarkAllRead={markAllRead}
        filter={filter}
        onFilterChange={setFilter}
        searchOpen={searchOpen}
        onSearchToggle={() => setSearchOpen(!searchOpen)}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        filteredCount={filteredMessages.length}
      />

      {/* Messages / Analytics */}
      <div className="flex-1 min-h-0 overflow-y-auto py-2">
        {filter === "analytics" ? (
          <ChannelAnalyticsPanel companyId={selectedCompanyId!} channelId={channelId!} />
        ) : (
          <>
            {/* Pinned Messages collapsible section */}
            {pinnedMessages.length > 0 && filter === "all" && (
              <div className="mb-2 border-b border-border">
                <button type="button"
                  onClick={() => setPinnedExpanded((v) => !v)}
                  className="flex items-center gap-1.5 w-full px-4 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
                >
                  {pinnedExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <Pin className="h-3 w-3" />
                  Pinned ({pinnedMessages.length})
                </button>
                {pinnedExpanded && (
                  <div className="bg-muted/20">
                    {pinnedMessages.map((msg) => (
                      <MessageRow
                        key={`pinned-${msg.id}`}
                        msg={msg}
                        agentMap={agentMap}
                        issueMap={issueMap}
                        replyMap={replyMap}
                        isPinned
                        onUnpin={(id) => unpinMutation.mutate(id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {filteredMessages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                {filter === "decisions"
                  ? "No decisions or escalations yet."
                  : "No messages yet. Start the conversation."}
              </div>
            ) : (
              filteredMessages.map((msg, idx) => (
                <div key={msg.id}>
                  {/* New messages divider */}
                  {newMessageDividerIndex !== null && idx === newMessageDividerIndex && (
                    <div className="flex items-center gap-3 px-4 py-1.5">
                      <div className="flex-1 h-px bg-red-400/50" />
                      <span className="text-[11px] font-medium text-red-500 shrink-0">New messages</span>
                      <div className="flex-1 h-px bg-red-400/50" />
                    </div>
                  )}
                  <MessageRow
                    msg={msg}
                    agentMap={agentMap}
                    issueMap={issueMap}
                    replyMap={replyMap}
                    isPinned={pinnedMessages.some((p) => p.id === msg.id)}
                    onPin={(id) => pinMutation.mutate(id)}
                    onUnpin={(id) => unpinMutation.mutate(id)}
                    onCreateIssue={(id) => createIssueMutation.mutate(id)}
                    onReply={(id) => {
                      setReplyToId(id);
                      textareaRef.current?.focus();
                    }}
                    threadReplies={threadMap.get(msg.id)}
                    companyId={selectedCompanyId!}
                    channelId={channelId!}
                  />
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      <MessageComposer
        draftBody={draftBody}
        onDraftChange={handleTextareaChange}
        onKeyDown={handleKeyDown}
        onSend={handleSend}
        isSending={postMutation.isPending}
        replyToId={replyToId}
        replyMap={replyMap}
        onCancelReply={() => setReplyToId(null)}
        textareaRef={textareaRef}
        hidden={filter === "analytics"}
      />
    </div>
  );
}
