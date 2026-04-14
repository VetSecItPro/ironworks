import { useRef, useState } from "react";
import { AlertTriangle, Download, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBillingDate } from "./billingHelpers";
import { privacyApi } from "@/api/privacy";

interface CancelSubscriptionSectionProps {
  companyId: string;
  companyName: string;
  currentPeriodEnd: string | null;
  onConfirmCancel: () => void;
  isCancelling: boolean;
}

export function CancelSubscriptionSection({
  companyId,
  companyName,
  currentPeriodEnd,
  onConfirmCancel,
  isCancelling,
}: CancelSubscriptionSectionProps) {
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelConfirmName, setCancelConfirmName] = useState("");
  const cancelInputRef = useRef<HTMLInputElement>(null);

  function openCancelDialog() {
    setCancelConfirmName("");
    setCancelDialogOpen(true);
    setTimeout(() => cancelInputRef.current?.focus(), 50);
  }

  function handleCancelConfirm() {
    if (cancelConfirmName.trim() !== companyName) return;
    onConfirmCancel();
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-destructive">Cancel Subscription</h2>
      <div className="border border-destructive/40 rounded-lg p-5 bg-destructive/5 space-y-4">
        <p className="text-sm text-muted-foreground">
          Cancelling your subscription will stop future charges. Your team can continue working
          until the end of your current billing period.
        </p>
        {!cancelDialogOpen ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={openCancelDialog}
          >
            <XCircle className="h-4 w-4 mr-1.5" />
            Cancel Subscription
          </Button>
        ) : (
          <div className="space-y-4">
            {/* Consequences */}
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <span>Your team will continue working until the end of your billing period ({formatBillingDate(currentPeriodEnd)}).</span>
              </div>
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <span>Your data is kept for 30 days after cancellation.</span>
              </div>
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <span className="text-destructive font-medium">After 30 days, all data is permanently deleted.</span>
              </div>
            </div>

            {/* Download before cancelling */}
            <div className="text-sm">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-muted-foreground underline hover:text-foreground transition-colors text-xs"
                onClick={() => {
                  const url = privacyApi.exportData(companyId);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }}
              >
                <Download className="h-3.5 w-3.5" />
                Download your data before cancelling
              </button>
            </div>

            {/* Company name confirmation */}
            <div className="space-y-2">
              <label htmlFor="cancel-confirm-name" className="text-sm font-medium">
                Type your company name <span className="font-mono text-muted-foreground">"{companyName}"</span> to confirm:
              </label>
              <input
                id="cancel-confirm-name"
                ref={cancelInputRef}
                type="text"
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-destructive"
                value={cancelConfirmName}
                onChange={(e) => setCancelConfirmName(e.target.value)}
                placeholder={companyName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCancelConfirm();
                }}
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancelConfirm}
                disabled={isCancelling || cancelConfirmName.trim() !== companyName}
              >
                {isCancelling ? "Redirecting..." : "Confirm Cancellation"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancelDialogOpen(false)}
              >
                Keep Subscription
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
