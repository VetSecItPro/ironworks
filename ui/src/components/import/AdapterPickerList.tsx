import { ArrowRight, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import { AgentConfigForm } from "../AgentConfigForm";
import { adapterLabels } from "../agent-config-primitives";
import { defaultCreateValues } from "../agent-config-defaults";
import { listUIAdapters } from "../../adapters";
import type { CreateConfigValues } from "@ironworksai/adapter-utils";

export const IMPORT_ADAPTER_OPTIONS: { value: string; label: string }[] =
  listUIAdapters().map((adapter) => ({
    value: adapter.type,
    label: adapterLabels[adapter.type] ?? adapter.label,
  }));

export interface AdapterPickerItem {
  slug: string;
  name: string;
  adapterType: string;
}

export function AdapterPickerList({
  agents,
  adapterOverrides,
  expandedSlugs,
  configValues,
  onChangeAdapter,
  onToggleExpand,
  onChangeConfig,
}: {
  agents: AdapterPickerItem[];
  adapterOverrides: Record<string, string>;
  expandedSlugs: Set<string>;
  configValues: Record<string, CreateConfigValues>;
  onChangeAdapter: (slug: string, adapterType: string) => void;
  onToggleExpand: (slug: string) => void;
  onChangeConfig: (slug: string, patch: Partial<CreateConfigValues>) => void;
}) {
  if (agents.length === 0) return null;

  return (
    <div className="mx-5 mt-3">
      <div className="rounded-md border border-border">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <h3 className="text-sm font-medium">Adapters</h3>
          <span className="text-xs text-muted-foreground">
            {agents.length} agent{agents.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="divide-y divide-border">
          {agents.map((agent) => {
            const selectedType =
              adapterOverrides[agent.slug] ?? agent.adapterType;
            const isExpanded = expandedSlugs.has(agent.slug);
            const vals = configValues[agent.slug] ?? {
              ...defaultCreateValues,
              adapterType: selectedType,
            };

            return (
              <div key={agent.slug}>
                <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide",
                      "text-blue-500 border-blue-500/30",
                    )}
                  >
                    agent
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {agent.name}
                  </span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <select
                    className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 py-1 text-xs outline-none focus:border-foreground"
                    value={selectedType}
                    onChange={(e) =>
                      onChangeAdapter(agent.slug, e.target.value)
                    }
                  >
                    {IMPORT_ADAPTER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={cn(
                      "ml-auto shrink-0 rounded-md border px-2.5 py-1 text-xs transition-colors inline-flex items-center gap-1.5",
                      isExpanded
                        ? "border-foreground bg-accent text-foreground"
                        : "border-border text-muted-foreground hover:bg-accent/50",
                    )}
                    onClick={() => onToggleExpand(agent.slug)}
                  >
                    <ChevronRight
                      className={cn(
                        "h-3 w-3 transition-transform",
                        isExpanded && "rotate-90",
                      )}
                    />
                    configure adapter
                  </button>
                </div>
                {isExpanded && (
                  <div className="border-t border-border bg-accent/10 px-4 py-3 space-y-3">
                    <AgentConfigForm
                      mode="create"
                      values={vals}
                      onChange={(patch) => onChangeConfig(agent.slug, patch)}
                      showAdapterTypeField={false}
                      showAdapterTestEnvironmentButton={false}
                      showCreateRunPolicySection={false}
                      hideInstructionsFile
                      sectionLayout="cards"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
