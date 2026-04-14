import type { AppNotification, DigestFrequency } from "./notification-types";

const NOTIF_KEY = "ironworks:notifications";
const MUTED_KEY = "ironworks:muted-entities";
const DIGEST_KEY = "ironworks:email-digest";
const PUSH_KEY = "ironworks:push-permission";

export function loadNotifications(): AppNotification[] {
  try {
    const raw = localStorage.getItem(NOTIF_KEY);
    if (raw) return JSON.parse(raw) as AppNotification[];
  } catch { /* ignore */ }
  return [];
}

export function saveNotifications(notifications: AppNotification[]) {
  try {
    localStorage.setItem(NOTIF_KEY, JSON.stringify(notifications));
  } catch { /* ignore */ }
}

export function loadMutedEntities(): Set<string> {
  try {
    const raw = localStorage.getItem(MUTED_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}

export function saveMutedEntities(muted: Set<string>) {
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
    new Notification(title, { body, icon: "/favicon.ico", tag: "ironworks-notification" });
  } catch { /* ignore */ }
}
