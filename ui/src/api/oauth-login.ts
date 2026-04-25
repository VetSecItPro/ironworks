import { api } from "./client.js";

export type OAuthProvider = "anthropic" | "openai" | "google";
export type OAuthStatus = "pending" | "complete" | "failed" | "timeout";

export interface OAuthStartResult {
  sessionId: string;
  loginUrl: string;
}

export interface OAuthCheckResult {
  status: OAuthStatus;
  error?: string;
}

export const oauthLoginApi = {
  /** Spawn the CLI login subprocess and return the auth URL + a session ID. */
  start(provider: OAuthProvider): Promise<OAuthStartResult> {
    return api.post<OAuthStartResult>(`/oauth-login/${provider}/start`, {});
  },

  /** Poll for completion. Returns the current session status. */
  check(provider: OAuthProvider, sessionId: string): Promise<OAuthCheckResult> {
    return api.get<OAuthCheckResult>(`/oauth-login/${provider}/check?sessionId=${encodeURIComponent(sessionId)}`);
  },

  /** Cancel an in-flight session (e.g. user dismissed the modal). */
  cancel(provider: OAuthProvider, sessionId: string): Promise<void> {
    return api.delete<void>(`/oauth-login/${provider}/sessions/${encodeURIComponent(sessionId)}`);
  },
};
