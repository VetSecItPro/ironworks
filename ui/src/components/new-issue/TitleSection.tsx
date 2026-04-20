import { AlertTriangle, Wand2 } from "lucide-react";
import type { RefObject } from "react";
import type { MarkdownEditorRef } from "../MarkdownEditor";
import type { SimilarIssue } from "./constants";

interface TitleSectionProps {
  title: string;
  setTitle: (title: string) => void;
  isPending: boolean;
  suggestedPriority: string | null;
  priority: string;
  setPriority: (priority: string) => void;
  similarIssues: SimilarIssue[];
  assigneeValue: string;
  projectId: string;
  descriptionEditorRef: RefObject<MarkdownEditorRef | null>;
  assigneeSelectorRef: RefObject<HTMLButtonElement | null>;
  projectSelectorRef: RefObject<HTMLButtonElement | null>;
}

export function TitleSection({
  title,
  setTitle,
  isPending,
  suggestedPriority,
  priority,
  setPriority,
  similarIssues,
  assigneeValue,
  projectId,
  descriptionEditorRef,
  assigneeSelectorRef,
  projectSelectorRef,
}: TitleSectionProps) {
  return (
    <div className="px-4 pt-4 pb-2 shrink-0">
      <label className="block text-xs text-muted-foreground mb-1 required-asterisk">Title</label>
      <textarea
        className="w-full text-lg font-semibold bg-transparent outline-none resize-none overflow-hidden placeholder:text-muted-foreground/70"
        placeholder="Mission title"
        required
        rows={1}
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        readOnly={isPending}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            descriptionEditorRef.current?.focus();
          }
          if (e.key === "Tab" && !e.shiftKey) {
            e.preventDefault();
            if (assigneeValue) {
              if (projectId) {
                descriptionEditorRef.current?.focus();
              } else {
                projectSelectorRef.current?.focus();
              }
            } else {
              assigneeSelectorRef.current?.focus();
            }
          }
        }}
      />

      {/* Smart priority suggestion */}
      {suggestedPriority && !priority && (
        <button
          type="button"
          className="mt-1 inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border border-dashed border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
          onClick={() => setPriority(suggestedPriority)}
        >
          <Wand2 className="h-3 w-3" />
          Suggested priority: <span className="font-semibold capitalize">{suggestedPriority}</span>
          <span className="text-[10px] text-muted-foreground">(click to apply)</span>
        </button>
      )}

      {/* Duplicate issue detection */}
      {similarIssues.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {similarIssues.map((match) => (
            <div
              key={match.identifier}
              className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border border-yellow-300 bg-yellow-50 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300"
            >
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>
                Similar: <span className="font-mono font-medium">{match.identifier}</span> - {match.title}
              </span>
              <span className="text-[10px] ml-auto text-yellow-600 dark:text-yellow-500">
                {Math.round(match.similarity * 100)}% match
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
