import type { SecretProvider, SecretProviderDescriptor } from "@ironworksai/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface CreateSecretInput {
  name: string;
  value: string;
  provider: SecretProvider;
  description?: string | null;
  externalRef?: string | null;
}

interface CreateSecretDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingNames: string[];
  providers: SecretProviderDescriptor[];
  isPending: boolean;
  errorMessage: string | null;
  onSubmit: (input: CreateSecretInput) => void;
}

/** Modal form for creating a new secret. Validates non-empty + uniqueness client-side. */
export function CreateSecretDialog({
  open,
  onOpenChange,
  existingNames,
  providers,
  isPending,
  errorMessage,
  onSubmit,
}: CreateSecretDialogProps) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [showValue, setShowValue] = useState(false);
  const defaultProvider: SecretProvider = (providers[0]?.id ?? "local_encrypted") as SecretProvider;
  const [provider, setProvider] = useState<SecretProvider>(defaultProvider);
  const [externalRef, setExternalRef] = useState("");
  const [description, setDescription] = useState("");

  function reset() {
    setName("");
    setValue("");
    setShowValue(false);
    setProvider(defaultProvider);
    setExternalRef("");
    setDescription("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  const trimmedName = name.trim();
  const trimmedValue = value.trim();
  const selectedDescriptor = providers.find((p) => p.id === provider);
  const requiresExternalRef = selectedDescriptor?.requiresExternalRef ?? false;
  const trimmedExternalRef = externalRef.trim();
  const duplicate = existingNames.some((n) => n.toLowerCase() === trimmedName.toLowerCase());
  const validationError = !trimmedName
    ? null
    : duplicate
      ? "A secret with this name already exists."
      : requiresExternalRef && !trimmedExternalRef
        ? "This provider requires an external reference."
        : null;
  const canSubmit = !!trimmedName && !!trimmedValue && !duplicate && !validationError && !isPending;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({
      name: trimmedName,
      value: trimmedValue,
      provider,
      description: description.trim() ? description.trim() : null,
      externalRef: trimmedExternalRef ? trimmedExternalRef : null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New secret</DialogTitle>
          <DialogDescription>
            Stored encrypted in the vault. Plaintext is never returned after creation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="secret-name">Name</Label>
            <Input
              id="secret-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="STRIPE_WEBHOOK_SECRET"
              autoComplete="off"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="secret-value">Value</Label>
            <div className="flex gap-2">
              <Input
                id="secret-value"
                type={showValue ? "text" : "password"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoComplete="new-password"
                className="font-mono text-sm"
                aria-label="Secret value"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowValue((s) => !s)}
                aria-label={showValue ? "Hide value" : "Show value"}
              >
                {showValue ? "Hide" : "Show"}
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="secret-provider">Provider</Label>
            <select
              id="secret-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as SecretProvider)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {requiresExternalRef && (
            <div className="space-y-1">
              <Label htmlFor="secret-external-ref">External reference</Label>
              <Input
                id="secret-external-ref"
                value={externalRef}
                onChange={(e) => setExternalRef(e.target.value)}
                placeholder="arn:aws:secretsmanager:..."
                className="font-mono text-sm"
              />
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="secret-description">Description (optional)</Label>
            <Input
              id="secret-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this secret used for?"
            />
          </div>

          {validationError && (
            <p className="text-xs text-destructive" role="alert">
              {validationError}
            </p>
          )}
          {errorMessage && (
            <p className="text-xs text-destructive" role="alert">
              {errorMessage}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={handleSubmit}>
            {isPending ? "Creating..." : "Create secret"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
