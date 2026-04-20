import { type CodeBlockEditorDescriptor, CodeMirrorEditor } from "@mdxeditor/editor";

export const CODE_BLOCK_LANGUAGES: Record<string, string> = {
  txt: "Text",
  md: "Markdown",
  js: "JavaScript",
  jsx: "JavaScript (JSX)",
  ts: "TypeScript",
  tsx: "TypeScript (TSX)",
  json: "JSON",
  bash: "Bash",
  sh: "Shell",
  python: "Python",
  go: "Go",
  rust: "Rust",
  sql: "SQL",
  html: "HTML",
  css: "CSS",
  yaml: "YAML",
  yml: "YAML",
};

export const FALLBACK_CODE_BLOCK_DESCRIPTOR: CodeBlockEditorDescriptor = {
  priority: 0,
  match: () => true,
  Editor: CodeMirrorEditor,
};

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isSafeMarkdownLinkUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  return !/^(javascript|data|vbscript):/i.test(trimmed);
}
