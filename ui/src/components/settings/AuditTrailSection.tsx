import { Eye } from "lucide-react";

interface AuditEntry {
  section: string;
  changedBy: string;
  changedAt: string;
  field: string;
  oldValue?: string;
  newValue?: string;
}

const MOCK_AUDIT_TRAIL: AuditEntry[] = [
  {
    section: "general",
    changedBy: "Admin",
    changedAt: "2026-03-28T14:30:00Z",
    field: "Company Name",
    oldValue: "Acme Corp",
    newValue: "Acme AI Corp",
  },
  {
    section: "security",
    changedBy: "CTO",
    changedAt: "2026-03-25T09:15:00Z",
    field: "Require Approval",
    oldValue: "false",
    newValue: "true",
  },
  {
    section: "autonomy",
    changedBy: "Admin",
    changedAt: "2026-03-20T16:00:00Z",
    field: "Default Autonomy",
    oldValue: "h3",
    newValue: "h2",
  },
  {
    section: "cost-alerts",
    changedBy: "CFO",
    changedAt: "2026-03-18T11:30:00Z",
    field: "Monthly Threshold",
    oldValue: "$300",
    newValue: "$500",
  },
];

export function AuditTrailSection() {
  return (
    <div id="audit-trail" className="space-y-4 scroll-mt-6">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <Eye className="h-3.5 w-3.5" />
        Audit Trail
      </div>
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Section</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Field</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Changed By</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Date</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {MOCK_AUDIT_TRAIL.map((entry, i) => (
              <tr key={i} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-2.5 text-xs capitalize">{entry.section.replace(/-/g, " ")}</td>
                <td className="px-4 py-2.5 text-xs font-medium">{entry.field}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{entry.changedBy}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  {new Date(entry.changedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </td>
                <td className="px-4 py-2.5 text-xs">
                  {entry.oldValue && <span className="text-red-400 line-through mr-1">{entry.oldValue}</span>}
                  {entry.newValue && <span className="text-emerald-400">{entry.newValue}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Shows the last 50 configuration changes. Full audit log available in the admin panel.
      </p>
    </div>
  );
}
