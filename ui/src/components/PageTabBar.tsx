import type { ReactNode } from "react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSidebar } from "../context/SidebarContext";

export interface PageTabItem {
  value: string;
  label: ReactNode;
}

interface PageTabBarProps {
  items: PageTabItem[];
  value?: string;
  onValueChange?: (value: string) => void;
  align?: "center" | "start";
  /** Action buttons or filter pills rendered inline on the right side of the tab bar */
  actions?: ReactNode;
}

export function PageTabBar({ items, value, onValueChange, align = "center", actions }: PageTabBarProps) {
  const { isMobile } = useSidebar();

  if (isMobile && value !== undefined && onValueChange) {
    return (
      <div className="flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-2 py-1 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {items.map((item) => (
            <option key={item.value} value={item.value}>
              {typeof item.label === "string" ? item.label : item.value}
            </option>
          ))}
        </select>
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
    );
  }

  return (
    <div className="flex items-center border-b border-border">
      <TabsList variant="line" className={align === "start" ? "justify-start" : undefined}>
        {items.map((item) => (
          <TabsTrigger key={item.value} value={item.value}>
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {actions && <div className="ml-auto flex items-center gap-2 pr-2">{actions}</div>}
    </div>
  );
}
