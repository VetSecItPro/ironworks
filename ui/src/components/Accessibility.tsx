import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// ARIA Live Region for screen reader announcements
// ---------------------------------------------------------------------------

let announceTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Announce a message to screen readers via an ARIA live region.
 * The region is automatically created if it doesn't exist.
 */
export function announce(message: string, priority: "polite" | "assertive" = "polite") {
  let region = document.getElementById(`ironworks-live-region-${priority}`);
  if (!region) {
    region = document.createElement("div");
    region.id = `ironworks-live-region-${priority}`;
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", priority);
    region.setAttribute("aria-atomic", "true");
    region.className = "sr-only";
    document.body.appendChild(region);
  }
  // Clear and re-announce to ensure screen readers pick up the change
  region.textContent = "";
  if (announceTimeout) clearTimeout(announceTimeout);
  announceTimeout = setTimeout(() => {
    region!.textContent = message;
  }, 50);
}

// ---------------------------------------------------------------------------
// ARIA Live Region Component
// ---------------------------------------------------------------------------

interface LiveRegionProps {
  message: string;
  priority?: "polite" | "assertive";
}

export function LiveRegion({ message, priority = "polite" }: LiveRegionProps) {
  return (
    <div role="status" aria-live={priority} aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen Reader Only (enhanced sr-only with dynamic content)
// ---------------------------------------------------------------------------

interface ScreenReaderOnlyProps {
  children: ReactNode;
}

export function ScreenReaderOnly({ children }: ScreenReaderOnlyProps) {
  return <span className="sr-only">{children}</span>;
}

// ---------------------------------------------------------------------------
// Color-blind safe palette for charts
// ---------------------------------------------------------------------------

/**
 * Color-blind safe palette (designed for deuteranopia, protanopia, tritanopia).
 * Uses the Wong color palette which is optimized for color vision deficiency.
 */
export const COLOR_BLIND_SAFE_PALETTE = {
  blue: "#0072B2",
  orange: "#E69F00",
  green: "#009E73",
  yellow: "#F0E442",
  skyBlue: "#56B4E9",
  vermillion: "#D55E00",
  purple: "#CC79A7",
  black: "#000000",
} as const;

/** Ordered array for chart series */
export const CHART_COLORS = [
  COLOR_BLIND_SAFE_PALETTE.blue,
  COLOR_BLIND_SAFE_PALETTE.orange,
  COLOR_BLIND_SAFE_PALETTE.green,
  COLOR_BLIND_SAFE_PALETTE.vermillion,
  COLOR_BLIND_SAFE_PALETTE.skyBlue,
  COLOR_BLIND_SAFE_PALETTE.yellow,
  COLOR_BLIND_SAFE_PALETTE.purple,
];

/**
 * Status colors that are distinguishable by color-blind users.
 * Each status also uses a distinct shape/icon for additional differentiation.
 */
export const STATUS_COLORS_ACCESSIBLE = {
  in_progress: { bg: "#0072B2", text: "#ffffff", label: "In Progress" },
  todo: { bg: "#56B4E9", text: "#000000", label: "To Do" },
  done: { bg: "#009E73", text: "#ffffff", label: "Done" },
  blocked: { bg: "#D55E00", text: "#ffffff", label: "Blocked" },
  cancelled: { bg: "#CC79A7", text: "#ffffff", label: "Cancelled" },
  backlog: { bg: "#E69F00", text: "#000000", label: "Backlog" },
  in_review: { bg: "#F0E442", text: "#000000", label: "In Review" },
} as const;

// ---------------------------------------------------------------------------
// Minimum Touch Target wrapper
// ---------------------------------------------------------------------------

interface TouchTargetProps {
  children: ReactNode;
  className?: string;
  as?: "button" | "a" | "div";
  [key: string]: unknown;
}

/**
 * Ensures a minimum 44x44px touch target as per WCAG 2.5.5.
 * Wraps the child in an element with minimum dimensions.
 */
export function TouchTarget({ children, className = "", as: Tag = "div", ...props }: TouchTargetProps) {
  return (
    <Tag
      className={`min-h-[44px] min-w-[44px] flex items-center justify-center ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// Skip Navigation Link
// ---------------------------------------------------------------------------

export function SkipNavLink({ targetId = "main-content" }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      Skip to Main Content
    </a>
  );
}

// ---------------------------------------------------------------------------
// Focus Trap for modals
// ---------------------------------------------------------------------------

export function useFocusTrap(active: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !containerRef.current) return;

    const container = containerRef.current;
    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;

      const focusable = container.querySelectorAll(focusableSelector);
      if (focusable.length === 0) return;

      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    container.addEventListener("keydown", handleKeyDown);
    return () => container.removeEventListener("keydown", handleKeyDown);
  }, [active]);

  return containerRef;
}

// ---------------------------------------------------------------------------
// Announce on route change
// ---------------------------------------------------------------------------

export function useRouteAnnouncer(pageTitle: string) {
  useEffect(() => {
    if (pageTitle) {
      announce(`Navigated to ${pageTitle}`, "polite");
    }
  }, [pageTitle]);
}
