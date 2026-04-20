import { Bell, BellOff, Check, CheckCheck, MessageSquare, Trash2, VolumeX, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router";
import { cn, formatDateTime } from "../../lib/utils";
import type { AppNotification } from "./notification-types";

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

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
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
      {open && <div className="fixed inset-0 z-[90] bg-black/20" aria-hidden="true" />}
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
                  {!notif.read && <div className="absolute left-1.5 top-4 h-2 w-2 rounded-full bg-primary" />}
                  <div className="flex items-start gap-3 ml-2">
                    <div className="mt-0.5 shrink-0">{notifIcon(notif.type)}</div>
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
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.body}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-muted-foreground">{formatDateTime(notif.createdAt)}</span>
                        <span className="text-[10px] text-muted-foreground/80">
                          {TYPE_LABELS[notif.type] ?? notif.type}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                      {!notif.read && (
                        <button
                          type="button"
                          onClick={() => onMarkRead(notif.id)}
                          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                          aria-label="Mark as read"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                      )}
                      {notif.entityId && onMuteEntity && (
                        <button
                          type="button"
                          onClick={() => onMuteEntity(notif.entityId!)}
                          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                          aria-label="Mute this entity"
                        >
                          <VolumeX className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onRemove(notif.id)}
                        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                        aria-label="Remove notification"
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
