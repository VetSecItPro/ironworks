import { Link } from "@/lib/router";
import { Megaphone } from "lucide-react";

interface Announcement {
  id: string;
  title: string;
  createdAt: string;
  createdByUserId?: string | null;
  createdByAgentId?: string | null;
}

export function AnnouncementsSection({ announcements }: { announcements: Announcement[] }) {
  if (announcements.length === 0) return null;

  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-400 flex items-center gap-2">
          <Megaphone className="h-3.5 w-3.5" />
          Announcements
        </h4>
        <Link to="/knowledge" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          See all
        </Link>
      </div>
      <div className="space-y-1.5">
        {announcements.slice(0, 3).map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-blue-500/15 bg-blue-500/[0.04] px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{a.title}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(a.createdAt).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" })}
                {a.createdByUserId ? " - Board" : a.createdByAgentId ? " - Agent" : ""}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
