// Re-export from decomposed modules for backward compatibility

export { NotificationBell } from "./notifications/NotificationBell";
export { NotificationCenter } from "./notifications/NotificationCenter";
export {
  loadDigestFrequency,
  requestPushPermission,
  saveDigestFrequency,
  sendMockPushNotification,
} from "./notifications/notification-storage";
export type { AppNotification, DigestFrequency } from "./notifications/notification-types";
export { useNotifications } from "./notifications/useNotifications";
