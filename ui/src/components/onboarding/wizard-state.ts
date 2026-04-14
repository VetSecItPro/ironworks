import type { WizardPersistedState } from "./types";
import { WIZARD_STORAGE_KEY } from "./constants";

export function loadWizardState(): WizardPersistedState | null {
  try {
    const raw = localStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveWizardState(state: WizardPersistedState): void {
  try {
    localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Silently ignore
  }
}

export function clearWizardState(): void {
  try {
    localStorage.removeItem(WIZARD_STORAGE_KEY);
  } catch {
    // Silently ignore
  }
}
