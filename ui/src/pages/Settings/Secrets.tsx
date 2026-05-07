/**
 * Settings > Secrets vault page.
 *
 * Board-scoped UI for managing company-scoped secrets (webhook signing secrets,
 * third-party API keys, MCP server tokens, etc.) backed by the generic /secrets
 * API. The LLM-provider-specific keys live on the Providers tab — this page is
 * for everything else.
 *
 * Zero-knowledge: the API never returns plaintext after creation, so the table
 * shows only metadata (name, provider, version, timestamps).
 */

import type { CompanySecret, SecretProviderDescriptor } from "@ironworksai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { secretsApi } from "@/api/secrets";
import { PageSkeleton } from "@/components/PageSkeleton";
import { CreateSecretDialog, type CreateSecretInput, RotateSecretDialog, SecretsTable } from "@/components/secrets";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SettingsProviderNav } from "./SettingsProviderNav";

interface SecretsPageProps {
  /** Company UUID, threaded from the route scope. */
  companyId: string;
}

export function SecretsPage({ companyId }: SecretsPageProps) {
  const queryClient = useQueryClient();
  const listKey = ["secrets", companyId];
  const providersKey = ["secret-providers", companyId];

  const secretsQuery = useQuery<CompanySecret[]>({
    queryKey: listKey,
    queryFn: () => secretsApi.list(companyId),
  });

  const providersQuery = useQuery<SecretProviderDescriptor[]>({
    queryKey: providersKey,
    queryFn: () => secretsApi.providers(companyId),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [rotateTarget, setRotateTarget] = useState<CompanySecret | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanySecret | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: listKey });

  const createMutation = useMutation({
    mutationFn: (input: CreateSecretInput) =>
      secretsApi.create(companyId, {
        name: input.name,
        value: input.value,
        provider: input.provider,
        description: input.description,
        externalRef: input.externalRef,
      }),
    onSuccess: () => {
      setCreateError(null);
      setCreateOpen(false);
      void invalidate();
    },
    onError: (err) => setCreateError(err instanceof Error ? err.message : "Failed to create secret."),
  });

  const rotateMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) => secretsApi.rotate(id, { value }),
    onSuccess: () => {
      setRotateError(null);
      setRotateTarget(null);
      void invalidate();
    },
    onError: (err) => setRotateError(err instanceof Error ? err.message : "Failed to rotate secret."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => secretsApi.remove(id),
    onSuccess: () => {
      setDeleteError(null);
      setDeleteTarget(null);
      void invalidate();
    },
    onError: (err) => setDeleteError(err instanceof Error ? err.message : "Failed to delete secret."),
  });

  const isLoading = secretsQuery.isLoading || providersQuery.isLoading;
  const secrets = secretsQuery.data ?? [];
  const providers = providersQuery.data ?? [];
  const existingNames = secrets.map((s) => s.name);

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Secrets vault</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Store API keys, webhook secrets, and other sensitive values. Plaintext is never returned after creation.
        </p>
      </div>

      <SettingsProviderNav />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium">Company secrets</h2>
          <p className="text-sm text-muted-foreground">
            Encrypted at rest. Rotation creates a new version; previous versions are retained for audit.
          </p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)} disabled={isLoading}>
          New secret
        </Button>
      </div>

      {isLoading ? (
        <PageSkeleton variant="list" />
      ) : secretsQuery.isError ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            {secretsQuery.error instanceof Error ? secretsQuery.error.message : "Failed to load secrets."}
          </CardContent>
        </Card>
      ) : secrets.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center text-center gap-3">
            <p className="text-sm font-medium">No secrets yet</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              Add API keys, webhook signing secrets, or other sensitive values your agents need.
            </p>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              New secret
            </Button>
          </CardContent>
        </Card>
      ) : (
        <SecretsTable secrets={secrets} onRotate={setRotateTarget} onDelete={setDeleteTarget} />
      )}

      <CreateSecretDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateError(null);
        }}
        existingNames={existingNames}
        providers={providers}
        isPending={createMutation.isPending}
        errorMessage={createError}
        onSubmit={(input) => createMutation.mutate(input)}
      />

      <RotateSecretDialog
        secret={rotateTarget}
        onClose={() => {
          setRotateTarget(null);
          setRotateError(null);
        }}
        isPending={rotateMutation.isPending}
        errorMessage={rotateError}
        onSubmit={(value) => {
          if (rotateTarget) rotateMutation.mutate({ id: rotateTarget.id, value });
        }}
      />

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name ?? "secret"}?</DialogTitle>
            <DialogDescription>
              Any agent referencing this secret will fail until it is replaced. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="text-xs text-destructive" role="alert">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete secret"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
