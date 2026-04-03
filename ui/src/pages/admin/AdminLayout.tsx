import { Navigate, NavLink, Outlet, useLocation } from "@/lib/router";
import { useMeAccess } from "@/hooks/useMeAccess";
import { useTheme } from "@/context/ThemeContext";
import {
  Activity,
  ArrowLeft,
  Building2,
  LayoutDashboard,
  Moon,
  ScrollText,
  Server,
  Sun,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/manage", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/manage/companies", label: "Companies", icon: Building2 },
  { to: "/manage/users", label: "Users", icon: Users },
  { to: "/manage/monitoring", label: "Monitoring", icon: Server },
  { to: "/manage/audit", label: "Audit Log", icon: ScrollText },
];

export default function AdminLayout() {
  const { isInstanceAdmin, isLoading } = useMeAccess();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!isInstanceAdmin) {
    return <Navigate to="/" replace />;
  }

  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      {/* Top bar */}
      <header className="h-12 shrink-0 border-b border-border bg-background/95 backdrop-blur flex items-center gap-3 px-4 sticky top-0 z-30">
        <NavLink
          to="/"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mr-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to app
        </NavLink>
        <span className="text-border">|</span>
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold text-foreground">IronWorks Admin</span>
        </div>

        {/* Tab nav — hidden on small screens (use bottom bar below) */}
        <nav className="hidden md:flex items-center gap-0.5 ml-4 flex-1">
          {NAV_ITEMS.map((item) => {
            const isActive = item.end
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  isActive
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
              >
                <item.icon className="h-3.5 w-3.5 shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={toggleTheme}
            aria-label={`Switch to ${nextTheme} mode`}
            title={`Switch to ${nextTheme} mode`}
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 p-4 md:p-6 max-w-[1400px] w-full mx-auto">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-background/95 backdrop-blur flex items-center justify-around px-2 py-1 pb-[env(safe-area-inset-bottom)]">
        {NAV_ITEMS.map((item) => {
          const isActive = item.end
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-md text-[10px] transition-colors",
                isActive ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
