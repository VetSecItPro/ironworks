/**
 * Settings > Provider API Keys page.
 *
 * Zero-knowledge design: API keys are write-only. The server never echoes them back.
 * We display the last-4 chars of each stored key as confirmation.
 * Audit-safe: no key value reaches console.log, localStorage, or any DOM attribute
 * other than the password input's value field (which the browser does not include
 * in accessibility trees or serialized HTML).
 *
 * Requires operator or owner role. Member-only users see an access-denied notice.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NavLink } from "@/lib/router";
import { useProviderStatus } from "../../hooks/useProviderStatus";
import { relativeTime } from "../../lib/utils";
import type { HttpAdapterProviderType, ProviderStatusResponse, ProviderTestResponse } from "../../types/providers";
import { SettingsProviderNav } from "./SettingsProviderNav";

// ─── Static provider metadata ────────────────────────────────────────────────

interface ProviderMeta {
  type: HttpAdapterProviderType;
  name: string;
  keyHint: string;
}

const PROVIDERS: ProviderMeta[] = [
  { type: "poe_api", name: "Poe", keyHint: "Starts with sk-poe-" },
  { type: "anthropic_api", name: "Anthropic", keyHint: "Starts with sk-ant-" },
  { type: "openai_api", name: "OpenAI", keyHint: "Starts with sk-" },
  { type: "openrouter_api", name: "OpenRouter", keyHint: "Starts with sk-or-v1-" },
];

// ─── Helper: masked key display ───────────────────────────────────────────────

function MaskedKey({ lastFour }: { lastFour: string }) {
  return (
    <span className="font-mono text-xs text-muted-foreground">
      {"\u2022\u2022\u2022\u2022 sk\u2022\u2022\u2022\u2022\u2026"}
      {lastFour}
    </span>
  );
}

// ─── Helper: last-tested status line ─────────────────────────────────────────

function TestStatusLine({ status }: { status: ProviderStatusResponse }) {
  if (!status.configured) {
    return <span className="text-xs text-muted-foreground">Not configured</span>;
  }
  if (!status.lastTestedAt) {
    return <span className="text-xs text-muted-foreground">Never tested</span>;
  }

  const when = relativeTime(status.lastTestedAt);
  const pass = status.lastTestStatus === "pass";

  return (
    <span className="text-xs text-muted-foreground">
      Last tested: {when} -{" "}
      <span className={pass ? "text-green-600 dark:text-green-400 font-medium" : "text-destructive font-medium"}>
        {pass ? "PASS" : "FAIL"}
      </span>
    </span>
  );
}

// ─── Per-provider card ────────────────────────────────────────────────────────

interface ProviderCardProps {
  companyId: string;
  meta: ProviderMeta;
}

function ProviderCard({ companyId, meta }: ProviderCardProps) {
  const queryClient = useQueryClient();
  const { status, isLoading, refetch } = useProviderStatus(companyId, meta.type);

  // Key entry state — only held in React state (never persisted locally)
  const [keyInput, setKeyInput] = useState("");
  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotateInput, setRotateInput] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const basePath = `/companies/${companyId}/providers/${meta.type}`;
  const statusKey = ["providers", companyId, meta.type, "status"];

  const saveMutation = useMutation({
    mutationFn: async (apiKey: string) => {
      // PUT secret — server stores it in the vault, never returns the plaintext
      await api.put(`${basePath}/secret`, { apiKey });
    },
    onSuccess: () => {
      setKeyInput("");
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: statusKey });
      refetch();
    },
    onError: (e) => setActionError(e instanceof Error ? e.message : "Save failed"),
  });

  const rotateMutation = useMutation({
    mutationFn: async (apiKey: string) => {
      await api.put(`${basePath}/secret`, { apiKey });
    },
    onSuccess: () => {
      setRotateInput("");
      setRotateOpen(false);
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: statusKey });
      refetch();
    },
    onError: (e) => setActionError(e instanceof Error ? e.message : "Rotate failed"),
  });

  const testMutation = useMutation({
    mutationFn: () => api.post<ProviderTestResponse>(`${basePath}/test`, {}),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: statusKey });
      refetch();
    },
    onError: (e) => setActionError(e instanceof Error ? e.message : "Test failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete<{ ok: true }>(`${basePath}/secret`),
    onSuccess: () => {
      setDeleteOpen(false);
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: statusKey });
      refetch();
    },
    onError: (e) => setActionError(e instanceof Error ? e.message : "Remove failed"),
  });

  const configured = status?.configured ?? false;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">{meta.name}</CardTitle>
            {!isLoading && (
              <Badge
                variant={configured ? "default" : "muted"}
                className={configured ? "bg-green-600/15 text-green-600 dark:text-green-400 border-0" : ""}
              >
                {configured ? "Configured" : "Not configured"}
              </Badge>
            )}
          </div>
          {status && <TestStatusLine status={status} />}
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Masked key display when configured */}
          {configured && status?.keyLastFour && <MaskedKey lastFour={status.keyLastFour} />}

          {/* Key entry for unconfigured providers */}
          {!configured && (
            <div className="flex gap-2">
              <Input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder={meta.keyHint}
                autoComplete="new-password"
                className="font-mono text-sm"
                aria-label={`${meta.name} API key`}
              />
              <Button
                type="button"
                size="sm"
                disabled={!keyInput.trim() || saveMutation.isPending}
                onClick={() => {
                  // Never log keyInput — zero-knowledge contract
                  if (keyInput.trim()) saveMutation.mutate(keyInput.trim());
                }}
              >
                {saveMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          )}

          {/* Actions for configured providers */}
          {configured && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
              >
                {testMutation.isPending ? "Testing..." : "Test connection"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setRotateOpen(true)}>
                Rotate
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => setDeleteOpen(true)}
              >
                Remove
              </Button>
            </div>
          )}

          {actionError && (
            <p className="text-xs text-destructive" role="alert">
              {actionError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Rotate dialog */}
      <Dialog open={rotateOpen} onOpenChange={setRotateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotate {meta.name} API key</DialogTitle>
            <DialogDescription>Enter the new key. The existing key will be replaced immediately.</DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            value={rotateInput}
            onChange={(e) => setRotateInput(e.target.value)}
            placeholder={meta.keyHint}
            autoComplete="new-password"
            className="font-mono text-sm"
            aria-label={`New ${meta.name} API key`}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRotateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!rotateInput.trim() || rotateMutation.isPending}
              onClick={() => {
                if (rotateInput.trim()) rotateMutation.mutate(rotateInput.trim());
              }}
            >
              {rotateMutation.isPending ? "Saving..." : "Save new key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {meta.name} API key?</DialogTitle>
            <DialogDescription>
              Any agents using this provider will fail until a new key is saved. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
              {deleteMutation.isPending ? "Removing..." : "Remove key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * Settings > Provider API Keys.
 * One card per HTTP adapter provider with zero-knowledge key entry and test/rotate/delete.
 */
interface ProvidersPageProps {
  /** Company UUID, threaded from the route scope. */
  companyId: string;
}

export function ProvidersPage({ companyId }: ProvidersPageProps) {
  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
      {/* Settings nav tabs */}
      <nav className="flex gap-0.5 border-b border-border">
        <NavLink
          to="/settings/costs"
          end
          className={({ isActive }) =>
            `px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              isActive
                ? "text-foreground border-primary"
                : "text-muted-foreground border-transparent hover:text-foreground"
            }`
          }
        >
          Costs
        </NavLink>
        <NavLink
          to="/settings/providers"
          end
          className={({ isActive }) =>
            `px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              isActive
                ? "text-foreground border-primary"
                : "text-muted-foreground border-transparent hover:text-foreground"
            }`
          }
        >
          Providers
        </NavLink>
      </nav>

      <div>
        <h1 className="text-xl font-semibold">Providers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage API keys and test prompts for HTTP provider adapters.
        </p>
      </div>

      <SettingsProviderNav />

      <div>
        <h2 className="text-base font-medium mb-1">Provider API Keys</h2>
        <p className="text-sm text-muted-foreground">
          API keys are stored encrypted and never returned. Only the last four characters are shown.
        </p>
      </div>

      <div className="space-y-4">
        {PROVIDERS.map((meta) => (
          <ProviderCard key={meta.type} companyId={companyId} meta={meta} />
        ))}
      </div>
    </div>
  );
}
