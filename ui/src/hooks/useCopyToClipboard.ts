import { useCallback } from "react";
import { useToast } from "../context/ToastContext";
import { copyToClipboard } from "../lib/clipboard";

/**
 * Returns a function that copies text to the clipboard and shows
 * a "Copied to clipboard" success toast on success.
 */
export function useCopyToClipboard() {
  const { pushToast } = useToast();

  const copy = useCallback(
    async (text: string, label?: string) => {
      const ok = await copyToClipboard(text);
      if (ok) {
        pushToast({
          title: "Copied to clipboard",
          body: label ? `${label} copied.` : undefined,
          tone: "success",
          ttlMs: 2000,
          dedupeKey: "clipboard-copy",
        });
      } else {
        pushToast({
          title: "Copy failed",
          body: "Could not access the clipboard.",
          tone: "error",
          ttlMs: 3000,
        });
      }
      return ok;
    },
    [pushToast],
  );

  return copy;
}
