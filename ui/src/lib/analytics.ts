/**
 * Client-side analytics - no external services.
 * In development: logs page views to console.
 * Feature usage is tracked in localStorage for internal metrics.
 */

const STORAGE_KEY = "ironworks_feature_usage";
const isDev = typeof window !== "undefined" && window.location.hostname === "localhost";

export function trackPageView(page: string): void {
  if (isDev) {
    console.debug(`[analytics] pageview: ${page}`);
  }
}

export function trackFeatureUsed(feature: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const counts: Record<string, number> = raw ? JSON.parse(raw) : {};
    counts[feature] = (counts[feature] ?? 0) + 1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
  } catch {
    // localStorage may be unavailable - silently ignore
  }
  if (isDev) {
    console.debug(`[analytics] feature: ${feature}`);
  }
}

export function getFeatureUsageStats(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
