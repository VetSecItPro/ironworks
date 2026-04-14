import { useCallback, useMemo, useState } from "react";
import type { AppNotification } from "./notification-types";
import {
  loadNotifications,
  saveNotifications,
  loadMutedEntities,
  saveMutedEntities,
  sendMockPushNotification,
} from "./notification-storage";

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

    if (notification.entityId && mutedEntities.has(notification.entityId)) return;

    setNotifications((prev) => {
      const next = [newNotif, ...prev].slice(0, 200);
      saveNotifications(next);
      return next;
    });

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
