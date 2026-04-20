import { AGENT_ROLE_LABELS, type Agent, DEPARTMENT_LABELS } from "@ironworksai/shared";
import { X } from "lucide-react";
import { formatCents, relativeTime } from "../../lib/utils";
import { StatusBadge } from "../StatusBadge";

const adapterLabels: Record<string, string> = {
  claude_local: "Claude",
  codex_local: "Codex",
  gemini_local: "Gemini",
  opencode_local: "OpenCode",
  cursor: "Cursor",
  openclaw_gateway: "OpenClaw Gateway",
  process: "Process",
  http: "HTTP",
};

export function AgentCompareModal({
  agents,
  liveRunByAgent,
  onClose,
}: {
  agents: Agent[];
  liveRunByAgent: Map<string, { runId: string; liveCount: number }>;
  onClose: () => void;
}) {
  if (agents.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="button" tabIndex={0} aria-label="Close modal" onClick={onClose} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); onClose(); } }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Agent Comparison"
        className="relative w-full max-w-3xl mx-4 bg-background border border-border rounded-lg shadow-lg max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">Agent Comparison</h2>
          <button type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close comparison"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Property</th>
                {agents.map((a) => (
                  <th key={a.id} className="text-left px-4 py-2 font-medium">
                    {a.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/50">
                <td className="px-4 py-2 text-muted-foreground">Role</td>
                {agents.map((a) => (
                  <td key={a.id} className="px-4 py-2">
                    {(AGENT_ROLE_LABELS as Record<string, string>)[a.role] ?? a.role}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-border/50">
                <td className="px-4 py-2 text-muted-foreground">Title</td>
                {agents.map((a) => (
                  <td key={a.id} className="px-4 py-2">
                    {a.title || "-"}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-border/50">
                <td className="px-4 py-2 text-muted-foreground">Status</td>
                {agents.map((a) => (
                  <td key={a.id} className="px-4 py-2">
                    <StatusBadge status={a.status} />
                  </td>
                ))}
              </tr>
              <tr className="border-b border-border/50">
                <td className="px-4 py-2 text-muted-foreground">Adapter</td>
                {agents.map((a) => (
                  <td key={a.id} className="px-4 py-2 font-mono">
                    {adapterLabels[a.adapterType] ?? a.adapterType}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-border/50">
                <td className="px-4 py-2 text-muted-foreground">Department</td>
                {agents.map((a) => {
                  const dept = (a as unknown as Record<string, unknown>).department as string | undefined;
                  return (
                    <td key={a.id} className="px-4 py-2">
                      {dept ? ((DEPARTMENT_LABELS as Record<string, string>)[dept] ?? dept) : "-"}
                    </td>
                  );
                })}
              </tr>
              <tr className="border-b border-border/50">
                <td className="px-4 py-2 text-muted-foreground">Employment</td>
                {agents.map((a) => {
                  const emp = ((a as unknown as Record<string, unknown>).employmentType as string) ?? "full_time";
                  return (
                    <td key={a.id} className="px-4 py-2">
                      {emp === "contractor" ? "Contractor" : "Full-Time"}
                    </td>
                  );
                })}
              </tr>
              <tr className="border-b border-border/50">
                <td className="px-4 py-2 text-muted-foreground">Monthly Cost</td>
                {agents.map((a) => (
                  <td key={a.id} className="px-4 py-2 tabular-nums">
                    {a.spentMonthlyCents > 0 ? formatCents(a.spentMonthlyCents) : "-"}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-border/50">
                <td className="px-4 py-2 text-muted-foreground">Live Runs</td>
                {agents.map((a) => {
                  const live = liveRunByAgent.get(a.id);
                  return (
                    <td key={a.id} className="px-4 py-2">
                      {live ? `${live.liveCount} running` : "None"}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="px-4 py-2 text-muted-foreground">Last Heartbeat</td>
                {agents.map((a) => (
                  <td key={a.id} className="px-4 py-2">
                    {a.lastHeartbeatAt ? relativeTime(a.lastHeartbeatAt) : "Never"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
