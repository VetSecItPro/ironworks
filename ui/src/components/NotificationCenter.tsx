// Re-export from decomposed modules for backward compatibility
export { NotificationCenter } from "./notifications/NotificationCenter";
export { NotificationBell } from "./notifications/NotificationBell";
export { useNotifications } from "./notifications/useNotifications";
export type { AppNotification, DigestFrequency } from "./notifications/notification-types";
export {
  loadDigestFrequency,
  saveDigestFrequency,
  requestPushPermission,
  sendMockPushNotification,
} from "./notifications/notification-storage";
