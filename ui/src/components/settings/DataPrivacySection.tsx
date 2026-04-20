import type { Company } from "@ironworksai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Database, Settings, Shield, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router";
import { privacyApi } from "../../api/privacy";
import { useToast } from "../../context/ToastContext";
import { queryKeys } from "../../lib/queryKeys";

interface DataPrivacySectionProps {
  selectedCompany: Company;
  selectedCompanyId: string;
}

export function DataPrivacySection({ selectedCompany, selectedCompanyId }: DataPrivacySectionProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [erasureConfirm, setErasureConfirm] = useState(false);

  const privacySummaryQuery = useQuery({
    queryKey: ["privacy", "summary", selectedCompanyId],
    queryFn: () => privacyApi.summary(selectedCompanyId),
    enabled: !!selectedCompanyId,
  });

  const erasureMutation = useMutation({
    mutationFn: () => privacyApi.requestErasure(selectedCompanyId),
    onSuccess: (data) => {
      pushToast({
        title: "Erasure scheduled",
        body: data.message,
        tone: "success",
      });
      setErasureConfirm(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
    onError: () => {
      pushToast({ title: "Failed to request erasure", tone: "error" });
    },
  });

  return (
    <>
      <div id="data-privacy" className="space-y-4 scroll-mt-6">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Shield className="h-3.5 w-3.5" />
          Data &amp; Privacy
        </div>
        <div className="rounded-md border border-border px-4 py-4 space-y-4">
          {/* Retention policies */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Data Retention Policy</span>
            </div>
            {privacySummaryQuery.data ? (
              <div className="space-y-1">
                {Object.entries(privacySummaryQuery.data.retentionPolicies).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                    </span>
                    <span className="font-mono text-muted-foreground">{value as string}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Activity log</span>
                  <span className="font-mono text-muted-foreground">365 days</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Cost events</span>
                  <span className="font-mono text-muted-foreground">365 days</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Execution logs</span>
                  <span className="font-mono text-muted-foreground">90 days</span>
                </div>
              </div>
            )}
          </div>

          {/* Deletion status or request button */}
          {selectedCompany.status === "pending_erasure" ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-3">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">Deletion scheduled</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  All data is scheduled for permanent deletion in 30 days. Contact support to cancel.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                You can request permanent deletion of all company data. Data will be removed 30 days after the request.
              </p>
              {erasureConfirm ? (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                  <span className="text-xs text-destructive font-medium">
                    This schedules permanent deletion of ALL data. Are you sure?
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => erasureMutation.mutate()}
                    disabled={erasureMutation.isPending}
                  >
                    {erasureMutation.isPending ? "Requesting..." : "Confirm"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setErasureConfirm(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/40 hover:bg-destructive/5"
                  onClick={() => setErasureConfirm(true)}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Request data deletion
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Privacy & Data Link */}
      <div className="py-6 border-t border-border">
        <Link
          to="/privacy-settings"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Settings className="h-4 w-4" />
          Privacy & Data Settings
          <span className="text-xs text-muted-foreground ml-1">- Full data export, erasure, and GDPR rights</span>
        </Link>
      </div>
    </>
  );
}
