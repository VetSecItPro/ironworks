import { FileText, Paperclip, X } from "lucide-react";
import type { DragEvent, RefObject } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "../../lib/utils";
import { MarkdownEditor, type MarkdownEditorRef, type MentionOption } from "../MarkdownEditor";
import { formatFileSize, type StagedIssueFile } from "./constants";

interface DescriptionSectionProps {
  description: string;
  setDescription: (description: string) => void;
  expanded: boolean;
  mentionOptions: MentionOption[];
  descriptionEditorRef: RefObject<MarkdownEditorRef | null>;
  imageUploadHandler: (file: File) => Promise<string>;
  isFileDragOver: boolean;
  handleFileDragEnter: (evt: DragEvent<HTMLDivElement>) => void;
  handleFileDragOver: (evt: DragEvent<HTMLDivElement>) => void;
  handleFileDragLeave: (evt: DragEvent<HTMLDivElement>) => void;
  handleFileDrop: (evt: DragEvent<HTMLDivElement>) => void;
  stagedFiles: StagedIssueFile[];
  removeStagedFile: (id: string) => void;
  isPending: boolean;
}

export function DescriptionSection({
  description,
  setDescription,
  expanded,
  mentionOptions,
  descriptionEditorRef,
  imageUploadHandler,
  isFileDragOver,
  handleFileDragEnter,
  handleFileDragOver,
  handleFileDragLeave,
  handleFileDrop,
  stagedFiles,
  removeStagedFile,
  isPending,
}: DescriptionSectionProps) {
  const stagedDocuments = stagedFiles.filter((file) => file.kind === "document");
  const stagedAttachments = stagedFiles.filter((file) => file.kind === "attachment");

  // biome-ignore lint/a11y/noStaticElementInteractions: description drop zone handles drag events for file attachments, not click interaction
  return (
    <div
      className={cn("px-4 pb-2 overflow-y-auto min-h-0 border-t border-border/60 pt-3", expanded ? "flex-1" : "")}
      onDragEnter={handleFileDragEnter}
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
    >
      <div className={cn("rounded-md transition-colors", isFileDragOver && "bg-accent/20")}>
        <MarkdownEditor
          ref={descriptionEditorRef}
          value={description}
          onChange={setDescription}
          placeholder="Add description..."
          bordered={false}
          mentions={mentionOptions}
          contentClassName={cn("text-sm text-muted-foreground pb-12", expanded ? "min-h-[220px]" : "min-h-[120px]")}
          imageUploadHandler={imageUploadHandler}
        />
      </div>
      {stagedFiles.length > 0 ? (
        <div className="mt-4 space-y-3 rounded-lg border border-border/70 p-3">
          {stagedDocuments.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Documents</div>
              <div className="space-y-2">
                {stagedDocuments.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-start justify-between gap-3 rounded-md border border-border/70 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                          {file.documentKey}
                        </span>
                        <span className="truncate text-sm">{file.file.name}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <FileText className="h-3.5 w-3.5" />
                        <span>{file.title || file.file.name}</span>
                        <span>-</span>
                        <span>{formatFileSize(file.file)}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="shrink-0 text-muted-foreground"
                      onClick={() => removeStagedFile(file.id)}
                      disabled={isPending}
                      title="Remove document"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {stagedAttachments.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Attachments</div>
              <div className="space-y-2">
                {stagedAttachments.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-start justify-between gap-3 rounded-md border border-border/70 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm">{file.file.name}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {file.file.type || "application/octet-stream"} - {formatFileSize(file.file)}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="shrink-0 text-muted-foreground"
                      onClick={() => removeStagedFile(file.id)}
                      disabled={isPending}
                      title="Remove attachment"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
