import { Eye, EyeOff, File, FileCode2, FileJson, FileText, Globe, Lock } from "lucide-react";

export function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "md":
    case "mdx":
      return FileText;
    case "json":
    case "yaml":
    case "yml":
      return FileJson;
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "py":
    case "sh":
    case "bash":
    case "go":
    case "rs":
      return FileCode2;
    default:
      return File;
  }
}

export function isMarkdown(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext === "md" || ext === "mdx";
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export function visibilityIcon(visibility: string) {
  switch (visibility) {
    case "private":
      return Lock;
    case "project":
      return EyeOff;
    case "company":
      return Globe;
    default:
      return Eye;
  }
}

export const DOC_TYPE_COLORS: Record<string, string> = {
  "weekly-report": "bg-blue-500/10 text-blue-500",
  "monthly-report": "bg-indigo-500/10 text-indigo-400",
  "post-mortem": "bg-red-500/10 text-red-500",
  decision: "bg-amber-500/10 text-amber-500",
  "board-packet": "bg-purple-500/10 text-purple-400",
  "hiring-record": "bg-green-500/10 text-green-500",
  folder: "bg-muted text-muted-foreground",
};
