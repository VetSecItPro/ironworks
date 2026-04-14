export function exportAgentConfig(agents: Array<{ id: string; name: string; [key: string]: unknown }>) {
  const data = agents.map(({ id, ...rest }) => rest);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `agent-configs-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importAgentConfig(file: File): Promise<Array<Record<string, unknown>>> {
  const text = await file.text();
  return JSON.parse(text) as Array<Record<string, unknown>>;
}
