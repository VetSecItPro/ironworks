import { AlertCircle, CheckCircle, ExternalLink, Loader2, LogIn } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type OAuthProvider, type OAuthStatus, oauthLoginApi } from "@/api/oauth-login.js";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface OAuthLoginModalProps {
  open: boolean;
  provider: OAuthProvider;
  providerLabel: string;
  onSuccess: () => void;
  onOpenChange: (open: boolean) => void;
}

type ModalPhase = "idle" | "starting" | "waiting" | "success" | "error";

const POLL_INTERVAL_MS = 2_000;
// Match the server-side 5-minute TTL
const MAX_POLL_DURATION_MS = 5 * 60 * 1000;

export function OAuthLoginModal({ open, provider, providerLabel, onSuccess, onOpenChange }: OAuthLoginModalProps) {
  const [phase, setPhase] = useState<ModalPhase>("idle");
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartRef = useRef<number>(0);

  // Clear poll timer and session state on close
  useEffect(() => {
    if (!open) {
      stopPolling();
      // Cancel an in-flight session when the user dismisses the modal
      const sid = sessionIdRef.current;
      if (sid && phase === "waiting") {
        oauthLoginApi.cancel(provider, sid).catch(() => {
          // Best-effort cancel; server will expire it on its own TTL
        });
      }
      resetState();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function resetState() {
    setPhase("idle");
    setLoginUrl(null);
    setErrorMessage(null);
    sessionIdRef.current = null;
    pollStartRef.current = 0;
  }

  function stopPolling() {
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  function scheduleNextPoll(sessionId: string) {
    pollTimerRef.current = setTimeout(() => {
      void poll(sessionId);
    }, POLL_INTERVAL_MS);
  }

  async function poll(sessionId: string) {
    // Stop if the modal was closed while we were sleeping
    if (sessionIdRef.current !== sessionId) return;

    const elapsed = Date.now() - pollStartRef.current;
    if (elapsed >= MAX_POLL_DURATION_MS) {
      setPhase("error");
      setErrorMessage("Sign-in timed out. Please try again.");
      return;
    }

    let result: { status: OAuthStatus; error?: string };
    try {
      result = await oauthLoginApi.check(provider, sessionId);
    } catch {
      // Transient network error — keep polling rather than surfacing an error
      scheduleNextPoll(sessionId);
      return;
    }

    switch (result.status) {
      case "complete":
        setPhase("success");
        // Brief delay so the user sees the success state before the modal closes
        setTimeout(() => {
          onSuccess();
          onOpenChange(false);
        }, 1_200);
        break;
      case "failed":
        setPhase("error");
        setErrorMessage(result.error ?? "Authentication failed. Please try again.");
        break;
      case "timeout":
        setPhase("error");
        setErrorMessage("Sign-in timed out. Please try again.");
        break;
      case "pending":
        scheduleNextPoll(sessionId);
        break;
    }
  }

  async function handleStart() {
    setPhase("starting");
    setErrorMessage(null);
    stopPolling();

    let result: { sessionId: string; loginUrl: string };
    try {
      result = await oauthLoginApi.start(provider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start sign-in. Is the CLI installed?";
      setPhase("error");
      setErrorMessage(msg);
      return;
    }

    sessionIdRef.current = result.sessionId;
    setLoginUrl(result.loginUrl);
    setPhase("waiting");
    pollStartRef.current = Date.now();

    // Open the URL automatically; user may also click the link manually
    window.open(result.loginUrl, "_blank", "noopener,noreferrer");

    scheduleNextPoll(result.sessionId);
  }

  function handleRetry() {
    stopPolling();
    sessionIdRef.current = null;
    setLoginUrl(null);
    setErrorMessage(null);
    setPhase("idle");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogIn className="h-5 w-5 shrink-0" />
            Sign in with {providerLabel}
          </DialogTitle>
          <DialogDescription>
            Authenticate once on this server. All agents will use your subscription automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Idle — prompt to start */}
          {phase === "idle" && (
            <p className="text-sm text-muted-foreground">
              Click the button below to open a browser window and sign in with your {providerLabel} account.
            </p>
          )}

          {/* Starting — waiting for CLI to print URL */}
          {phase === "starting" && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span>Starting authentication...</span>
            </div>
          )}

          {/* Waiting — URL received, polling for completion */}
          {phase === "waiting" && loginUrl && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin shrink-0 text-primary" />
                <span>Waiting for you to complete sign-in in your browser...</span>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs font-medium text-foreground mb-1.5">
                  A browser tab was opened for you. If it did not open:
                </p>
                <a
                  href={loginUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary underline underline-offset-2 break-all"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  {loginUrl}
                </a>
              </div>
            </div>
          )}

          {/* Success */}
          {phase === "success" && (
            <div className="flex items-center gap-3 text-sm text-green-600 dark:text-green-400">
              <CheckCircle className="h-5 w-5 shrink-0" />
              <span className="font-medium">Signed in successfully!</span>
            </div>
          )}

          {/* Error */}
          {phase === "error" && (
            <div className="space-y-2">
              <div className="flex items-start gap-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {/* Cancel / close */}
          {phase !== "success" && (
            <Button
              variant="outline"
              onClick={() => {
                stopPolling();
                onOpenChange(false);
              }}
            >
              {phase === "waiting" ? "Cancel" : "Close"}
            </Button>
          )}

          {/* Retry after error */}
          {phase === "error" && (
            <Button variant="default" onClick={handleRetry}>
              Try again
            </Button>
          )}

          {/* Primary CTA */}
          {(phase === "idle" || phase === "starting") && (
            <Button variant="default" onClick={handleStart} disabled={phase === "starting"}>
              {phase === "starting" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Starting...
                </>
              ) : (
                <>Open sign-in</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
