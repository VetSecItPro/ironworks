import { api } from "./client";

export interface LibraryEntryMeta {
  id: string;
  ownerAgentId: string | null;
  visibility: string;
  projectId: string | null;
  contributorCount?: number;
}

export interface LibraryEntry {
  name: string;
  path: string;
  kind: "file" | "directory";
  size: number;
  modifiedAt: string;
  meta?: LibraryEntryMeta | null;
}

export interface LibraryTreeResponse {
  path: string;
  entries: LibraryEntry[];
}

export interface LibraryFileMeta {
  id: string;
  ownerAgentId: string | null;
  ownerUserId: string | null;
  visibility: string;
  projectId: string | null;
  lastModifiedByAgentId: string | null;
  lastModifiedAt: string;
  createdAt: string;
}

export interface LibraryFileEvent {
  id: string;
  action: string;
  agentId: string | null;
  agentName: string | null;
  userId: string | null;
  issueId: string | null;
  changeSummary: string | null;
  createdAt: string;
}

export interface LibraryContributor {
  agentId: string | null;
  agentName: string | null;
}

export interface LibraryFileContent {
  path: string;
  name: string;
  content: string | null;
  size: number;
  modifiedAt: string;
  error?: string;
  meta?: LibraryFileMeta | null;
  events?: LibraryFileEvent[];
  contributors?: LibraryContributor[];
}

export interface LibrarySearchResult extends LibraryEntry {
  matchContext?: string;
}

export interface LibrarySearchResponse {
  query: string;
  results: LibrarySearchResult[];
}

export interface LibraryScanResponse {
  scanned: boolean;
  registered: number;
}

export const libraryApi = {
  tree: (companyId: string, dirPath = "") =>
    api.get<LibraryTreeResponse>(
      `/companies/${encodeURIComponent(companyId)}/library/tree${dirPath ? `?path=${encodeURIComponent(dirPath)}` : ""}`,
    ),

  file: (companyId: string, filePath: string) =>
    api.get<LibraryFileContent>(
      `/companies/${encodeURIComponent(companyId)}/library/file?path=${encodeURIComponent(filePath)}`,
    ),

  search: (companyId: string, query: string, searchContent = false) =>
    api.get<LibrarySearchResponse>(
      `/companies/${encodeURIComponent(companyId)}/library/search?q=${encodeURIComponent(query)}${searchContent ? "&content=true" : ""}`,
    ),

  scan: (companyId: string) =>
    api.post<LibraryScanResponse>(
      `/companies/${encodeURIComponent(companyId)}/library/scan`,
      {},
    ),

  register: (companyId: string, payload: {
    filePath: string;
    title?: string;
    projectId?: string;
    issueId?: string;
    changeSummary?: string;
  }) =>
    api.post<unknown>(
      `/companies/${encodeURIComponent(companyId)}/library/register`,
      payload,
    ),
};
