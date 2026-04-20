import type { IssueAttachment } from "@ironworksai/shared";
import { Trash2 } from "lucide-react";
import type { DragEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface IssueAttachmentsSectionProps {
  attachments: IssueAttachment[];
  attachmentUploadButton: ReactNode;
  attachmentError: string | null;
  attachmentDragActive: boolean;
  onDragEnter: (evt: DragEvent<HTMLDivElement>) => void;
  onDragOver: (evt: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (evt: DragEvent<HTMLDivElement>) => void;
  onDrop: (evt: DragEvent<HTMLDivElement>) => void;
  onDeleteAttachment: (id: string) => void;
  deleteAttachmentPending: boolean;
}

function isImageAttachment(attachment: IssueAttachment) {
  return attachment.contentType.startsWith("image/");
}

export function IssueAttachmentsSection({
  attachments,
  attachmentUploadButton,
  attachmentError,
  attachmentDragActive,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onDeleteAttachment,
  deleteAttachmentPending,
}: IssueAttachmentsSectionProps) {
  if (attachments.length === 0) return null;

  // biome-ignore lint/a11y/noStaticElementInteractions: drop zone container handles drag events, not click interaction
  return (
    <div
      className={cn("space-y-3 rounded-lg transition-colors")}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">Attachments</h3>
        {attachmentUploadButton}
      </div>

      {attachmentError && <p className="text-xs text-destructive">{attachmentError}</p>}

      <div className="space-y-2">
        {attachments.map((attachment) => (
          <div key={attachment.id} className="border border-border rounded-md p-2">
            <div className="flex items-center justify-between gap-2">
              <a
                href={attachment.contentPath}
                target="_blank"
                rel="noreferrer"
                className="text-xs hover:underline truncate"
                title={attachment.originalFilename ?? attachment.id}
              >
                {attachment.originalFilename ?? attachment.id}
              </a>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => onDeleteAttachment(attachment.id)}
                disabled={deleteAttachmentPending}
                title="Delete attachment"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {attachment.contentType} · {(attachment.byteSize / 1024).toFixed(1)} KB
            </p>
            {isImageAttachment(attachment) && (
              <a href={attachment.contentPath} target="_blank" rel="noreferrer">
                <img
                  src={attachment.contentPath}
                  alt={attachment.originalFilename ?? "attachment"}
                  className="mt-2 max-h-56 rounded border border-border object-contain bg-accent/10"
                  loading="lazy"
                />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
