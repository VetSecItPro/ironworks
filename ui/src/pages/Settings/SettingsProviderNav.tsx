/**
 * Shared sub-navigation for the Settings > Providers and Settings > Playground pages.
 *
 * Rendered at the top of both pages so users can switch between API key management
 * and the interactive playground without leaving the settings context.
 *
 * Uses useLocation() to determine the active tab so the highlighted state stays
 * correct on a hard reload or external link.
 */

import { useLocation, useParams } from "@/lib/router";

interface NavTab {
  label: string;
  suffix: string;
}

const TABS: NavTab[] = [
  { label: "Providers", suffix: "providers" },
  { label: "Playground", suffix: "playground" },
];

export function SettingsProviderNav() {
  const location = useLocation();
  const { companyPrefix } = useParams<{ companyPrefix?: string }>();

  const basePath = companyPrefix ? `/${companyPrefix}/settings` : "/settings";

  return (
    <nav className="flex gap-1 border-b pb-0 mb-0" aria-label="Provider settings navigation">
      {TABS.map((tab) => {
        const href = `${basePath}/${tab.suffix}`;
        const isActive = location.pathname.endsWith(`/settings/${tab.suffix}`);

        return (
          <a
            key={tab.suffix}
            href={href}
            className={[
              "px-3 py-2 text-sm font-medium rounded-t-md -mb-px border-b-2 transition-colors",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted",
            ].join(" ")}
            aria-current={isActive ? "page" : undefined}
          >
            {tab.label}
          </a>
        );
      })}
    </nav>
  );
}
