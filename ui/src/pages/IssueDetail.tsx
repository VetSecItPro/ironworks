import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useLocation, useNavigate, useParams } from "@/lib/router";
import { usePanel } from "../context/PanelContext";
import { useToast } from "../context/ToastContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { readIssueDetailBreadcrumb } from "../lib/issueDetailBreadcrumb";
import { cn } from "../lib/utils";
import { InlineEditor } from "../components/InlineEditor";
import { CommentThread } from "../components/CommentThread";
import { IssueDocumentsSection } from "../components/IssueDocumentsSection";
import { IssueProperties } from "../components/IssueProperties";
import { IssueWorkspaceCard } from "../components/IssueWorkspaceCard";
import { LiveRunWidget } from "../components/LiveRunWidget";
import { ScrollToBottom } from "../components/ScrollToBottom";
import { SLATimer } from "../components/SLATimer";
import { PluginSlotMount, PluginSlotOutlet } from "@/plugins/slots";
import { PluginLauncherOutlet } from "@/plugins/launchers";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity as ActivityIcon,
  EyeOff,
  GitBranch,
  ListTree,
  MessageSquare,
  Paperclip,
} from "lucide-react";
import { IssueDependencyGraph } from "../components/IssueDependencyGraph";
import {
  IssueAncestorBreadcrumb,
  IssueGoalBanner,
  IssueLiveRunBanner,
  IssueHeaderBar,
  IssueAttachmentsSection,
  IssueSubissuesTab,
  IssueActivityTab,
  IssueApprovalsSection,
  IssueMobilePropsDrawer,
  isMarkdownFile,
} from "../components/issue-detail";
import { useIssueDetailData } from "../components/issue-detail/useIssueDetailData";

export function IssueDetail() {
  const { issueId } = useParams<{ issueId: string }>();
  const { openPanel, closePanel, panelVisible, setPanelVisible } = usePanel();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const location = useLocation();
  const { pushToast } = useToast();

  // --- UI state ---
  const [moreOpen, setMoreOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mobilePropsOpen, setMobilePropsOpen] = useState(false);
  const [detailTab, setDetailTab] = useState("comments");
  const [secondaryOpen, setSecondaryOpen] = useState({ approvals: false });
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentDragActive, setAttachmentDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastMarkedReadIssueIdRef = useRef<string | null>(null);

  // --- Data layer (queries, mutations, derived data) ---
  const data = useIssueDetailData(issueId);
  const {
    issue, isLoading, error, session, projects, orderedProjects,
    parentGoal, parentGoalProgress, agents, liveRuns, activeRun,
    hasLiveRuns, agentMap, mentionOptions, childIssues, allIssues,
    commentReassignOptions, actualAssigneeValue, suggestedAssigneeValue,
    commentsWithRunMeta, timelineRuns, issueCostSummary, activity,
    linkedRuns, linkedApprovals, attachments, issuePluginTabItems,
    updateIssue, addComment, addCommentAndReassign,
    uploadAttachment, importMarkdownDocument, deleteAttachment, markIssueRead,
  } = data;

  const activePluginTab = issuePluginTabItems.find((item) => item.value === detailTab) ?? null;

  const sourceBreadcrumb = useMemo(
    () => readIssueDetailBreadcrumb(location.state) ?? { label: "Issues", href: "/issues" },
    [location.state],
  );

  // --- Effects ---
  useEffect(() => {
    const titleLabel = issue?.title ?? issueId ?? "Issue";
    setBreadcrumbs([sourceBreadcrumb, { label: hasLiveRuns ? `🔵 ${titleLabel}` : titleLabel }]);
  }, [setBreadcrumbs, sourceBreadcrumb, issue, issueId, hasLiveRuns]);

  useEffect(() => {
    if (issue?.identifier && issueId !== issue.identifier) {
      navigate(`/issues/${issue.identifier}`, { replace: true, state: location.state });
    }
  }, [issue, issueId, navigate, location.state]);

  useEffect(() => {
    if (!issue?.id) return;
    if (lastMarkedReadIssueIdRef.current === issue.id) return;
    lastMarkedReadIssueIdRef.current = issue.id;
    markIssueRead.mutate(issue.id);
  }, [issue?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (issue) {
      openPanel(<IssueProperties issue={issue} onUpdate={(d) => updateIssue.mutate(d)} />);
    }
    return () => closePanel();
  }, [issue]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Handlers ---
  const copyIssueToClipboard = async () => {
    if (!issue) return;
    const decodeEntities = (text: string) => {
      const el = document.createElement("textarea");
      el.innerHTML = text;
      return el.value;
    };
    const title = decodeEntities(issue.title);
    const body = decodeEntities(issue.description ?? "");
    const md = `# ${issue.identifier}: ${title}\n\n${body}`.trimEnd();
    await navigator.clipboard.writeText(md);
    setCopied(true);
    pushToast({ title: "Copied to clipboard", tone: "success" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFilePicked = async (evt: ChangeEvent<HTMLInputElement>) => {
    const files = evt.target.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      if (isMarkdownFile(file)) {
        await importMarkdownDocument.mutateAsync(file);
      } else {
        await uploadAttachment.mutateAsync(file);
      }
    }
    setAttachmentError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAttachmentDrop = async (evt: DragEvent<HTMLDivElement>) => {
    evt.preventDefault();
    setAttachmentDragActive(false);
    const files = evt.dataTransfer.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      if (isMarkdownFile(file)) {
        await importMarkdownDocument.mutateAsync(file);
      } else {
        await uploadAttachment.mutateAsync(file);
      }
    }
  };

  // --- Loading / Error ---
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (!issue) return null;

  const ancestors = issue.ancestors ?? [];
  const attachmentList = attachments ?? [];
  const hasAttachments = attachmentList.length > 0;
  const activeAgentId = activeRun?.agentId ?? (liveRuns ?? [])[0]?.agentId;
  const activeAgent = activeAgentId ? (agents ?? []).find((a) => a.id === activeAgentId) : null;

  const attachmentUploadButton = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf,text/plain,text/markdown,application/json,text/csv,text/html,.md,.markdown"
        className="hidden"
        onChange={handleFilePicked}
        multiple
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadAttachment.isPending || importMarkdownDocument.isPending}
        className={cn("shadow-none", attachmentDragActive && "border-primary bg-primary/5")}
      >
        <Paperclip className="h-3.5 w-3.5 mr-1.5" />
        {uploadAttachment.isPending || importMarkdownDocument.isPending ? "Uploading..." : (
          <>
            <span className="hidden sm:inline">Upload attachment</span>
            <span className="sm:hidden">Upload</span>
          </>
        )}
      </Button>
    </>
  );

  // --- Render ---
  return (
    <div className="max-w-2xl space-y-6">
      <IssueAncestorBreadcrumb ancestors={ancestors} issueTitle={issue.title} locationState={location.state} />

      {issue.hiddenAt && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <EyeOff className="h-4 w-4 shrink-0" />
          This issue is hidden
        </div>
      )}

      {parentGoal && <IssueGoalBanner parentGoal={parentGoal} parentGoalProgress={parentGoalProgress} />}
      {hasLiveRuns && <IssueLiveRunBanner activeAgentName={activeAgent?.name} />}

      <div className="flex items-center gap-1.5">
        <div className="flex -space-x-1.5">
          <div className="h-5 w-5 rounded-full bg-foreground/80 border-2 border-background flex items-center justify-center text-[10px] font-medium text-background" title="You">U</div>
        </div>
        <span className="text-[10px] text-muted-foreground">Viewing now</span>
      </div>

      <div className="space-y-3">
        <IssueHeaderBar
          issueId={issue.id}
          identifier={issue.identifier ?? null}
          status={issue.status}
          priority={issue.priority}
          projectId={issue.projectId ?? null}
          projects={(projects ?? []).map((p) => ({ id: p.id, name: p.name }))}
          labels={(issue.labels ?? []).map((l) => ({ id: l.id, name: l.name, color: l.color }))}
          hasLiveRuns={hasLiveRuns}
          originKind={issue.originKind ?? null}
          originId={issue.originId ?? null}
          panelVisible={panelVisible}
          copied={copied}
          moreOpen={moreOpen}
          onStatusChange={(status) => updateIssue.mutate({ status })}
          onPriorityChange={(priority) => updateIssue.mutate({ priority })}
          onCopy={copyIssueToClipboard}
          onMobilePropsOpen={() => setMobilePropsOpen(true)}
          onPanelShow={() => setPanelVisible(true)}
          onMoreOpenChange={setMoreOpen}
          onHide={() => {
            updateIssue.mutate({ hiddenAt: new Date().toISOString() }, { onSuccess: () => navigate("/issues/all") });
            setMoreOpen(false);
          }}
        />
        <InlineEditor value={issue.title} onSave={(title) => updateIssue.mutateAsync({ title })} as="h2" className="text-xl font-bold" />
        <InlineEditor
          value={issue.description ?? ""}
          onSave={(description) => updateIssue.mutateAsync({ description })}
          as="p"
          className="text-[15px] leading-7 text-foreground"
          placeholder="Add a description..."
          multiline
          mentions={mentionOptions}
          imageUploadHandler={async (file) => { const a = await uploadAttachment.mutateAsync(file); return a.contentPath; }}
        />
        <SLATimer
          priority={issue.priority}
          status={issue.status}
          createdAt={typeof issue.createdAt === "string" ? issue.createdAt : new Date(issue.createdAt).toISOString()}
        />
      </div>

      <PluginSlotOutlet slotTypes={["toolbarButton", "contextMenuItem"]} entityType="issue" context={{ companyId: issue.companyId, projectId: issue.projectId ?? null, entityId: issue.id, entityType: "issue" }} className="flex flex-wrap gap-2" itemClassName="inline-flex" missingBehavior="placeholder" />
      <PluginLauncherOutlet placementZones={["toolbarButton"]} entityType="issue" context={{ companyId: issue.companyId, projectId: issue.projectId ?? null, entityId: issue.id, entityType: "issue" }} className="flex flex-wrap gap-2" itemClassName="inline-flex" />
      <PluginSlotOutlet slotTypes={["taskDetailView"]} entityType="issue" context={{ companyId: issue.companyId, projectId: issue.projectId ?? null, entityId: issue.id, entityType: "issue" }} className="space-y-3" itemClassName="rounded-lg border border-border p-3" missingBehavior="placeholder" />

      <IssueDocumentsSection
        issue={issue}
        canDeleteDocuments={Boolean(session?.user?.id)}
        mentions={mentionOptions}
        imageUploadHandler={async (file) => { const a = await uploadAttachment.mutateAsync(file); return a.contentPath; }}
        extraActions={!hasAttachments ? attachmentUploadButton : undefined}
      />

      <IssueAttachmentsSection
        attachments={attachmentList}
        attachmentUploadButton={attachmentUploadButton}
        attachmentError={attachmentError}
        attachmentDragActive={attachmentDragActive}
        onDragEnter={(evt) => { evt.preventDefault(); setAttachmentDragActive(true); }}
        onDragOver={(evt) => { evt.preventDefault(); setAttachmentDragActive(true); }}
        onDragLeave={(evt) => { if (evt.currentTarget.contains(evt.relatedTarget as Node | null)) return; setAttachmentDragActive(false); }}
        onDrop={(evt) => void handleAttachmentDrop(evt)}
        onDeleteAttachment={(id) => deleteAttachment.mutate(id)}
        deleteAttachmentPending={deleteAttachment.isPending}
      />

      <IssueWorkspaceCard issue={issue} project={orderedProjects.find((p) => p.id === issue.projectId) ?? null} onUpdate={(d) => updateIssue.mutate(d)} />
      <Separator />

      <Tabs value={detailTab} onValueChange={setDetailTab} className="space-y-3">
        <TabsList variant="line" className="w-full justify-start gap-1">
          <TabsTrigger value="comments" className="gap-1.5"><MessageSquare className="h-3.5 w-3.5" />Comments</TabsTrigger>
          <TabsTrigger value="subissues" className="gap-1.5"><ListTree className="h-3.5 w-3.5" />Sub-issues</TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5"><ActivityIcon className="h-3.5 w-3.5" />Activity</TabsTrigger>
          <TabsTrigger value="dependencies" className="gap-1.5"><GitBranch className="h-3.5 w-3.5" />Dependencies</TabsTrigger>
          {issuePluginTabItems.map((item) => <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>)}
        </TabsList>

        <TabsContent value="comments">
          <CommentThread
            comments={commentsWithRunMeta}
            linkedRuns={timelineRuns}
            companyId={issue.companyId}
            projectId={issue.projectId}
            issueStatus={issue.status}
            agentMap={agentMap}
            draftKey={`ironworks:issue-comment-draft:${issue.id}`}
            enableReassign
            reassignOptions={commentReassignOptions}
            currentAssigneeValue={actualAssigneeValue}
            suggestedAssigneeValue={suggestedAssigneeValue}
            mentions={mentionOptions}
            onAdd={async (body, reopen, reassignment, replyToId) => {
              if (reassignment) { await addCommentAndReassign.mutateAsync({ body, reopen, reassignment }); return; }
              await addComment.mutateAsync({ body, reopen, replyToId });
            }}
            imageUploadHandler={async (file) => { const a = await uploadAttachment.mutateAsync(file); return a.contentPath; }}
            onAttachImage={async (file) => { await uploadAttachment.mutateAsync(file); }}
            liveRunSlot={<LiveRunWidget issueId={issueId!} companyId={issue.companyId} />}
          />
        </TabsContent>
        <TabsContent value="subissues"><IssueSubissuesTab childIssues={childIssues} agentMap={agentMap} locationState={location.state} /></TabsContent>
        <TabsContent value="activity"><IssueActivityTab activity={activity} linkedRunsCount={(linkedRuns ?? []).length} issueCostSummary={issueCostSummary} agentMap={agentMap} /></TabsContent>
        <TabsContent value="dependencies"><IssueDependencyGraph issue={issue} allIssues={allIssues ?? []} /></TabsContent>
        {activePluginTab && (
          <TabsContent value={activePluginTab.value}>
            <PluginSlotMount slot={activePluginTab.slot} context={{ companyId: issue.companyId, projectId: issue.projectId ?? null, entityId: issue.id, entityType: "issue" }} missingBehavior="placeholder" />
          </TabsContent>
        )}
      </Tabs>

      <IssueApprovalsSection linkedApprovals={linkedApprovals ?? []} open={secondaryOpen.approvals} onOpenChange={(open) => setSecondaryOpen((prev) => ({ ...prev, approvals: open }))} />
      <IssueMobilePropsDrawer open={mobilePropsOpen} onOpenChange={setMobilePropsOpen} issue={issue} onUpdate={(d) => updateIssue.mutate(d)} />
      <ScrollToBottom />
    </div>
  );
}
