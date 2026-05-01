import type { CompanySecret, SecretProvider } from "@ironworksai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Key, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useState } from "react";
import { secretsApi } from "../../api/secrets";
import { useToast } from "../../context/ToastContext";
import { Button } from "../ui/button";

interface ApiKeysSectionProps {
  companyId: string;
  secrets: CompanySecret[];
}

/**
 * Workspace-scoped secret manager. Backed by `company_secrets` (encrypted at
 * rest with the workspace KEK). Lets the operator add LLM provider keys
 * (ANTHROPIC_API_KEY, OPENROUTER_API_KEY, etc.) and tool API keys
 * (GITHUB_TOKEN, etc.) without dropping into the env file.
 *
 * Uses the existing /companies/:id/secrets endpoints (list/create/rotate/delete).
 * Values are write-only — the API never echoes the plaintext after creation
 * (rotation submits a new value; the old is discarded). UI displays just the
 * name + provider + age, never the value.
 */
export function ApiKeysSection({ companyId, secrets }: ApiKeysSectionProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const providersQuery = useQuery({
    queryKey: ["secret-providers", companyId],
    queryFn: () => secretsApi.providers(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });
  const providers = providersQuery.data ?? [];
  const defaultProvider: SecretProvider = (providers[0]?.id as SecretProvider) ?? "local_encrypted";

  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState<SecretProvider>(defaultProvider);
  const [showValue, setShowValue] = useState(false);
  const [rotateTarget, setRotateTarget] = useState<CompanySecret | null>(null);
  const [rotateValue, setRotateValue] = useState("");

  const createMutation = useMutation({
    mutationFn: (input: { name: string; value: string; provider: SecretProvider; description: string | null }) =>
      secretsApi.create(companyId, input),
    onSuccess: () => {
      pushToast({ title: "Secret saved", tone: "success" });
      setShowAdd(false);
      setName("");
      setValue("");
      setDescription("");
      setShowValue(false);
      queryClient.invalidateQueries({ queryKey: ["secrets", companyId] });
      // Also invalidate the parent useCompanySettingsState query.
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "secrets" });
    },
    onError: (err) => {
      pushToast({ title: err instanceof Error ? `Save failed: ${err.message}` : "Save failed", tone: "error" });
    },
  });

  const rotateMutation = useMutation({
    mutationFn: ({ id, newValue }: { id: string; newValue: string }) => secretsApi.rotate(id, { value: newValue }),
    onSuccess: () => {
      pushToast({ title: "Secret rotated", tone: "success" });
      setRotateTarget(null);
      setRotateValue("");
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "secrets" });
    },
    onError: (err) => {
      pushToast({
        title: err instanceof Error ? `Rotate failed: ${err.message}` : "Rotate failed",
        tone: "error",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => secretsApi.remove(id),
    onSuccess: () => {
      pushToast({ title: "Secret deleted", tone: "success" });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "secrets" });
    },
    onError: (err) => {
      pushToast({
        title: err instanceof Error ? `Delete failed: ${err.message}` : "Delete failed",
        tone: "error",
      });
    },
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedValue = value.trim();
    // Sanitize: name must be uppercase letters/digits/underscores (env-var convention).
    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(trimmedName)) {
      pushToast({
        title: "Name must be UPPER_SNAKE_CASE (start with letter, 2-64 chars)",
        tone: "error",
      });
      return;
    }
    if (trimmedValue.length < 8) {
      pushToast({ title: "Value too short (min 8 chars)", tone: "error" });
      return;
    }
    createMutation.mutate({
      name: trimmedName,
      value: trimmedValue,
      provider,
      description: description.trim() || null,
    });
  }

  function handleRotate(e: React.FormEvent) {
    e.preventDefault();
    if (!rotateTarget) return;
    if (rotateValue.trim().length < 8) {
      pushToast({ title: "New value too short (min 8 chars)", tone: "error" });
      return;
    }
    rotateMutation.mutate({ id: rotateTarget.id, newValue: rotateValue.trim() });
  }

  return (
    <div id="api-keys" className="space-y-4 scroll-mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Key className="h-3.5 w-3.5" />
          API Keys
        </h2>
        <Button size="sm" variant="outline" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? <X className="h-3.5 w-3.5 mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
          {showAdd ? "Cancel" : "Add Key"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Encrypted secrets for LLM providers (ANTHROPIC_API_KEY, OPENROUTER_API_KEY, GEMINI_API_KEY, etc.) and tool
        integrations (GITHUB_TOKEN, etc.). Values are write-only — never echoed back after save.
      </p>

      {showAdd && (
        <form onSubmit={handleAdd} className="space-y-3 rounded-md border border-border px-4 py-4 bg-muted/20">
          <div className="space-y-1">
            <label htmlFor="secret-name" className="text-xs font-medium">
              Name
            </label>
            <input
              id="secret-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              placeholder="OPENROUTER_API_KEY"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-mono outline-none focus:border-primary"
            />
            <p className="text-[10px] text-muted-foreground">UPPER_SNAKE_CASE, 2-64 chars (env var convention)</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="secret-value" className="text-xs font-medium">
              Value
            </label>
            <div className="relative">
              <input
                id="secret-value"
                type={showValue ? "text" : "password"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="sk-..."
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 pr-9 text-sm font-mono outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setShowValue((v) => !v)}
                aria-label={showValue ? "Hide" : "Show"}
                className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
              >
                {showValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="secret-provider" className="text-xs font-medium">
              Storage backend
            </label>
            <select
              id="secret-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as SecretProvider)}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label ?? p.id}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="secret-description" className="text-xs font-medium">
              Description (optional)
            </label>
            <input
              id="secret-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this key is for"
              maxLength={200}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving..." : "Save secret"}
            </Button>
          </div>
        </form>
      )}

      <div className="rounded-md border border-border divide-y divide-border">
        {secrets.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted-foreground">
            No keys configured yet. Click <span className="font-medium">Add Key</span> to create one.
          </div>
        ) : (
          secrets.map((s) => (
            <div key={s.id} className="px-4 py-3 flex items-center gap-3 text-sm">
              <Key className="h-4 w-4 text-muted-foreground flex-none" />
              <div className="flex-1 min-w-0">
                <div className="font-mono text-sm truncate">{s.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {s.provider} · v{s.latestVersion ?? 1}
                  {s.description ? ` · ${s.description}` : ""}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                title="Rotate (replace value)"
                onClick={() => {
                  setRotateTarget(s);
                  setRotateValue("");
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                title="Delete"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  if (window.confirm(`Delete secret ${s.name}? Anything that referenced it will break.`)) {
                    deleteMutation.mutate(s.id);
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>

      {rotateTarget && (
        <form
          onSubmit={handleRotate}
          className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-4"
        >
          <div className="text-xs font-medium">
            Rotate <span className="font-mono">{rotateTarget.name}</span>
          </div>
          <div className="space-y-1">
            <label htmlFor="rotate-value" className="text-xs">
              New value
            </label>
            <input
              id="rotate-value"
              type="password"
              value={rotateValue}
              onChange={(e) => setRotateValue(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-mono outline-none focus:border-primary"
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" type="submit" disabled={rotateMutation.isPending}>
              {rotateMutation.isPending ? "Rotating..." : "Rotate"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => {
                setRotateTarget(null);
                setRotateValue("");
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
