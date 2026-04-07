import { Download } from "lucide-react";
import { FolderKanban, CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "../EmptyState";
import { costsApi } from "../../api/costs";
import { cn, formatCents, formatTokens } from "../../lib/utils";

interface EquivalentSpend {
  billingMode: string;
  subscriptionEquivalentCents: number;
  totalEquivalentCents: number;
  note?: string | null;
}

interface ProjectDetailRow {
  projectId?: string | null;
  projectName?: string | null;
  costCents: number;
  equivalentSpendCents: number;
  inputTokens: number;
  outputTokens: number;
}

export function ProjectsTabContent({
  equivalentSpend,
  projectDetailCosts,
  companyId,
  from,
  to,
}: {
  equivalentSpend?: EquivalentSpend | null;
  projectDetailCosts?: ProjectDetailRow[] | null;
  companyId: string;
  from: string | null;
  to: string | null;
}) {
  return (
    <>
      {equivalentSpend && equivalentSpend.billingMode !== "none" && (
        <div className={cn(
          "flex items-center gap-3 p-3 rounded-lg border text-sm",
          equivalentSpend.billingMode === "subscription"
            ? "border-blue-500/30 bg-blue-500/5 text-blue-700 dark:text-blue-300"
            : equivalentSpend.billingMode === "mixed"
              ? "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300"
              : "border-border bg-muted/30",
        )}>
          <CreditCard className="h-4 w-4 shrink-0" />
          <div className="flex-1">
            <span className="font-medium">
              {equivalentSpend.billingMode === "subscription"
                ? "Subscription-based billing"
                : equivalentSpend.billingMode === "mixed"
                  ? "Mixed billing (subscription + API)"
                  : "API-metered billing"}
            </span>
            <span className="text-xs ml-2 opacity-80">
              {equivalentSpend.note}
            </span>
          </div>
          {equivalentSpend.subscriptionEquivalentCents > 0 && (
            <div className="text-right shrink-0">
              <div className="text-xs opacity-70">Equivalent API spend</div>
              <div className="font-mono font-semibold">
                {formatCents(equivalentSpend.totalEquivalentCents)}
              </div>
            </div>
          )}
        </div>
      )}

      {(projectDetailCosts?.length ?? 0) === 0 ? (
        <EmptyState icon={FolderKanban} message="No project costs recorded yet." />
      ) : (
        <div className="space-y-3">
          {projectDetailCosts?.map((project) => (
            <Card key={project.projectId}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{project.projectName ?? "Unknown project"}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        const url = costsApi.projectExportUrl(
                          companyId,
                          project.projectId ?? "",
                          from || undefined,
                          to || undefined,
                        );
                        window.open(url, "_blank");
                      }}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Export CSV
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Actual Spend</div>
                    <div className="text-lg font-mono font-semibold">
                      {formatCents(project.costCents)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Equivalent Spend</div>
                    <div className="text-lg font-mono font-semibold text-blue-600 dark:text-blue-400">
                      {formatCents(project.equivalentSpendCents)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Input Tokens</div>
                    <div className="text-sm font-mono">
                      {formatTokens(project.inputTokens)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Output Tokens</div>
                    <div className="text-sm font-mono">
                      {formatTokens(project.outputTokens)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
