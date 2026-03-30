import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Database,
  Download,
  Shield,
  Trash2,
} from "lucide-react";
import { privacyApi } from "../api/privacy";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { CookieSettingsLink } from "../components/CookieConsent";

export function PrivacySettings() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();

  useEffect(() => {
    setBreadcrumbs([
      { label: "Settings" },
      { label: "Privacy & Data" },
    ]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  const { data: summary } = useQuery({
    queryKey: ["privacy", "summary", selectedCompanyId],
    queryFn: () => privacyApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const [erasureConfirm, setErasureConfirm] = useState(false);

  const erasureMutation = useMutation({
    mutationFn: () => privacyApi.requestErasure(selectedCompanyId!),
    onSuccess: (data) => {
      pushToast({
        title: "Erasure scheduled",
        body: data.message,
        tone: "success",
      });
      setErasureConfirm(false);
    },
    onError: () => {
      pushToast({ title: "Failed to request erasure", tone: "error" });
    },
  });

  if (!selectedCompanyId) return null;

  return (
    <div className="max-w-3xl space-y-8 py-2">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Privacy & Data
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your data, review what we store, and exercise your privacy rights.
        </p>
      </div>

      {/* Data Summary */}
      {summary && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Data We Store</h2>
          <div className="grid gap-2">
            {summary.dataCategories.map((cat) => (
              <div
                key={cat.category}
                className="flex items-center justify-between p-3 rounded-lg border border-border"
              >
                <div>
                  <span className="text-sm font-medium">{cat.category}</span>
                  <p className="text-xs text-muted-foreground">{cat.description}</p>
                </div>
                <span className="text-sm font-mono text-muted-foreground">
                  {cat.count.toLocaleString()} records
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Retention Policies */}
      {summary && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Data Retention</h2>
          <p className="text-xs text-muted-foreground">
            Data is automatically cleaned up after these retention periods. Cleanup runs daily.
          </p>
          <div className="grid gap-2">
            {Object.entries(summary.retentionPolicies).map(([key, value]) => (
              <div
                key={key}
                className="flex items-center justify-between p-3 rounded-lg border border-border"
              >
                <span className="text-sm">{key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}</span>
                <span className="text-sm font-mono text-muted-foreground">{value}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Your Rights */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Your Rights</h2>
        <div className="grid gap-3">
          {/* Data Export */}
          <div className="flex items-start gap-3 p-4 rounded-lg border border-border">
            <Download className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium">Export Your Data</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Download a complete copy of all your company data in machine-readable JSON format.
                This includes agents, projects, issues, comments, costs, and activity logs.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  window.open(privacyApi.exportData(selectedCompanyId), "_blank");
                }}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Download Data Export
              </Button>
            </div>
          </div>

          {/* Cookie Preferences */}
          <div className="flex items-start gap-3 p-4 rounded-lg border border-border">
            <Database className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium">Cookie Preferences</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Manage which optional cookies are active. Strictly necessary cookies cannot be disabled.
              </p>
              <div className="mt-2">
                <CookieSettingsLink />
              </div>
            </div>
          </div>

          {/* Data Erasure */}
          <div className="flex items-start gap-3 p-4 rounded-lg border border-destructive/40 bg-destructive/5">
            <Trash2 className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Request Data Erasure</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Permanently delete all company data. This action schedules deletion in 30 days,
                giving you time to cancel if needed. After 30 days, all data is permanently and
                irreversibly removed.
              </p>
              {erasureConfirm ? (
                <div className="flex items-center gap-2 mt-3">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                  <span className="text-sm text-destructive font-medium">
                    This will schedule permanent deletion of ALL data. Are you sure?
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => erasureMutation.mutate()}
                    disabled={erasureMutation.isPending}
                  >
                    {erasureMutation.isPending ? "Requesting..." : "Confirm Erasure"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setErasureConfirm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="destructive"
                  size="sm"
                  className="mt-2"
                  onClick={() => setErasureConfirm(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Request Data Erasure
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Privacy Policy Link */}
      <section className="pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground">
          For more information about how we handle your data, read our{" "}
          <a href="/privacy" className="underline hover:text-foreground">
            Privacy Policy
          </a>
          . To exercise any rights not covered here, contact us at{" "}
          <span className="font-medium">privacy@steelmotionllc.ai</span>.
        </p>
      </section>
    </div>
  );
}
