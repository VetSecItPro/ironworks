import type { IssueDocument } from "@ironworksai/shared";

export type DraftState = {
  key: string;
  title: string;
  body: string;
  baseRevisionId: string | null;
  isNew: boolean;
};

export type DocumentConflictState = {
  key: string;
  serverDocument: IssueDocument;
  localDraft: DraftState;
  showRemote: boolean;
};

export const DOCUMENT_AUTOSAVE_DEBOUNCE_MS = 900;
export const DOCUMENT_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export const getFoldedDocumentsStorageKey = (issueId: string) => `ironworks:issue-document-folds:${issueId}`;

export function loadFoldedDocumentKeys(issueId: string) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getFoldedDocumentsStorageKey(issueId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function saveFoldedDocumentKeys(issueId: string, keys: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getFoldedDocumentsStorageKey(issueId), JSON.stringify(keys));
}

export function isPlanKey(key: string) {
  return key.trim().toLowerCase() === "plan";
}

export function titlesMatchKey(title: string | null | undefined, key: string) {
  return (title ?? "").trim().toLowerCase() === key.trim().toLowerCase();
}

export function downloadDocumentFile(key: string, body: string) {
  const blob = new Blob([body], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${key}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
