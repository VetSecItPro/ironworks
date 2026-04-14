import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FinanceBillerCard } from "../FinanceBillerCard";
import { FinanceKindCard } from "../FinanceKindCard";
import { FinanceTimelineCard } from "../FinanceTimelineCard";
import type { FinanceEvent } from "@ironworksai/shared";

interface FinanceBreakdownData {
  byBiller: Array<{ biller: string }>;
  byKind: Array<unknown>;
}

export function FinanceBreakdownSection({
  financeData,
  topFinanceEvents,
}: {
  financeData: FinanceBreakdownData;
  topFinanceEvents: FinanceEvent[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr,0.95fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="px-5 pt-5 pb-2">
            <CardTitle className="text-base">By biller</CardTitle>
            <CardDescription>Account-level financial events grouped by who charged or credited them.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 px-5 pb-5 pt-2 md:grid-cols-2">
            {(financeData.byBiller.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No finance events yet.</p>
            ) : (
              financeData.byBiller.map((row) => <FinanceBillerCard key={row.biller} row={row as Parameters<typeof FinanceBillerCard>[0]["row"]} />)
            )}
          </CardContent>
        </Card>
        <FinanceTimelineCard rows={topFinanceEvents} />
      </div>
      <FinanceKindCard rows={financeData.byKind as Parameters<typeof FinanceKindCard>[0]["rows"]} />
    </div>
  );
}
