import type { AdapterEnvironmentTestResult } from "@ironworksai/shared";
import { Bot, X } from "lucide-react";
import type { TeamPack } from "../../api/teamTemplates";
import { cn } from "../../lib/utils";
import { nextRosterId } from "./constants";
import { ManualAgentSection } from "./ManualAgentSection";
import type { AdapterType, RosterItem } from "./types";

interface StepAgentProps {
  step2Mode: "pack" | "manual";
  onStep2ModeChange: (mode: "pack" | "manual") => void;
  teamPacks: TeamPack[] | undefined;
  selectedPackKey: string | null;
  onSelectedPackKeyChange: (key: string | null) => void;
  rosterItems: RosterItem[];
  onRosterItemsChange: (items: RosterItem[]) => void;
  packCreating: boolean;
  packProgress: { done: number; total: number } | null;
  agentName: string;
  onAgentNameChange: (value: string) => void;
  adapterType: AdapterType;
  onAdapterTypeChange: (type: AdapterType) => void;
  model: string;
  onModelChange: (value: string) => void;
  url: string;
  onUrlChange: (value: string) => void;
  showMoreAdapters: boolean;
  onShowMoreAdaptersChange: (show: boolean) => void;
  modelOpen: boolean;
  onModelOpenChange: (open: boolean) => void;
  modelSearch: string;
  onModelSearchChange: (value: string) => void;
  adapterModels: Array<{ id: string; label: string }> | undefined;
  isLocalAdapter: boolean;
  effectiveAdapterCommand: string;
  adapterEnvResult: AdapterEnvironmentTestResult | null;
  adapterEnvError: string | null;
  adapterEnvLoading: boolean;
  onRunAdapterEnvTest: () => void;
  shouldSuggestUnsetAnthropicApiKey: boolean;
  unsetAnthropicLoading: boolean;
  onUnsetAnthropicApiKey: () => void;
}

export function StepAgent(props: StepAgentProps) {
  const {
    step2Mode,
    onStep2ModeChange,
    teamPacks,
    selectedPackKey,
    onSelectedPackKeyChange,
    rosterItems,
    onRosterItemsChange,
    packCreating,
    packProgress,
    ...manualProps
  } = props;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-1">
        <div className="bg-muted/50 p-2">
          <Bot className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-medium">Build your team</h3>
          <p className="text-xs text-muted-foreground">Deploy a pre-built team or create a single agent.</p>
        </div>
      </div>

      <div className="flex items-center gap-1 border border-border rounded-md overflow-hidden">
        <button
          type="button"
          className={cn(
            "flex-1 px-3 py-1.5 text-xs transition-colors",
            step2Mode === "pack" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onStep2ModeChange("pack")}
        >
          Team Pack
        </button>
        <button
          type="button"
          className={cn(
            "flex-1 px-3 py-1.5 text-xs transition-colors",
            step2Mode === "manual" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onStep2ModeChange("manual")}
        >
          Single Agent
        </button>
      </div>

      <p className="text-xs text-muted-foreground/80 bg-muted/30 rounded-md px-3 py-2">
        Start with 3-5 agents. You can always add more later.
      </p>

      {step2Mode === "pack" && (
        <TeamPackSection
          teamPacks={teamPacks}
          selectedPackKey={selectedPackKey}
          onSelectedPackKeyChange={onSelectedPackKeyChange}
          rosterItems={rosterItems}
          onRosterItemsChange={onRosterItemsChange}
          packCreating={packCreating}
          packProgress={packProgress}
        />
      )}

      {step2Mode === "manual" && <ManualAgentSection {...manualProps} />}
    </div>
  );
}

function TeamPackSection({
  teamPacks,
  selectedPackKey,
  onSelectedPackKeyChange,
  rosterItems,
  onRosterItemsChange,
  packCreating,
  packProgress,
}: {
  teamPacks: TeamPack[] | undefined;
  selectedPackKey: string | null;
  onSelectedPackKeyChange: (key: string | null) => void;
  rosterItems: RosterItem[];
  onRosterItemsChange: (items: RosterItem[]) => void;
  packCreating: boolean;
  packProgress: { done: number; total: number } | null;
}) {
  return (
    <div className="space-y-3">
      {(teamPacks ?? []).map((pack) => (
        <button
          type="button"
          key={pack.key}
          className={cn(
            "w-full text-left rounded-lg border p-4 transition-colors",
            selectedPackKey === pack.key ? "border-foreground bg-accent" : "border-border hover:bg-accent/50",
          )}
          onClick={() => {
            onSelectedPackKeyChange(pack.key);
            onRosterItemsChange(
              pack.roles.map((r) => ({
                id: nextRosterId(),
                templateKey: r.key,
                name: r.title,
                role: r.role,
                reportsTo: r.reportsTo,
                suggestedAdapter: r.suggestedAdapter,
                skills: r.skills ?? [],
                title: r.title,
              })),
            );
          }}
          disabled={packCreating}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium">{pack.name}</span>
            <span className="text-xs text-muted-foreground">{pack.roleCount} agents</span>
          </div>
          <p className="text-xs text-muted-foreground">{pack.description}</p>
          <div className="mt-2 space-y-1">
            {pack.roles.map((role) => (
              <div key={role.key} className="flex items-start gap-2">
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground shrink-0">
                  {role.title}
                </span>
                <span className="text-[10px] text-muted-foreground/70 leading-relaxed">{role.tagline}</span>
              </div>
            ))}
          </div>
        </button>
      ))}

      {selectedPackKey && rosterItems.length > 0 && !packCreating && (
        <div className="space-y-2 border border-border rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Customize Roster</span>
            <span className="text-[10px] text-muted-foreground">{rosterItems.length} agents</span>
          </div>
          <div className="space-y-1.5">
            {rosterItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <input
                  className="flex-1 min-w-0 rounded border border-border bg-transparent px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  value={item.name}
                  onChange={(e) =>
                    onRosterItemsChange(rosterItems.map((r) => (r.id === item.id ? { ...r, name: e.target.value } : r)))
                  }
                  placeholder={item.title}
                />
                <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap" title={item.title}>
                  {item.title}
                </span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground transition-colors shrink-0 px-1"
                  title={`Duplicate ${item.title}`}
                  onClick={() => {
                    const idx = rosterItems.findIndex((r) => r.id === item.id);
                    const dup: RosterItem = { ...item, id: nextRosterId(), name: `${item.title} 2` };
                    const next = [...rosterItems];
                    next.splice(idx + 1, 0, dup);
                    onRosterItemsChange(next);
                  }}
                >
                  +
                </button>
                {rosterItems.length > 1 && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-red-400 transition-colors shrink-0 px-1"
                    title={`Remove ${item.name}`}
                    onClick={() => onRosterItemsChange(rosterItems.filter((r) => r.id !== item.id))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Rename agents, click + to duplicate a role, or x to remove.
          </p>
        </div>
      )}

      {packProgress && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span>Creating agents...</span>
            <span>
              {packProgress.done}/{packProgress.total}
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-[width] duration-300"
              style={{ width: `${(packProgress.done / packProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
