import { AGENT_ROLE_LABELS, type Agent, DEPARTMENT_LABELS } from "@ironworksai/shared";
import { Users } from "lucide-react";
import type { AgentExpertiseProfile } from "../../api/expertiseMap";
import { getAgentRingClass, getRoleLevel } from "../../lib/role-icons";
import { agentUrl, cn, relativeTime } from "../../lib/utils";
import { AgentIcon } from "../AgentIconPicker";
import type { LayoutNode } from "./orgChartLayout";
import { CARD_H, CARD_W } from "./orgChartLayout";

const adapterLabels: Record<string, string> = {
  claude_local: "Claude",
  codex_local: "Codex",
  gemini_local: "Gemini",
  opencode_local: "OpenCode",
  cursor: "Cursor",
  openclaw_gateway: "OpenClaw Gateway",
  process: "Process",
  http: "HTTP",
  ollama_cloud: "Ollama Cloud",
};

const statusDotColor: Record<string, string> = {
  running: "#22d3ee",
  active: "#4ade80",
  paused: "#facc15",
  idle: "#facc15",
  error: "#f87171",
  terminated: "#a3a3a3",
};
const defaultDotColor = "#a3a3a3";

const departmentBorderColor: Record<string, string> = {
  executive: "border-l-amber-500/40",
  engineering: "border-l-blue-500/40",
  design: "border-l-purple-500/40",
  operations: "border-l-emerald-500/40",
  finance: "border-l-green-500/40",
  security: "border-l-red-500/40",
  research: "border-l-cyan-500/40",
  marketing: "border-l-pink-500/40",
  support: "border-l-orange-500/40",
  compliance: "border-l-indigo-500/40",
  hr: "border-l-violet-500/40",
};

const departmentLabels = DEPARTMENT_LABELS as Record<string, string>;
const roleLabels: Record<string, string> = AGENT_ROLE_LABELS;

function roleLabel(role: string): string {
  return roleLabels[role] ?? role;
}

export function OrgChartCard({
  node,
  agent,
  activeTasks,
  perfScore,
  isHovered,
  skillProfile,
  onNavigate,
  onMouseEnter,
  onMouseLeave,
}: {
  node: LayoutNode;
  agent: Agent | undefined;
  activeTasks: number;
  perfScore: number | undefined;
  isHovered: boolean;
  skillProfile: AgentExpertiseProfile | undefined;
  onNavigate: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const dotColor = statusDotColor[node.status] ?? defaultDotColor;
  const empType = (agent as unknown as Record<string, unknown> | undefined)?.employmentType as string | undefined;
  const dept = (agent as unknown as Record<string, unknown> | undefined)?.department as string | undefined;
  const isContractor = empType === "contractor";

  return (
    <div
      data-org-card
      className={cn(
        "absolute bg-card rounded-xl shadow-sm shadow-black/5 hover:shadow-lg hover:border-foreground/20 transition-all duration-200 cursor-pointer select-none border-l-[3px]",
        isContractor ? "border border-dashed border-amber-400/50" : "border border-border",
        dept && departmentBorderColor[dept] ? departmentBorderColor[dept] : "border-l-border",
      )}
      style={{
        left: node.x,
        top: node.y,
        width: CARD_W,
        minHeight: CARD_H,
      }}
      onClick={onNavigate}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Workload badge */}
      {activeTasks > 0 && (
        <span className="absolute -top-2 -right-2 flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-blue-500 text-white text-[10px] font-bold shadow-sm z-10">
          {activeTasks}
        </span>
      )}
      <div className="flex items-start px-4 py-4 gap-3">
        {/* Agent icon + status dot */}
        <div className="relative shrink-0">
          <div
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center mt-0.5",
              getRoleLevel(node.role) === "executive"
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : getRoleLevel(node.role) === "management"
                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                  : "bg-muted text-foreground/70",
              getAgentRingClass(node.role, empType),
            )}
          >
            <AgentIcon icon={agent?.icon} className="h-5 w-5" />
          </div>
          <span
            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card"
            style={{ backgroundColor: dotColor }}
          />
        </div>
        {/* Name + role + badges + model */}
        <div className="flex flex-col items-start min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-foreground leading-tight">{node.name}</span>
            {/* Role level badge */}
            {getRoleLevel(node.role) === "executive" && (
              <span className="text-[10px] font-semibold px-1 py-0 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 leading-tight">
                C
              </span>
            )}
            {getRoleLevel(node.role) === "management" && (
              <span className="text-[10px] font-semibold px-1 py-0 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 leading-tight">
                M
              </span>
            )}
            {getRoleLevel(node.role) === "staff" && !isContractor && (
              <span className="text-[10px] font-semibold px-1 py-0 rounded-full bg-green-500/15 text-green-600 dark:text-green-400 leading-tight">
                FTE
              </span>
            )}
            {isContractor && (
              <span className="text-[10px] font-semibold px-1 py-0 rounded-full border border-dashed border-amber-400/60 text-amber-500 leading-tight">
                CTR
              </span>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground leading-tight mt-0.5">
            {agent?.title ?? roleLabel(node.role)}
          </span>
          {dept && (
            <span className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">
              {departmentLabels[dept] ?? dept}
            </span>
          )}
          {agent
            ? (() => {
                const cfg = agent.adapterConfig as Record<string, unknown> | null;
                const modelRaw = cfg?.model as string | undefined;
                const modelName = modelRaw ? modelRaw.replace(/:cloud$/, "") : null;
                const provider: string = adapterLabels[agent.adapterType] ?? agent.adapterType;
                return (
                  <span className="text-[10px] text-muted-foreground/80 font-mono leading-tight mt-1.5">
                    {provider}
                    {modelName ? ` - ${modelName}` : ""}
                  </span>
                );
              })()
            : null}
          {/* Span of control metric for managers (12.14) */}
          {node.children.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 mt-1">
              <Users className="h-2.5 w-2.5" />
              {node.children.length} report{node.children.length !== 1 ? "s" : ""}
            </span>
          )}
          {/* Members since date (12.69) */}
          {agent != null && typeof (agent as unknown as Record<string, unknown>).createdAt === "string" ? (
            <span className="text-[10px] text-muted-foreground/70 mt-0.5">
              Member since{" "}
              {new Date(String((agent as unknown as Record<string, unknown>).createdAt)).toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
              })}
            </span>
          ) : null}
          {/* Skill tags from expertise map */}
          {(() => {
            if (!skillProfile || skillProfile.topSkills.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-0.5 mt-1">
                {skillProfile.topSkills.slice(0, 2).map((sk) => (
                  <span
                    key={sk.labelId}
                    className="inline-flex items-center gap-0.5 text-[10px] px-1 py-0 rounded bg-muted/50 text-muted-foreground/70"
                  >
                    <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: sk.labelColor }} />
                    {sk.labelName}
                  </span>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
      {/* Hover mini-profile card */}
      {isHovered && (
        <div
          className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-20 w-56 bg-popover border border-border rounded-lg shadow-lg p-3 space-y-2 pointer-events-none"
          style={{ transformOrigin: "top center" }}
        >
          <div className="text-xs font-semibold">{node.name}</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[10px] text-muted-foreground">Active</div>
              <div className="text-sm font-bold tabular-nums">{activeTasks}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">Score</div>
              <div className="text-sm font-bold tabular-nums">{perfScore !== undefined ? `${perfScore}%` : "-"}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">Tenure</div>
              <div className="text-sm font-bold tabular-nums">
                {agent && (agent as unknown as Record<string, unknown>).createdAt
                  ? relativeTime(new Date((agent as unknown as Record<string, unknown>).createdAt as string))
                  : "-"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
