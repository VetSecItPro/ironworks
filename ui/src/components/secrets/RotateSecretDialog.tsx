import type { CompanySecret } from "@ironworksai/shared";
import { useEffect, useState } from "react";
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

interface RotateSecretDialogProps {
  secret: CompanySecret | null;
  onClose: () => void;
  isPending: boolean;
  errorMessage: string | null;
  onSubmit: (newValue: string) => void;
}

/** Modal for rotating a secret. Single-input form for the new value. */
export function RotateSecretDialog({ secret, onClose, isPending, errorMessage, onSubmit }: RotateSecretDialogProps) {
  const [newValue, setNewValue] = useState("");
  const [showValue, setShowValue] = useState(false);

  useEffect(() => {
    if (!secret) {
      setNewValue("");
      setShowValue(false);
    }
  }, [secret]);

  const trimmed = newValue.trim();
  const canSubmit = !!trimmed && !isPending;

  return (
    <Dialog open={!!secret} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rotate {secret?.name ?? "secret"}</DialogTitle>
          <DialogDescription>
            Enter the new value. The previous version is retained for audit but no longer used by agents.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="rotate-value">New value</Label>
          <div className="flex gap-2">
            <Input
              id="rotate-value"
              type={showValue ? "text" : "password"}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              autoComplete="new-password"
              className="font-mono text-sm"
              aria-label="New secret value"
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
          {errorMessage && (
            <p className="text-xs text-destructive" role="alert">
              {errorMessage}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={() => canSubmit && onSubmit(trimmed)}>
            {isPending ? "Rotating..." : "Rotate secret"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
