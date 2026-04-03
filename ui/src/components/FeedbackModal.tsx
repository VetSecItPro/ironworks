import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/context/ToastContext";
import { authApi } from "@/api/auth";
import { supportApi } from "@/api/support";
import { queryKeys } from "@/lib/queryKeys";
import { useCompany } from "@/context/CompanyContext";

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

type FeedbackType = "bug" | "feature";

export function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const { pushToast } = useToast();
  const { selectedCompany } = useCompany();

  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    enabled: open,
    staleTime: 60_000,
  });

  const [type, setType] = useState<FeedbackType>("bug");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;
    setSubmitting(true);
    try {
      await supportApi.createTicket({
        type,
        subject: subject.trim(),
        body: description.trim(),
      });
      pushToast({ title: "Feedback submitted. Thank you!", tone: "success" });
      setSubject("");
      setDescription("");
      setType("bug");
      onClose();
    } catch {
      pushToast({ title: "Failed to submit feedback. Please try again.", tone: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">
            {type === "bug" ? "Report a Bug" : "Request a Feature"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Type radio */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Type</label>
            <div className="flex gap-3">
              {(["bug", "feature"] as FeedbackType[]).map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="feedback-type"
                    value={t}
                    checked={type === t}
                    onChange={() => setType(t)}
                    className="accent-primary"
                  />
                  <span className="text-sm">{t === "bug" ? "Bug Report" : "Feature Request"}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Auto-filled info */}
          {(session?.user.email || selectedCompany?.name) && (
            <div className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2 space-y-0.5">
              {session?.user.email && <div>Email: {session.user.email}</div>}
              {selectedCompany?.name && <div>Company: {selectedCompany.name}</div>}
            </div>
          )}

          {/* Subject */}
          <div>
            <label htmlFor="feedback-subject" className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Subject <span className="text-red-400">*</span>
            </label>
            <Input
              id="feedback-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={type === "bug" ? "Briefly describe the bug..." : "Describe your idea..."}
              required
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="feedback-description" className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Description <span className="text-red-400">*</span>
            </label>
            <textarea
              id="feedback-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                type === "bug"
                  ? "Steps to reproduce, expected vs actual behavior..."
                  : "Describe the feature and why it would be valuable..."
              }
              rows={5}
              required
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !subject.trim() || !description.trim()}
            >
              {submitting ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
