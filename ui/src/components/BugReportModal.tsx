import { Bug, Lightbulb, X } from "lucide-react";
import { useState } from "react";
import { bugReportsApi, type CreateBugReportInput } from "@/api/bugReports";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/context/ToastContext";

interface BugReportModalProps {
  open: boolean;
  onClose: () => void;
}

type ReportType = "bug" | "feature_request";

export function BugReportModal({ open, onClose }: BugReportModalProps) {
  const { pushToast } = useToast();
  const [type, setType] = useState<ReportType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<CreateBugReportInput["severity"]>("medium");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const pageUrl = window.location.href;

  function reset() {
    setType("bug");
    setTitle("");
    setDescription("");
    setSeverity("medium");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const input: CreateBugReportInput = {
        type,
        title: title.trim(),
        description: description.trim() || undefined,
        pageUrl,
        severity: type === "bug" ? severity : undefined,
      };
      await bugReportsApi.create(input);
      pushToast({
        title: type === "bug" ? "Bug report submitted. Thank you!" : "Feature request submitted. Thank you!",
        tone: "success",
      });
      reset();
      onClose();
    } catch {
      pushToast({ title: "Failed to submit. Please try again.", tone: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">{type === "bug" ? "Report a Bug" : "Request a Feature"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Type toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType("bug")}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                type === "bug"
                  ? "border-red-500/40 bg-red-500/10 text-red-400"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
              }`}
            >
              <Bug className="h-4 w-4" />
              Bug Report
            </button>
            <button
              type="button"
              onClick={() => setType("feature_request")}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                type === "feature_request"
                  ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
              }`}
            >
              <Lightbulb className="h-4 w-4" />
              Feature Request
            </button>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <label htmlFor="bug-title" className="text-xs font-medium text-muted-foreground">
              Title <span className="text-red-400">*</span>
            </label>
            <Input
              id="bug-title"
              placeholder={type === "bug" ? "What went wrong?" : "What would you like to see?"}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label htmlFor="bug-description" className="text-xs font-medium text-muted-foreground">
              Description
            </label>
            <Textarea
              id="bug-description"
              placeholder={
                type === "bug"
                  ? "Steps to reproduce, expected vs actual behavior..."
                  : "Describe the feature and why it would be useful..."
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>

          {/* Severity (bugs only) */}
          {type === "bug" && (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Severity</span>
              <Select value={severity} onValueChange={(v) => setSeverity(v as CreateBugReportInput["severity"])}>
                <SelectTrigger className="w-full text-sm" aria-label="Severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Page URL (read-only) */}
          <div className="space-y-1.5">
            <label htmlFor="bug-report-page-url" className="text-xs font-medium text-muted-foreground">Page URL</label>
            <Input id="bug-report-page-url" value={pageUrl} readOnly tabIndex={-1} className="text-xs text-muted-foreground bg-muted/30" />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting || !title.trim()}>
              {submitting ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
