import { AlertTriangle, ArrowRight, CheckSquare, FileUp, Square, Upload, X } from "lucide-react";
import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "../../lib/utils";
import { type ColumnMapping, detectDuplicates, EMPTY_MAPPING, FIELD_KEYS, parseCsv } from "./csv-helpers";

interface CsvImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (
    issues: Array<{
      title: string;
      description?: string;
      status?: string;
      priority?: string;
      labels?: string[];
    }>,
  ) => void;
  existingTitles?: string[];
}

export function CsvImportDialog({ open, onClose, onImport, existingTitles = [] }: CsvImportDialogProps) {
  const [step, setStep] = useState<"upload" | "map" | "preview">("upload");
  const [csvData, setCsvData] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({ ...EMPTY_MAPPING });
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const data = parseCsv(text);
      setCsvData(data);

      const autoMap: ColumnMapping = { ...EMPTY_MAPPING };
      data.headers.forEach((h, i) => {
        const lower = h.toLowerCase().trim();
        if (lower === "title" || lower === "name" || lower === "summary") autoMap.title = i;
        else if (lower === "description" || lower === "body" || lower === "details") autoMap.description = i;
        else if (lower === "status" || lower === "state") autoMap.status = i;
        else if (lower === "priority") autoMap.priority = i;
        else if (lower === "assignee" || lower === "assigned") autoMap.assignee = i;
        else if (lower === "labels" || lower === "tags") autoMap.labels = i;
        else if (lower === "project") autoMap.project = i;
      });
      setMapping(autoMap);
      setSelectedRows(new Set(data.rows.map((_, i) => i)));
      setStep("map");
    };
    reader.readAsText(file);
  }

  function handleImport() {
    if (!csvData || mapping.title === null) return;

    const issues = Array.from(selectedRows)
      .sort((a, b) => a - b)
      .map((i) => {
        const row = csvData.rows[i];
        return {
          title: row[mapping.title!] ?? "",
          description: mapping.description !== null ? row[mapping.description] : undefined,
          status: mapping.status !== null ? row[mapping.status] : undefined,
          priority: mapping.priority !== null ? row[mapping.priority] : undefined,
          labels:
            mapping.labels !== null
              ? row[mapping.labels]
                  ?.split(/[,;]/)
                  .map((l) => l.trim())
                  .filter(Boolean)
              : undefined,
        };
      })
      .filter((issue) => issue.title.trim().length > 0);

    onImport(issues);
    handleReset();
    onClose();
  }

  function handleReset() {
    setCsvData(null);
    setMapping({ ...EMPTY_MAPPING });
    setSelectedRows(new Set());
    setStep("upload");
  }

  const duplicateRows = useMemo(() => {
    if (!csvData) return new Set<number>();
    return detectDuplicates(csvData.rows, mapping.title);
  }, [csvData, mapping.title]);

  const existingDupes = useMemo(() => {
    if (!csvData || mapping.title === null) return new Set<number>();
    const existing = new Set(existingTitles.map((t) => t.toLowerCase().trim()));
    const dupes = new Set<number>();
    csvData.rows.forEach((row, i) => {
      const title = row[mapping.title!]?.toLowerCase().trim() ?? "";
      if (title && existing.has(title)) dupes.add(i);
    });
    return dupes;
  }, [csvData, mapping.title, existingTitles]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[80vh] overflow-hidden rounded-xl border border-border bg-card shadow-2xl animate-in fade-in-0 zoom-in-95 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Import Missions from CSV</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close import"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {step === "upload" && (
            <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-border rounded-lg">
              <FileUp className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-4">Upload a CSV file with your issues</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                onChange={handleFile}
                className="hidden"
                aria-label="Choose CSV file"
              />
              <Button onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Choose CSV File
              </Button>
              <p className="text-xs text-muted-foreground mt-3">
                Required: title column. Optional: description, status, priority, labels
              </p>
            </div>
          )}

          {step === "map" && csvData && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold mb-3">Map CSV Columns</h3>
                <div className="grid grid-cols-2 gap-3">
                  {FIELD_KEYS.map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2">
                      <label htmlFor={`csv-col-${key}`} className="text-xs text-muted-foreground w-32 shrink-0">{label}</label>
                      <select
                        id={`csv-col-${key}`}
                        value={mapping[key] ?? "__unmapped__"}
                        onChange={(e) =>
                          setMapping((prev) => ({
                            ...prev,
                            [key]: e.target.value === "__unmapped__" ? null : Number(e.target.value),
                          }))
                        }
                        className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                      >
                        <option value="__unmapped__">-- Skip --</option>
                        {csvData.headers.map((h, i) => (
                          <option key={i} value={i}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <Button onClick={() => setStep("preview")} disabled={mapping.title === null}>
                Preview Import
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}

          {step === "preview" && csvData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Preview ({selectedRows.size} of {csvData.rows.length} rows selected)
                </h3>
                <div className="flex items-center gap-2">
                  {duplicateRows.size > 0 && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {duplicateRows.size} potential duplicates
                    </span>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setStep("map")} className="text-xs">
                    Back to mapping
                  </Button>
                </div>
              </div>

              <div className="border border-border rounded-lg overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left w-8">
                        <button
                          type="button"
                          aria-label={
                            selectedRows.size === csvData.rows.length ? "Deselect all rows" : "Select all rows"
                          }
                          onClick={() => {
                            if (selectedRows.size === csvData.rows.length) {
                              setSelectedRows(new Set());
                            } else {
                              setSelectedRows(new Set(csvData.rows.map((_, i) => i)));
                            }
                          }}
                        >
                          {selectedRows.size === csvData.rows.length ? (
                            <CheckSquare className="h-3.5 w-3.5" />
                          ) : (
                            <Square className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </th>
                      <th className="px-3 py-2 text-left">#</th>
                      {FIELD_KEYS.filter(({ key }) => mapping[key] !== null).map(({ key, label }) => (
                        <th key={key} className="px-3 py-2 text-left font-medium text-muted-foreground">
                          {label.replace(" (required)", "")}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-left w-16">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {csvData.rows.map((row, i) => {
                      const isDupe = duplicateRows.has(i);
                      const isExisting = existingDupes.has(i);
                      return (
                        <tr
                          key={i}
                          className={cn("hover:bg-accent/30", isDupe && "bg-amber-500/5", isExisting && "bg-red-500/5")}
                        >
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              aria-label={selectedRows.has(i) ? `Deselect row ${i + 1}` : `Select row ${i + 1}`}
                              onClick={() => {
                                setSelectedRows((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(i)) next.delete(i);
                                  else next.add(i);
                                  return next;
                                });
                              }}
                            >
                              {selectedRows.has(i) ? (
                                <CheckSquare className="h-3.5 w-3.5 text-primary" />
                              ) : (
                                <Square className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                          {FIELD_KEYS.filter(({ key }) => mapping[key] !== null).map(({ key }) => (
                            <td key={key} className="px-3 py-2 max-w-[200px] truncate">
                              {row[mapping[key]!] ?? ""}
                            </td>
                          ))}
                          <td className="px-3 py-2">
                            {isExisting ? (
                              <span className="text-red-500 text-[10px]">Exists</span>
                            ) : isDupe ? (
                              <span className="text-amber-500 text-[10px]">Dupe</span>
                            ) : (
                              <span className="text-green-500 text-[10px]">New</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "preview" && (
          <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
            <Button variant="ghost" onClick={handleReset}>
              Start over
            </Button>
            <Button onClick={handleImport} disabled={selectedRows.size === 0 || mapping.title === null}>
              <Upload className="h-4 w-4 mr-2" />
              Import {selectedRows.size} issue{selectedRows.size !== 1 ? "s" : ""}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
