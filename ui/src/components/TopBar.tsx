import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LogOut, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { authApi } from "../api/auth";
import { Button } from "./ui/button";

/**
 * Global top-right user pill: avatar + display name + sign-out menu.
 *
 * Renders the authenticated user's identity persistently across every page
 * so sign-out and identity confirmation are always one click away. Uses the
 * existing Better Auth /api/auth/get-session for identity and /sign-out for
 * the action — no new backend surface.
 *
 * Avatar: pulls from user.image (Better Auth's column). When unset, renders
 * initials. Avatar upload itself lives in Profile Settings; this component
 * is read-only display.
 */
export function TopBar() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const sessionQuery = useQuery({
    queryKey: ["auth", "session"],
    queryFn: () => authApi.getSession(),
    staleTime: 60_000,
  });

  const signOutMutation = useMutation({
    mutationFn: () => authApi.signOut(),
    onSuccess: () => {
      queryClient.clear();
      window.location.href = "/login";
    },
  });

  // Close menu on outside click.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const user = sessionQuery.data?.user ?? null;
  const displayName = (user?.name ?? "").trim() || (user?.email ?? "").split("@")[0] || "User";
  const initial = displayName.slice(0, 1).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="flex items-center gap-2 h-8 pl-1 pr-2"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {user?.image ? (
          <img
            src={user.image}
            alt=""
            className="h-6 w-6 rounded-full object-cover"
            onError={(e) => {
              // If the configured image URL fails (404, CORS, etc.), fall
              // back gracefully to initials by hiding the broken element.
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-medium">
            {initial}
          </span>
        )}
        <span className="text-xs font-medium truncate max-w-[140px]">{displayName}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-56 rounded-md border border-border bg-popover shadow-md py-1 z-50"
        >
          <div className="px-3 py-2 border-b border-border/60">
            <div className="text-xs font-medium truncate">{displayName}</div>
            {user?.email && <div className="text-[10px] text-muted-foreground truncate">{user.email}</div>}
          </div>
          <a
            href="/profile"
            role="menuitem"
            className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent"
            onClick={() => setOpen(false)}
          >
            <User className="h-3.5 w-3.5" />
            Profile
          </a>
          <button
            type="button"
            role="menuitem"
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent text-destructive"
            onClick={() => signOutMutation.mutate()}
            disabled={signOutMutation.isPending}
          >
            <LogOut className="h-3.5 w-3.5" />
            {signOutMutation.isPending ? "Signing out..." : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
