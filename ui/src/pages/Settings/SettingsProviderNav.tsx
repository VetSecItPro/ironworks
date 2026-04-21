/**
 * Tab navigation shared by Settings > Providers, Playground, and Explorer.
 * Adding a new Settings sub-page: append an entry to TABS and add the
 * corresponding route in App.tsx.
 */

import { cn } from "@/lib/utils";
import { useLocation, useParams } from "@/lib/router";

interface NavTab {
  label: string;
  suffix: string;
}

const TABS: NavTab[] = [
  { label: "Providers", suffix: "providers" },
  { label: "Playground", suffix: "playground" },
  { label: "Explorer", suffix: "explorer" },
];

export function SettingsProviderNav() {
  const location = useLocation();
  const { companyPrefix } = useParams<{ companyPrefix?: string }>();
  const basePath = companyPrefix ? `/${companyPrefix}/settings` : "/settings";

  return (
    <nav className="flex gap-1 border-b border-border mb-6" aria-label="Settings tabs">
      {TABS.map((tab) => {
        const href = `${basePath}/${tab.suffix}`;
        const isActive = location.pathname.endsWith(`/settings/${tab.suffix}`);
        return (
          <a
            key={tab.suffix}
            href={href}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            {tab.label}
          </a>
        );
      })}
    </nav>
  );
}
