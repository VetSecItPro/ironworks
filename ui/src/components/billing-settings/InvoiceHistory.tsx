import { Download, FileText } from "lucide-react";
import { formatDate } from "../../lib/utils";
import { InvoiceStatusBadge, MOCK_INVOICES } from "./billingHelpers";

export function InvoiceHistory() {
  return (
    <div className="border rounded-lg p-5 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Invoice History</h2>
      </div>
      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Invoice</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Date</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Amount</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Status</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {MOCK_INVOICES.map((inv) => (
              <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-2.5 font-mono text-xs">{inv.id}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{formatDate(inv.date)}</td>
                <td className="px-4 py-2.5 font-medium">${(inv.amount / 100).toFixed(2)}</td>
                <td className="px-4 py-2.5">
                  <InvoiceStatusBadge status={inv.status} />
                </td>
                <td className="px-4 py-2.5 text-right">
                  {inv.status === "paid" && (
                    <button
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={`Download invoice ${inv.id} as PDF`}
                    >
                      <Download className="h-3 w-3" />
                      PDF
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
