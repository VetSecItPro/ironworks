import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Mail,
  MessageSquare,
  Trash2,
  VolumeX,
  X,
} from "lucide-react";
import { cn, formatDateTime } from "../lib/utils";

// ---------------------------------------------------------------------------
// Notification Types
// ---------------------------------------------------------------------------

export interface AppNotification {
  id: string;
  type: "mention" | "approval" | "agent_failure" | "task_complete" | "budget_alert" | "comment" | "system";
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  href?: string;
  /** Entity ID for mute-per-entity */
  entityId?: string;
  entityType?: "agent" | "project" | "channel" | "issue";
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const NOTIF_KEY = "ironworks:notifications";
const MUTED_KEY = "ironworks:muted-entities";
const DIGEST_KEY = "ironworks:email-digest";
const PUSH_KEY = "ironworks:push-permission";

export type DigestFrequency = "realtime" | "hourly" | "daily";

function loadNotifications(): AppNotification[] {
  try {
    const raw = localStorage.getItem(NOTIF_KEY);
    if (raw) return JSON.parse(raw) as AppNotification[];
  } catch { /* ignore */ }
  return [];
}

function saveNotifications(notifications: AppNotification[]) {
  try {
    localStorage.setItem(NOTIF_KEY, JSON.stringify(notifications));
  } catch { /* ignore */ }
}

function loadMutedEntities(): Set<string> {
  try {
    const raw = localStorage.getItem(MUTED_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}

function saveMutedEntities(muted: Set<string>) {
  try {
    localStorage.setItem(MUTED_KEY, JSON.stringify([...muted]));
  } catch { /* ignore */ }
}

export function loadDigestFrequency(): DigestFrequency {
  try {
    const raw = localStorage.getItem(DIGEST_KEY);
    if (raw === "realtime" || raw === "hourly" || raw === "daily") return raw;
  } catch { /* ignore */ }
  return "realtime";
}

export function saveDigestFrequency(freq: DigestFrequency) {
  try {
    localStorage.setItem(DIGEST_KEY, freq);
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Push Notifications (mock)
// ---------------------------------------------------------------------------

export async function requestPushPermission(): Promise<"granted" | "denied" | "default"> {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  const result = await Notification.requestPermission();
  try {
    localStorage.setItem(PUSH_KEY, result);
  } catch { /* ignore */ }
  return result;
}

export function sendMockPushNotification(title: string, body: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: "ironworks-notification",
    });
  } catch {
    // ignore - may fail in some contexts
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>(loadNotifications);
  const [mutedEntities, setMutedEntities] = useState<Set<string>>(loadMutedEntities);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read && !mutedEntities.has(n.entityId ?? "")).length,
    [notifications, mutedEntities],
  );

  const addNotification = useCallback((notification: Omit<AppNotification, "id" | "read" | "createdAt">) => {
    const newNotif: AppNotification = {
      ...notification,
      id: crypto.randomUUID(),
      read: false,
      createdAt: new Date().toISOString(),
    };

    // Skip if entity is muted
    if (notification.entityId && mutedEntities.has(notification.entityId)) return;

    setNotifications((prev) => {
      const next = [newNotif, ...prev].slice(0, 200);
      saveNotifications(next);
      return next;
    });

    // Push notification for critical items
    if (notification.type === "agent_failure" || notification.type === "approval") {
      sendMockPushNotification(notification.title, notification.body);
    }
  }, [mutedEntities]);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      saveNotifications(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      saveNotifications(next);
      return next;
    });
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => {
      const next = prev.filter((n) => n.id !== id);
      saveNotifications(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    saveNotifications([]);
  }, []);

  const muteEntity = useCallback((entityId: string) => {
    setMutedEntities((prev) => {
      const next = new Set(prev);
      next.add(entityId);
      saveMutedEntities(next);
      return next;
    });
  }, []);

  const unmuteEntity = useCallback((entityId: string) => {
    setMutedEntities((prev) => {
      const next = new Set(prev);
      next.delete(entityId);
      saveMutedEntities(next);
      return next;
    });
  }, []);

  const isEntityMuted = useCallback(
    (entityId: string) => mutedEntities.has(entityId),
    [mutedEntities],
  );

  return {
    notifications,
    unreadCount,
    addNotification,
    markRead,
    markAllRead,
    removeNotification,
    clearAll,
    muteEntity,
    unmuteEntity,
    isEntityMuted,
  };
}

// ---------------------------------------------------------------------------
// Notification type labels
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  mention: "Mention",
  approval: "Approval",
  agent_failure: "Agent Failure",
  task_complete: "Task Complete",
  budget_alert: "Budget Alert",
  comment: "Comment",
  system: "System",
};

function notifIcon(type: string) {
  switch (type) {
    case "mention":
      return <MessageSquare className="h-4 w-4 text-blue-500" />;
    case "approval":
      return <Check className="h-4 w-4 text-amber-500" />;
    case "agent_failure":
      return <BellOff className="h-4 w-4 text-destructive" />;
    case "task_complete":
      return <CheckCheck className="h-4 w-4 text-green-500" />;
    case "budget_alert":
      return <Bell className="h-4 w-4 text-amber-500" />;
    case "comment":
      return <MessageSquare className="h-4 w-4 text-muted-foreground" />;
    default:
      return <Bell className="h-4 w-4 text-muted-foreground" />;
  }
}

// ---------------------------------------------------------------------------
// Slide-out Panel
// ---------------------------------------------------------------------------

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onMuteEntity?: (entityId: string) => void;
}

export function NotificationCenter({
  open,
  onClose,
  notifications,
  onMarkRead,
  onMarkAllRead,
  onRemove,
  onClearAll,
  onMuteEntity,
}: NotificationCenterProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on escape
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Delay to avoid catching the opening click
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", onClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, onClose]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-[90] bg-black/20" aria-hidden="true" />
      )}

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Notification center"
        aria-modal="true"
        className={cn(
          "fixed top-0 right-0 z-[95] h-full w-full max-w-sm border-l border-border bg-card shadow-xl transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <h2 className="text-sm font-semibold">Notifications</h2>
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={onMarkAllRead} className="h-7 text-xs">
                <CheckCheck className="h-3 w-3 mr-1" />
                Read all
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close notifications">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto h-[calc(100%-7rem)]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Bell className="h-8 w-8 mb-3 opacity-30" />
              <p className="text-sm">No notifications yet</p>
              <p className="text-xs mt-1">You are all caught up</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={cn(
                    "relative px-4 py-3 hover:bg-accent/50 transition-colors group",
                    !notif.read && "bg-primary/[0.03]",
                  )}
                >
                  {!notif.read && (
                    <div className="absolute left-1.5 top-4 h-2 w-2 rounded-full bg-primary" />
                  )}
                  <div className="flex items-start gap-3 ml-2">
                    <div className="mt-0.5 shrink-0">
                      {notifIcon(notif.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      {notif.href ? (
                        <Link
                          to={notif.href}
                          onClick={() => {
                            onMarkRead(notif.id);
                            onClose();
                          }}
                          className="text-sm font-medium hover:underline line-clamp-1"
                        >
                          {notif.title}
                        </Link>
                      ) : (
                        <div className="text-sm font-medium line-clamp-1">{notif.title}</div>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {notif.body}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-muted-foreground">
                          {formatDateTime(notif.createdAt)}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60">
                          {TYPE_LABELS[notif.type] ?? notif.type}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {!notif.read && (
                        <button
                          type="button"
                          onClick={() => onMarkRead(notif.id)}
                          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                          title="Mark as read"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                      )}
                      {notif.entityId && onMuteEntity && (
                        <button
                          type="button"
                          onClick={() => onMuteEntity(notif.entityId!)}
                          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                          title="Mute this entity"
                        >
                          <VolumeX className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onRemove(notif.id)}
                        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                        title="Remove"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 border-t border-border bg-card px-4 py-2 flex items-center justify-between">
            <Link to="/notifications" onClick={onClose} className="text-xs text-primary hover:underline">
              Notification settings
            </Link>
            <Button variant="ghost" size="sm" onClick={onClearAll} className="h-7 text-xs text-muted-foreground">
              <Trash2 className="h-3 w-3 mr-1" />
              Clear all
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Bell Icon Button for header
// ---------------------------------------------------------------------------

interface NotificationBellProps {
  unreadCount: number;
  onClick: () => void;
}

export function NotificationBell({ unreadCount, onClick }: NotificationBellProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
    >
      <Bell className="h-4 w-4" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}
