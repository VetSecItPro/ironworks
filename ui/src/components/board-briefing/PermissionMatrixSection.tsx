import { Check, Lock } from "lucide-react";
import type { PermissionMatrixData } from "../../api/executive";

interface PermissionMatrixSectionProps {
  permissionMatrix: PermissionMatrixData;
}

export function PermissionMatrixSection({ permissionMatrix }: PermissionMatrixSectionProps) {
  return (
    <div className="rounded-xl border border-border p-5 space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <Lock className="h-3.5 w-3.5" />
        Agent Permission Matrix
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="px-2 py-2 text-left font-semibold text-muted-foreground sticky left-0 bg-background">
                Agent
              </th>
              {permissionMatrix.permissions.map((perm) => (
                <th
                  key={perm}
                  className="px-2 py-2 text-center font-medium text-muted-foreground whitespace-nowrap"
                  title={perm}
                >
                  {perm.split(":").pop()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permissionMatrix.agents.map((agent) => (
              <tr key={agent.agentId} className="border-b border-border/50 hover:bg-accent/10">
                <td className="px-2 py-1.5 font-medium sticky left-0 bg-background whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <span>{agent.name}</span>
                    {agent.department && (
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {agent.department}
                      </span>
                    )}
                  </div>
                </td>
                {permissionMatrix.permissions.map((perm) => (
                  <td key={perm} className="px-2 py-1.5 text-center">
                    {agent.permissions[perm] ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400 mx-auto" />
                    ) : (
                      <span className="text-muted-foreground/20">-</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
