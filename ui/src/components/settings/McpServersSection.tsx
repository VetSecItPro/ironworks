import { Cpu, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { McpServer, McpTool } from "../../api/mcpServers";
import { mcpServersApi } from "../../api/mcpServers";
import { useToast } from "../../context/ToastContext";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

// ── Types ────────────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  description: string;
  transport: "stdio" | "http";
  command: string;
  url: string;
  apiKeySecretName: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  transport: "stdio",
  command: "",
  url: "",
  apiKeySecretName: "",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusLabel(status: McpServer["status"]): React.ReactNode {
  return status === "active" ? (
    <Badge className="text-[10px] px-1.5 py-0.5 bg-green-500/15 text-green-600 border-green-500/20">active</Badge>
  ) : (
    <Badge className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground">paused</Badge>
  );
}

// ── Add/Edit dialog ──────────────────────────────────────────────────────────

interface ServerDialogProps {
  open: boolean;
  onClose: () => void;
  initial: FormState;
  onSubmit: (form: FormState) => Promise<void>;
  title: string;
  submitLabel: string;
}

function ServerDialog({ open, onClose, initial, onSubmit, title, submitLabel }: ServerDialogProps) {
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);

  // Reset form when dialog opens with new initial data.
  useEffect(() => {
    setForm(initial);
  }, [initial]);

  function set(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit(form);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mcp-name">Name</Label>
            <Input
              id="mcp-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Filesystem"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mcp-description">Description (optional)</Label>
            <Input
              id="mcp-description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What does this server provide?"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Transport</Label>
            <div className="flex gap-3">
              {(["stdio", "http"] as const).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => set("transport", t)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    form.transport === t
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent/20"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {form.transport === "stdio" && (
            <div className="space-y-1.5">
              <Label htmlFor="mcp-command">Command</Label>
              <Input
                id="mcp-command"
                value={form.command}
                onChange={(e) => set("command", e.target.value)}
                placeholder="npx @modelcontextprotocol/server-filesystem /workspace"
                required
              />
              <p className="text-xs text-muted-foreground">Shell command to spawn the MCP server process</p>
            </div>
          )}

          {form.transport === "http" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="mcp-url">URL</Label>
                <Input
                  id="mcp-url"
                  value={form.url}
                  onChange={(e) => set("url", e.target.value)}
                  placeholder="https://mcp.example.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mcp-apikey">API Key Secret Name (optional)</Label>
                <Input
                  id="mcp-apikey"
                  value={form.apiKeySecretName}
                  onChange={(e) => set("apiKeySecretName", e.target.value)}
                  placeholder="MCP_SERVER_API_KEY"
                />
                <p className="text-xs text-muted-foreground">
                  References a company secret by name. The resolved value is sent as an Authorization header.
                </p>
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Tool discovery panel ─────────────────────────────────────────────────────

interface ToolsPanelProps {
  tools: McpTool[];
  error: string | null;
  loading: boolean;
}

function ToolsPanel({ tools, error, loading }: ToolsPanelProps) {
  if (loading) {
    return <p className="text-xs text-muted-foreground mt-2">Connecting and discovering tools...</p>;
  }
  if (error) {
    return <p className="text-xs text-destructive mt-2">{error}</p>;
  }
  if (tools.length === 0) return null;
  return (
    <div className="mt-3 rounded-md border border-border bg-muted/20 px-3 py-2 space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Discovered tools</p>
      {tools.map((t) => (
        <div key={t.name} className="flex items-start gap-2">
          <code className="text-xs font-mono text-foreground">{t.name}</code>
          {t.description && <span className="text-xs text-muted-foreground">{t.description}</span>}
        </div>
      ))}
    </div>
  );
}

// ── Main section ─────────────────────────────────────────────────────────────

export function McpServersSection({ companyId }: { companyId: string }) {
  const { pushToast } = useToast();

  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<McpServer | null>(null);

  // Per-server test state: serverId -> { loading, tools, error }
  const [testState, setTestState] = useState<
    Record<string, { loading: boolean; tools: McpTool[]; error: string | null }>
  >({});

  useEffect(() => {
    setLoading(true);
    mcpServersApi
      .list(companyId)
      .then(setServers)
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [companyId]);

  async function handleAdd(form: FormState) {
    const created = await mcpServersApi.create(companyId, {
      name: form.name,
      description: form.description || null,
      transport: form.transport,
      command: form.command || null,
      url: form.url || null,
      apiKeySecretName: form.apiKeySecretName || null,
    });
    setServers((prev) => [...prev, created]);
    pushToast({ title: `MCP server "${created.name}" added`, tone: "success" });
  }

  async function handleEdit(form: FormState) {
    if (!editTarget) return;
    const updated = await mcpServersApi.update(editTarget.id, {
      name: form.name,
      description: form.description || null,
      transport: form.transport,
      command: form.command || null,
      url: form.url || null,
      apiKeySecretName: form.apiKeySecretName || null,
    });
    setServers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    pushToast({ title: `MCP server "${updated.name}" updated`, tone: "success" });
  }

  async function handleDelete(server: McpServer) {
    if (!confirm(`Delete MCP server "${server.name}"? This cannot be undone.`)) return;
    await mcpServersApi.remove(server.id);
    setServers((prev) => prev.filter((s) => s.id !== server.id));
    pushToast({ title: `MCP server "${server.name}" deleted`, tone: "success" });
  }

  async function handleTest(server: McpServer) {
    setTestState((prev) => ({ ...prev, [server.id]: { loading: true, tools: [], error: null } }));
    try {
      const { tools } = await mcpServersApi.test(server.id);
      setTestState((prev) => ({ ...prev, [server.id]: { loading: false, tools, error: null } }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      setTestState((prev) => ({ ...prev, [server.id]: { loading: false, tools: [], error: msg } }));
    }
  }

  const editInitial: FormState = editTarget
    ? {
        name: editTarget.name,
        description: editTarget.description ?? "",
        transport: editTarget.transport,
        command: editTarget.command ?? "",
        url: editTarget.url ?? "",
        apiKeySecretName: editTarget.apiKeySecretName ?? "",
      }
    : EMPTY_FORM;

  return (
    <div id="mcp-servers" className="space-y-4 scroll-mt-6">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <Cpu className="h-3.5 w-3.5" />
        MCP Servers
      </div>

      <div className="rounded-md border border-border px-4 py-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Connect external Model Context Protocol servers to give agents access to file system, web search, GitHub, and
          other tools. Each server is isolated to this company.
        </p>

        {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {loadError && <p className="text-sm text-destructive">{loadError}</p>}

        {!loading && servers.length === 0 && (
          <p className="text-sm text-muted-foreground">No MCP servers configured yet.</p>
        )}

        {servers.map((server) => {
          const ts = testState[server.id];
          return (
            <div key={server.id} className="rounded-md border border-border px-3 py-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium truncate">{server.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono shrink-0">
                    {server.transport}
                  </span>
                  {statusLabel(server.status)}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => handleTest(server)}
                    disabled={ts?.loading}
                  >
                    <Play className="h-3 w-3 mr-1" />
                    {ts?.loading ? "Testing..." : "Test"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditTarget(server)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                    onClick={() => handleDelete(server)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {server.description && <p className="text-xs text-muted-foreground">{server.description}</p>}
              {ts && <ToolsPanel tools={ts.tools} error={ts.error} loading={ts.loading} />}
            </div>
          );
        })}

        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add MCP Server
        </Button>
      </div>

      <ServerDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        initial={EMPTY_FORM}
        onSubmit={handleAdd}
        title="Add MCP Server"
        submitLabel="Add Server"
      />

      <ServerDialog
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        initial={editInitial}
        onSubmit={handleEdit}
        title="Edit MCP Server"
        submitLabel="Save Changes"
      />
    </div>
  );
}
