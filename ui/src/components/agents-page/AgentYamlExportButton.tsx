/**
 * Toolbar button that POSTs to the export route and triggers a browser
 * download of the resulting YAML file. No external state needed — the
 * download is entirely client-side after the fetch resolves.
 */

import { Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { agentsApi } from "../../api/agents";

interface AgentYamlExportButtonProps {
  companyId: string;
  /** Optional subset of agent IDs to export. Omit to export all agents. */
  agentIds?: string[];
}

export function AgentYamlExportButton({ companyId, agentIds }: AgentYamlExportButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const yaml = await agentsApi.exportYaml(companyId, agentIds);
      const blob = new Blob([yaml], { type: "text/yaml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `agents-export-${Date.now()}.yaml`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      // Surface the error in a non-blocking way; a toast/alert can be
      // wired here once a global notification system is in place.
      console.error("Agent YAML export failed:", err);
      alert(err instanceof Error ? err.message : "Export failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={handleExport} disabled={loading} aria-label="Export agents as YAML">
      <Download className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
      {loading ? "Exporting…" : "Export YAML"}
    </Button>
  );
}
