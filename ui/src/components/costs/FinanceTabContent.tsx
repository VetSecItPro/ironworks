import { Plus } from "lucide-react";
import type { FinanceEvent } from "@ironworksai/shared";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "../PageSkeleton";
import { NewFinanceEventDialog } from "../NewFinanceEventDialog";
import { FinanceSummaryCard } from "./FinanceSummaryCard";
import { FinanceBillerCard } from "../FinanceBillerCard";
import { FinanceKindCard } from "../FinanceKindCard";
import { FinanceTimelineCard } from "../FinanceTimelineCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface FinanceSummaryData {
  debitCents: number;
  creditCents: number;
  netCents: number;
  estimatedDebitCents: number;
  eventCount: number;
}

export function FinanceTabContent({
  showNewFinanceEvent,
  setShowNewFinanceEvent,
  financeEventMutation,
  showCustomPrompt,
  financeLoading,
  financeError,
  financeData,
  topFinanceEvents,
}: {
  showNewFinanceEvent: boolean;
  setShowNewFinanceEvent: (v: boolean) => void;
  financeEventMutation: {
    isPending: boolean;
    mutate: (event: Parameters<typeof import("../../api/costs").costsApi.createFinanceEvent>[1]) => void;
  };
  showCustomPrompt: boolean;
  financeLoading: boolean;
  financeError: Error | null;
  financeData?: { summary: FinanceSummaryData; byBiller: Array<unknown>; byKind: Array<unknown> } | null;
  topFinanceEvents: FinanceEvent[];
}) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Finance Ledger</h2>
          <p className="text-sm text-muted-foreground">Record payments, charges, credits, and adjustments.</p>
        </div>
        <Button size="sm" onClick={() => setShowNewFinanceEvent(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New Event
        </Button>
      </div>

      <NewFinanceEventDialog
        open={showNewFinanceEvent}
        onOpenChange={setShowNewFinanceEvent}
        onSubmit={(event) => financeEventMutation.mutate(event)}
        isPending={financeEventMutation.isPending}
      />

      {showCustomPrompt ? (
        <p className="text-sm text-muted-foreground">Select a start and end date to load data.</p>
      ) : financeLoading ? (
        <PageSkeleton variant="costs" />
      ) : financeError ? (
        <p className="text-sm text-destructive">{financeError.message}</p>
      ) : (
        <>
          <FinanceSummaryCard
            debitCents={financeData?.summary.debitCents ?? 0}
            creditCents={financeData?.summary.creditCents ?? 0}
            netCents={financeData?.summary.netCents ?? 0}
            estimatedDebitCents={financeData?.summary.estimatedDebitCents ?? 0}
            eventCount={financeData?.summary.eventCount ?? 0}
          />

          <div className="grid gap-4 xl:grid-cols-[1.2fr,0.95fr]">
            <div className="space-y-4">
              <Card>
                <CardHeader className="px-5 pt-5 pb-2">
                  <CardTitle className="text-base">By biller</CardTitle>
                  <CardDescription>Account-level financial events grouped by who charged or credited them.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 px-5 pb-5 pt-2 md:grid-cols-2">
                  {(financeData?.byBiller.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">No finance events yet.</p>
                  ) : (
                    financeData?.byBiller.map((row) => <FinanceBillerCard key={(row as { biller: string }).biller} row={row as Parameters<typeof FinanceBillerCard>[0]["row"]} />)
                  )}
                </CardContent>
              </Card>
              <FinanceTimelineCard rows={topFinanceEvents} />
            </div>

            <FinanceKindCard rows={financeData?.byKind as Parameters<typeof FinanceKindCard>[0]["rows"] ?? []} />
          </div>
        </>
      )}
    </>
  );
}
