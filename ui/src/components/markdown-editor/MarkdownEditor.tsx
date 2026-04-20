import { buildAgentMentionHref, buildProjectMentionHref } from "@ironworksai/shared";
import {
  codeBlockPlugin,
  codeMirrorPlugin,
  headingsPlugin,
  imagePlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  MDXEditor,
  type MDXEditorMethods,
  markdownShortcutPlugin,
  quotePlugin,
  type RealmPlugin,
  tablePlugin,
  thematicBreakPlugin,
} from "@mdxeditor/editor";
import {
  type DragEvent,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { MentionAwareLinkNode, mentionAwareLinkNodeReplacement } from "../../lib/mention-aware-link-node";
import { applyMentionChipDecoration, clearMentionChipDecoration, parseMentionChipHref } from "../../lib/mention-chips";
import { mentionDeletionPlugin } from "../../lib/mention-deletion";
import { cn } from "../../lib/utils";
import { CODE_BLOCK_LANGUAGES, escapeRegExp, FALLBACK_CODE_BLOCK_DESCRIPTOR, isSafeMarkdownLinkUrl } from "./constants";
import { MentionDropdown } from "./MentionDropdown";
import { applyMention, detectMention, type MentionState } from "./mention-helpers";
import type { MarkdownEditorProps, MarkdownEditorRef, MentionOption } from "./types";

export const MarkdownEditor = forwardRef<MarkdownEditorRef, MarkdownEditorProps>(function MarkdownEditor(
  {
    value,
    onChange,
    placeholder,
    className,
    contentClassName,
    onBlur,
    imageUploadHandler,
    bordered = true,
    mentions,
    onSubmit,
  }: MarkdownEditorProps,
  forwardedRef,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ref = useRef<MDXEditorMethods>(null);
  const latestValueRef = useRef(value);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepthRef = useRef(0);

  const imageUploadHandlerRef = useRef(imageUploadHandler);
  imageUploadHandlerRef.current = imageUploadHandler;

  const [mentionState, setMentionState] = useState<MentionState | null>(null);
  const mentionStateRef = useRef<MentionState | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionActive = mentionState !== null && mentions && mentions.length > 0;
  const mentionOptionByKey = useMemo(() => {
    const map = new Map<string, MentionOption>();
    for (const mention of mentions ?? []) {
      if (mention.kind === "agent") {
        const agentId = mention.agentId ?? mention.id.replace(/^agent:/, "");
        map.set(`agent:${agentId}`, mention);
      }
      if (mention.kind === "project" && mention.projectId) {
        map.set(`project:${mention.projectId}`, mention);
      }
    }
    return map;
  }, [mentions]);

  const filteredMentions = useMemo(() => {
    if (!mentionState || !mentions) return [];
    const q = mentionState.query.toLowerCase();
    return mentions.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 8);
  }, [mentionState?.query, mentions]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      focus: () => {
        ref.current?.focus(undefined, { defaultSelection: "rootEnd" });
      },
    }),
    [],
  );

  const hasImageUpload = Boolean(imageUploadHandler);

  const plugins = useMemo<RealmPlugin[]>(() => {
    const imageHandler = hasImageUpload
      ? async (file: File) => {
          const handler = imageUploadHandlerRef.current;
          if (!handler) throw new Error("No image upload handler");
          try {
            const src = await handler(file);
            setUploadError(null);
            setTimeout(() => {
              const current = latestValueRef.current;
              const escapedSrc = escapeRegExp(src);
              const updated = current.replace(
                new RegExp(`(!\\[[^\\]]*\\]\\(${escapedSrc}\\))(?!\\n\\n)`, "g"),
                "$1\n\n",
              );
              if (updated !== current) {
                latestValueRef.current = updated;
                ref.current?.setMarkdown(updated);
                onChange(updated);
                requestAnimationFrame(() => {
                  ref.current?.focus(undefined, { defaultSelection: "rootEnd" });
                });
              }
            }, 100);
            return src;
          } catch (err) {
            const message = err instanceof Error ? err.message : "Image upload failed";
            setUploadError(message);
            throw err;
          }
        }
      : undefined;
    const all: RealmPlugin[] = [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      tablePlugin(),
      linkPlugin({ validateUrl: isSafeMarkdownLinkUrl }),
      linkDialogPlugin(),
      mentionDeletionPlugin(),
      thematicBreakPlugin(),
      codeBlockPlugin({
        defaultCodeBlockLanguage: "txt",
        codeBlockEditorDescriptors: [FALLBACK_CODE_BLOCK_DESCRIPTOR],
      }),
      codeMirrorPlugin({ codeBlockLanguages: CODE_BLOCK_LANGUAGES }),
      markdownShortcutPlugin(),
    ];
    if (imageHandler) {
      all.push(imagePlugin({ imageUploadHandler: imageHandler }));
    }
    return all;
  }, [hasImageUpload]);

  useEffect(() => {
    if (value !== latestValueRef.current) {
      ref.current?.setMarkdown(value);
      latestValueRef.current = value;
    }
  }, [value]);

  const decorateProjectMentions = useCallback(() => {
    const editable = containerRef.current?.querySelector('[contenteditable="true"]');
    if (!editable) return;
    const links = editable.querySelectorAll("a");
    for (const node of links) {
      const link = node as HTMLAnchorElement;
      const parsed = parseMentionChipHref(link.getAttribute("href") ?? "");
      if (!parsed) {
        clearMentionChipDecoration(link);
        continue;
      }
      if (parsed.kind === "project") {
        const option = mentionOptionByKey.get(`project:${parsed.projectId}`);
        applyMentionChipDecoration(link, {
          ...parsed,
          color: parsed.color ?? option?.projectColor ?? null,
        });
        continue;
      }
      const option = mentionOptionByKey.get(`agent:${parsed.agentId}`);
      applyMentionChipDecoration(link, {
        ...parsed,
        icon: parsed.icon ?? option?.agentIcon ?? null,
      });
    }
  }, [mentionOptionByKey]);

  const checkMention = useCallback(() => {
    if (!mentions || mentions.length === 0 || !containerRef.current) {
      mentionStateRef.current = null;
      setMentionState(null);
      return;
    }
    const result = detectMention(containerRef.current);
    mentionStateRef.current = result;
    if (result) {
      setMentionState(result);
      setMentionIndex(0);
    } else {
      setMentionState(null);
    }
  }, [mentions]);

  useEffect(() => {
    if (!mentions || mentions.length === 0) return;
    const el = containerRef.current;
    const onInput = () => requestAnimationFrame(checkMention);
    document.addEventListener("selectionchange", checkMention);
    el?.addEventListener("input", onInput, true);
    return () => {
      document.removeEventListener("selectionchange", checkMention);
      el?.removeEventListener("input", onInput, true);
    };
  }, [checkMention, mentions]);

  useEffect(() => {
    const editable = containerRef.current?.querySelector('[contenteditable="true"]');
    if (!editable) return;
    decorateProjectMentions();
    const observer = new MutationObserver(() => {
      decorateProjectMentions();
    });
    observer.observe(editable, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [decorateProjectMentions, value]);

  const selectMention = useCallback(
    (option: MentionOption) => {
      const state = mentionStateRef.current;
      if (!state) return;
      const current = latestValueRef.current;
      const next = applyMention(current, state.query, option);
      if (next !== current) {
        latestValueRef.current = next;
        ref.current?.setMarkdown(next);
        onChange(next);
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const editable = containerRef.current?.querySelector('[contenteditable="true"]');
          if (!(editable instanceof HTMLElement)) return;
          decorateProjectMentions();
          editable.focus();

          const mentionHref =
            option.kind === "project" && option.projectId
              ? buildProjectMentionHref(option.projectId, option.projectColor ?? null)
              : buildAgentMentionHref(option.agentId ?? option.id.replace(/^agent:/, ""), option.agentIcon ?? null);
          const matchingMentions = Array.from(editable.querySelectorAll("a"))
            .filter((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement)
            .filter((link) => {
              const href = link.getAttribute("href") ?? "";
              return href === mentionHref && link.textContent === `@${option.name}`;
            });
          const containerRect = containerRef.current?.getBoundingClientRect();
          const target =
            matchingMentions.sort((a, b) => {
              const rectA = a.getBoundingClientRect();
              const rectB = b.getBoundingClientRect();
              const leftA = containerRect ? rectA.left - containerRect.left : rectA.left;
              const topA = containerRect ? rectA.top - containerRect.top : rectA.top;
              const leftB = containerRect ? rectB.left - containerRect.left : rectB.left;
              const topB = containerRect ? rectB.top - containerRect.top : rectB.top;
              const distA = Math.hypot(leftA - state.left, topA - state.top);
              const distB = Math.hypot(leftB - state.left, topB - state.top);
              return distA - distB;
            })[0] ?? null;
          if (!target) return;

          const selection = window.getSelection();
          if (!selection) return;
          const range = document.createRange();
          const nextSibling = target.nextSibling;
          if (nextSibling?.nodeType === Node.TEXT_NODE) {
            const text = nextSibling.textContent ?? "";
            if (text.startsWith(" ")) {
              range.setStart(nextSibling, 1);
              range.collapse(true);
              selection.removeAllRanges();
              selection.addRange(range);
              return;
            }
          }

          range.setStartAfter(target);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        });
      });

      mentionStateRef.current = null;
      setMentionState(null);
    },
    [decorateProjectMentions, onChange],
  );

  function hasFilePayload(evt: DragEvent<HTMLDivElement>) {
    return Array.from(evt.dataTransfer?.types ?? []).includes("Files");
  }

  const canDropImage = Boolean(imageUploadHandler);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: editor container handles keyboard shortcuts and drag-drop, not click interaction
    <div
      ref={containerRef}
      className={cn(
        "relative ironworks-mdxeditor-scope",
        bordered ? "rounded-md border border-border bg-transparent" : "bg-transparent",
        isDragOver && "ring-1 ring-primary/60 bg-accent/20",
        className,
      )}
      onKeyDownCapture={(e) => {
        if (onSubmit && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          e.stopPropagation();
          onSubmit();
          return;
        }
        if (mentionActive) {
          if (e.key === " ") {
            mentionStateRef.current = null;
            setMentionState(null);
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            mentionStateRef.current = null;
            setMentionState(null);
            return;
          }
          if (filteredMentions.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              e.stopPropagation();
              setMentionIndex((prev) => Math.min(prev + 1, filteredMentions.length - 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              e.stopPropagation();
              setMentionIndex((prev) => Math.max(prev - 1, 0));
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              e.stopPropagation();
              selectMention(filteredMentions[mentionIndex]);
              return;
            }
          }
        }
      }}
      onDragEnter={(evt) => {
        if (!canDropImage || !hasFilePayload(evt)) return;
        dragDepthRef.current += 1;
        setIsDragOver(true);
      }}
      onDragOver={(evt) => {
        if (!canDropImage || !hasFilePayload(evt)) return;
        evt.preventDefault();
        evt.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        if (!canDropImage) return;
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setIsDragOver(false);
      }}
      onDrop={() => {
        dragDepthRef.current = 0;
        setIsDragOver(false);
      }}
    >
      <MDXEditor
        ref={ref}
        markdown={value}
        placeholder={placeholder}
        onChange={(next) => {
          latestValueRef.current = next;
          onChange(next);
        }}
        onBlur={() => onBlur?.()}
        className={cn("ironworks-mdxeditor", !bordered && "ironworks-mdxeditor--borderless")}
        contentEditableClassName={cn(
          "ironworks-mdxeditor-content focus:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:list-item",
          contentClassName,
        )}
        additionalLexicalNodes={[MentionAwareLinkNode, mentionAwareLinkNodeReplacement]}
        plugins={plugins}
      />

      {mentionActive && filteredMentions.length > 0 && (
        <MentionDropdown
          filteredMentions={filteredMentions}
          mentionIndex={mentionIndex}
          viewportTop={mentionState.viewportTop}
          viewportLeft={mentionState.viewportLeft}
          onSelect={selectMention}
          onHover={setMentionIndex}
        />
      )}

      {isDragOver && canDropImage && (
        <div
          className={cn(
            "pointer-events-none absolute inset-1 z-40 flex items-center justify-center rounded-md border border-dashed border-primary/80 bg-primary/10 text-xs font-medium text-primary",
            !bordered && "inset-0 rounded-sm",
          )}
        >
          Drop image to upload
        </div>
      )}
      {uploadError && <p className="px-3 pb-2 text-xs text-destructive">{uploadError}</p>}
    </div>
  );
});
