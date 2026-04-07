import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Key, Monitor, RotateCcw, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { useToast } from "../../context/ToastContext";

const API_KEYS_STORAGE_KEY = "ironworks:api-keys";
const SESSIONS_STORAGE_KEY = "ironworks:sessions";

interface ApiKeyEntry {
  id: string;
  name: string;
  lastFour: string;
  createdAt: string;
}

interface SessionEntry {
  id: string;
  device: string;
  ip: string;
  lastActive: string;
  current: boolean;
}

function loadApiKeys(): ApiKeyEntry[] {
  try {
    const raw = localStorage.getItem(API_KEYS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  const seed: ApiKeyEntry[] = [
    {
      id: "key_1",
      name: "Production API Key",
      lastFour: "x8k2",
      createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    },
    {
      id: "key_2",
      name: "Development API Key",
      lastFour: "m4n9",
      createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    },
  ];
  localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(seed));
  return seed;
}

function loadSessions(): SessionEntry[] {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  const seed: SessionEntry[] = [
    {
      id: "sess_1",
      device: "Chrome on macOS",
      ip: "192.168.1.42",
      lastActive: new Date().toISOString(),
      current: true,
    },
    {
      id: "sess_2",
      device: "Firefox on Linux",
      ip: "10.0.0.15",
      lastActive: new Date(Date.now() - 3600000).toISOString(),
      current: false,
    },
    {
      id: "sess_3",
      device: "Safari on iPhone",
      ip: "172.16.0.8",
      lastActive: new Date(Date.now() - 86400000).toISOString(),
      current: false,
    },
  ];
  localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(seed));
  return seed;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function SecuritySection({ companyId: _companyId }: { companyId: string }) {
  const { pushToast } = useToast();
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>(loadApiKeys);
  const [sessions, setSessions] = useState<SessionEntry[]>(loadSessions);
  const [revealedKeyId, setRevealedKeyId] = useState<string | null>(null);

  function handleRotateKey(keyId: string) {
    const newLastFour = Math.random().toString(36).slice(2, 6);
    const updated = apiKeys.map((k) =>
      k.id === keyId
        ? { ...k, lastFour: newLastFour, createdAt: new Date().toISOString() }
        : k,
    );
    setApiKeys(updated);
    localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(updated));
    pushToast({ title: "API key rotated", tone: "success" });
  }

  function handleRevokeKey(keyId: string) {
    const updated = apiKeys.filter((k) => k.id !== keyId);
    setApiKeys(updated);
    localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(updated));
    pushToast({ title: "API key revoked", tone: "success" });
  }

  function handleRevokeSession(sessionId: string) {
    const updated = sessions.filter((s) => s.id !== sessionId);
    setSessions(updated);
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(updated));
    pushToast({ title: "Session revoked", tone: "success" });
  }

  return (
    <div id="security" className="space-y-4 scroll-mt-6">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <ShieldCheck className="h-3.5 w-3.5" />
        Security & Trust
      </div>

      {/* API Key Management */}
      <div className="rounded-md border border-border px-4 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">API Key Management</span>
        </div>
        {apiKeys.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No API keys configured.
          </p>
        ) : (
          <div className="space-y-2">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{key.name}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span className="font-mono">
                      {revealedKeyId === key.id
                        ? `sk-...${key.lastFour}`
                        : `sk-****${key.lastFour}`}
                    </span>
                    <button
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() =>
                        setRevealedKeyId(
                          revealedKeyId === key.id ? null : key.id,
                        )
                      }
                    >
                      {revealedKeyId === key.id ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </button>
                    <span className="text-border">|</span>
                    <span>Created {formatRelative(key.createdAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRotateKey(key.id)}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Rotate
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive/40 hover:bg-destructive/5"
                    onClick={() => handleRevokeKey(key.id)}
                  >
                    Revoke
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Sessions */}
      <div className="rounded-md border border-border px-4 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Active Sessions</span>
        </div>
        {sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No active sessions.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {session.device}
                    </span>
                    {session.current && (
                      <span className="text-[10px] font-medium bg-green-500/10 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span className="font-mono">{session.ip}</span>
                    <span className="text-border">|</span>
                    <span>Active {formatRelative(session.lastActive)}</span>
                  </div>
                </div>
                {!session.current && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive/40 hover:bg-destructive/5 shrink-0 ml-3"
                    onClick={() => handleRevokeSession(session.id)}
                  >
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
