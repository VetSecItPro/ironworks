import type { PluginRecord } from "@ironworksai/shared";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function getPluginErrorSummary(plugin: PluginRecord): string {
  if (!plugin.lastError) return "Plugin entered an error state without a stored error message.";
  const line = plugin.lastError
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find(Boolean);
  return line ?? "Plugin entered an error state without a stored error message.";
}

interface UninstallDialogProps {
  pluginId: string | null;
  pluginName: string;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (id: string) => void;
}

export function UninstallDialog({ pluginId, pluginName, isPending, onClose, onConfirm }: UninstallDialogProps) {
  return (
    <Dialog
      open={pluginId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Uninstall Plugin</DialogTitle>
          <DialogDescription>
            Are you sure you want to uninstall <strong>{pluginName}</strong>? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() => {
              if (pluginId) onConfirm(pluginId);
            }}
          >
            {isPending ? "Uninstalling..." : "Uninstall"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ErrorDetailsDialogProps {
  plugin: PluginRecord | null;
  onClose: () => void;
}

export function ErrorDetailsDialog({ plugin, onClose }: ErrorDetailsDialogProps) {
  return (
    <Dialog
      open={plugin !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Error Details</DialogTitle>
          <DialogDescription>
            {plugin?.manifestJson.displayName ?? plugin?.packageName ?? "Plugin"} hit an error state.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border border-red-500/25 bg-red-500/[0.06] px-4 py-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700 dark:text-red-300" />
              <div className="space-y-1 text-sm">
                <p className="font-medium text-red-700 dark:text-red-300">What errored</p>
                <p className="text-red-700/90 dark:text-red-200/90 break-words">
                  {plugin ? getPluginErrorSummary(plugin) : "No error summary available."}
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Full error output</p>
            <pre className="max-h-[50vh] overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-5 whitespace-pre-wrap break-words">
              {plugin?.lastError ?? "No stored error message."}
            </pre>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
