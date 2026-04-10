import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { cn } from "../lib/utils";
import {
  HeaderBar,
  TitleSection,
  AssignmentRow,
  ExecutionWorkspaceSection,
  AssigneeOptionsSection,
  DescriptionSection,
  PropertyChipsBar,
  FooterBar,
} from "./new-issue";
import { useNewIssueForm } from "./new-issue/useNewIssueForm";

export function NewIssueDialog() {
  const form = useNewIssueForm();

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      form.handleSubmit();
    }
  }

  return (
    <Dialog
      open={form.newIssueOpen}
      onOpenChange={(open) => {
        if (!open && !form.createIssue.isPending) form.closeNewIssue();
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className={cn(
          "p-0 gap-0 flex flex-col max-h-[calc(100dvh-2rem)]",
          form.expanded ? "sm:max-w-2xl h-[calc(100dvh-2rem)]" : "sm:max-w-lg"
        )}
        onKeyDown={handleKeyDown}
        onEscapeKeyDown={(event) => {
          if (form.createIssue.isPending) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (form.createIssue.isPending) { event.preventDefault(); return; }
          const target = event.detail.originalEvent.target as HTMLElement | null;
          if (target?.closest("[data-radix-popper-content-wrapper]")) event.preventDefault();
        }}
      >
        <HeaderBar
          dialogCompany={form.dialogCompany}
          companies={form.companies}
          effectiveCompanyId={form.effectiveCompanyId}
          companyOpen={form.companyOpen}
          setCompanyOpen={form.setCompanyOpen}
          handleCompanyChange={form.handleCompanyChange}
          expanded={form.expanded}
          setExpanded={form.setExpanded}
          isPending={form.createIssue.isPending}
          onClose={() => form.closeNewIssue()}
          setTitle={form.setTitle}
          setDescription={form.setDescription}
          setPriority={form.setPriority}
        />

        <TitleSection
          title={form.title}
          setTitle={form.setTitle}
          isPending={form.createIssue.isPending}
          suggestedPriority={form.suggestedPriority}
          priority={form.priority}
          setPriority={form.setPriority}
          similarIssues={form.similarIssues}
          assigneeValue={form.assigneeValue}
          projectId={form.projectId}
          descriptionEditorRef={form.descriptionEditorRef}
          assigneeSelectorRef={form.assigneeSelectorRef}
          projectSelectorRef={form.projectSelectorRef}
        />

        <AssignmentRow
          assigneeValue={form.assigneeValue}
          setAssigneeValue={form.setAssigneeValue}
          assigneeOptions={form.assigneeOptions}
          projectId={form.projectId}
          handleProjectChange={form.handleProjectChange}
          projectOptions={form.projectOptions}
          goalId={form.goalId}
          setGoalId={form.setGoalId}
          goalOptions={form.goalOptions}
          currentAssignee={form.currentAssignee}
          currentProject={form.currentProject}
          orderedProjects={form.orderedProjects}
          agents={form.agents}
          descriptionEditorRef={form.descriptionEditorRef}
          assigneeSelectorRef={form.assigneeSelectorRef}
          projectSelectorRef={form.projectSelectorRef}
        />

        {form.currentProject && form.currentProjectSupportsExecutionWorkspace && (
          <ExecutionWorkspaceSection
            executionWorkspaceMode={form.executionWorkspaceMode}
            setExecutionWorkspaceMode={form.setExecutionWorkspaceMode}
            selectedExecutionWorkspaceId={form.selectedExecutionWorkspaceId}
            setSelectedExecutionWorkspaceId={form.setSelectedExecutionWorkspaceId}
            deduplicatedReusableWorkspaces={form.deduplicatedReusableWorkspaces}
            selectedReusableExecutionWorkspace={form.selectedReusableExecutionWorkspace}
          />
        )}

        {form.supportsAssigneeOverrides && (
          <AssigneeOptionsSection
            assigneeOptionsOpen={form.assigneeOptionsOpen}
            setAssigneeOptionsOpen={form.setAssigneeOptionsOpen}
            assigneeOptionsTitle={form.assigneeOptionsTitle}
            assigneeAdapterType={form.assigneeAdapterType}
            assigneeModelOverride={form.assigneeModelOverride}
            setAssigneeModelOverride={form.setAssigneeModelOverride}
            modelOverrideOptions={form.modelOverrideOptions}
            assigneeThinkingEffort={form.assigneeThinkingEffort}
            setAssigneeThinkingEffort={form.setAssigneeThinkingEffort}
            assigneeChrome={form.assigneeChrome}
            setAssigneeChrome={form.setAssigneeChrome}
          />
        )}

        <DescriptionSection
          description={form.description}
          setDescription={form.setDescription}
          expanded={form.expanded}
          mentionOptions={form.mentionOptions}
          descriptionEditorRef={form.descriptionEditorRef}
          imageUploadHandler={async (file) => {
            const asset = await form.uploadDescriptionImage.mutateAsync(file);
            return asset.contentPath;
          }}
          isFileDragOver={form.isFileDragOver}
          handleFileDragEnter={form.handleFileDragEnter}
          handleFileDragOver={form.handleFileDragOver}
          handleFileDragLeave={form.handleFileDragLeave}
          handleFileDrop={form.handleFileDrop}
          stagedFiles={form.stagedFiles}
          removeStagedFile={form.removeStagedFile}
          isPending={form.createIssue.isPending}
        />

        <PropertyChipsBar
          status={form.status}
          setStatus={form.setStatus}
          statusOpen={form.statusOpen}
          setStatusOpen={form.setStatusOpen}
          priority={form.priority}
          setPriority={form.setPriority}
          priorityOpen={form.priorityOpen}
          setPriorityOpen={form.setPriorityOpen}
          moreOpen={form.moreOpen}
          setMoreOpen={form.setMoreOpen}
          isPending={form.createIssue.isPending}
          stageFileInputRef={form.stageFileInputRef}
          handleStageFilesPicked={form.handleStageFilesPicked}
        />

        <FooterBar
          isPending={form.createIssue.isPending}
          isError={form.createIssue.isError}
          errorMessage={form.createIssueErrorMessage}
          canDiscardDraft={form.canDiscardDraft}
          titleEmpty={!form.title.trim()}
          onDiscard={form.discardDraft}
          onSubmit={form.handleSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}
