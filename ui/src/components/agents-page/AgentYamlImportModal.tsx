/**
 * Modal for pasting a YAML document produced by the export route and
 * re-importing it into the current company.
 *
 * Two modes:
 *   create — always inserts new agents (safe, non-destructive).
 *   upsert — updates agents whose id_hint matches an existing agent,
 *            inserts the rest.
 *
 * Focus is trapped inside the dialog via the <dialog> element's native
 * tab order. Escape key closes (native browser behavior for <dialog>).
 */

import { Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { agentsApi } from "../../api/agents";

interface ImportResult {
  imported: Array<{ id_hint: string; id: string; action: string }>;
  errors: string[];
}

interface AgentYamlImportModalProps {
  companyId: string;
  /** Called with the import result so the parent can invalidate agent queries. */
  onImported?: (result: ImportResult) => void;
}

export function AgentYamlImportModal({ companyId, onImported }: AgentYamlImportModalProps) {
  const [open, setOpen] = useState(false);
  const [yaml, setYaml] = useState("");
  const [mode, setMode] = useState<"create" | "upsert">("create");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync open/close with the <dialog> element
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
      textareaRef.current?.focus();
    } else {
      dialog.close();
    }
  }, [open]);

  // Close when the native dialog fires a close event (e.g. Escape key)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => setOpen(false);
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, []);

  function handleOpen() {
    setYaml("");
    setMode("create");
    setError(null);
    setResult(null);
    setOpen(true);
  }

  function handleCancel() {
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!yaml.trim()) {
      setError("Paste a YAML document before importing.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await agentsApi.importYaml(companyId, yaml, mode);
      setResult(data);
      onImported?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={handleOpen} aria-haspopup="dialog">
        <Upload className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
        Import YAML
      </Button>

      {/* Native <dialog> provides focus trapping and Escape-to-close. */}
      <dialog
        ref={dialogRef}
        className="rounded-lg border bg-background p-0 shadow-lg backdrop:bg-black/50 w-[min(90vw,540px)]"
        aria-labelledby="import-yaml-title"
        aria-modal="true"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
          <h2 id="import-yaml-title" className="text-base font-semibold">
            Import Agents from YAML
          </h2>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="yaml-input" className="text-sm font-medium">
              YAML document
            </label>
            <textarea
              id="yaml-input"
              ref={textareaRef}
              value={yaml}
              onChange={(e) => setYaml(e.target.value)}
              rows={12}
              className="w-full rounded-md border bg-muted/30 px-3 py-2 text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="# Agent YAML export&#10;version: 1&#10;agents:&#10;  - id_hint: ..."
              disabled={loading || !!result}
            />
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium">Import mode</legend>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="import-mode"
                  value="create"
                  checked={mode === "create"}
                  onChange={() => setMode("create")}
                  disabled={loading || !!result}
                />
                Create (always insert)
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="import-mode"
                  value="upsert"
                  checked={mode === "upsert"}
                  onChange={() => setMode("upsert")}
                  disabled={loading || !!result}
                />
                Upsert (update existing)
              </label>
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          {result && (
            <div role="status" className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                Import complete — {result.imported.length} agent{result.imported.length !== 1 ? "s" : ""} processed.
              </p>
              <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto text-xs">
                {result.imported.map((item) => (
                  <li key={item.id}>
                    <span className="font-mono">{item.id_hint}</span>{" "}
                    <span className="text-muted-foreground">({item.action})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
              {result ? "Close" : "Cancel"}
            </Button>
            {!result && (
              <Button type="submit" size="sm" disabled={loading}>
                {loading ? "Importing…" : "Import"}
              </Button>
            )}
          </div>
        </form>
      </dialog>
    </>
  );
}
