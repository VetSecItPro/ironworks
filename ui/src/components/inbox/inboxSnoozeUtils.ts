// Snooze helpers (localStorage)

export const SNOOZE_STORAGE_KEY = "ironworks:inbox-snoozed";

export interface SnoozeEntry {
  until: number; // ms epoch
}

export function loadSnoozed(): Record<string, SnoozeEntry> {
  try {
    const raw = localStorage.getItem(SNOOZE_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, SnoozeEntry>;
  } catch {
    /* ignore */
  }
  return {};
}

export function saveSnoozed(data: Record<string, SnoozeEntry>) {
  try {
    localStorage.setItem(SNOOZE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function isSnoozed(snoozedMap: Record<string, SnoozeEntry>, key: string): boolean {
  const entry = snoozedMap[key];
  if (!entry) return false;
  return Date.now() < entry.until;
}

export function snoozeItem(key: string, durationMs: number) {
  const data = loadSnoozed();
  data[key] = { until: Date.now() + durationMs };
  saveSnoozed(data);
}

export const SNOOZE_OPTIONS = [
  { label: "1 hour", ms: 60 * 60 * 1000 },
  { label: "4 hours", ms: 4 * 60 * 60 * 1000 },
  { label: "Tomorrow", ms: 24 * 60 * 60 * 1000 },
  { label: "Next week", ms: 7 * 24 * 60 * 60 * 1000 },
];
