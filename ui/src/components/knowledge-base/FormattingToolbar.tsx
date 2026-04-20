import { Bold, Code, Heading1, Heading2, Italic, Link as LinkIcon, List, ListOrdered } from "lucide-react";

export function FormattingToolbar({
  textareaRef,
  value,
  onChange,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (newValue: string) => void;
}) {
  function insertWrapper(before: string, after: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const newText = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(newText);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, end + before.length);
    }, 0);
  }

  function insertPrefix(prefix: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    // Find start of current line
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const newText = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    onChange(newText);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length);
    }, 0);
  }

  const buttons = [
    { icon: Bold, label: "Bold", action: () => insertWrapper("**", "**") },
    { icon: Italic, label: "Italic", action: () => insertWrapper("*", "*") },
    { icon: Heading1, label: "Heading 1", action: () => insertPrefix("# ") },
    { icon: Heading2, label: "Heading 2", action: () => insertPrefix("## ") },
    { icon: List, label: "Bullet list", action: () => insertPrefix("- ") },
    { icon: ListOrdered, label: "Numbered list", action: () => insertPrefix("1. ") },
    { icon: LinkIcon, label: "Link", action: () => insertWrapper("[", "](url)") },
    { icon: Code, label: "Code", action: () => insertWrapper("`", "`") },
  ];

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border bg-muted/10 shrink-0 flex-wrap">
      {buttons.map(({ icon: Icon, label, action }) => (
        <button
          key={label}
          type="button"
          onClick={action}
          className="flex items-center justify-center h-7 w-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          title={label}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
