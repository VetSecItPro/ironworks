import { Copy, MailX, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface MemberRow {
  id: string;
  principalType: "user" | "agent";
  principalId: string;
  membershipRole: string | null;
  status: string;
  userEmail: string | null;
  userName: string | null;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface TeamMembersSectionProps {
  members: MemberRow[];
  invites: PendingInvite[];
  currentUserId: string | null;
  onInvite: () => void;
  onRevokeInvite: (inviteId: string) => void;
  onRemoveMember: (memberId: string) => void;
  isRevoking: boolean;
  isRemoving: boolean;
  publicUrl: string;
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function copyInviteLink(publicUrl: string, _inviteId: string) {
  // Pending invite list endpoint doesn't echo the raw token (security: only
  // returned at creation time). Show users that fact instead of pretending
  // we have the link.
  void navigator.clipboard.writeText(`${publicUrl}/user-invites/<token-not-recoverable>`).catch(() => undefined);
}

export function TeamMembersSection({
  members,
  invites,
  currentUserId,
  onInvite,
  onRevokeInvite,
  onRemoveMember,
  isRevoking,
  isRemoving,
  publicUrl,
}: TeamMembersSectionProps) {
  // Only render user-typed memberships in the Team Members panel —
  // agent-typed live in the Agents Roster section.
  const userMembers = members.filter((m) => m.principalType === "user");
  const livePendingInvites = invites.filter((i) => !i.acceptedAt && !i.revokedAt);

  return (
    <div id="team-members" className="space-y-4 scroll-mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Team Members</h2>
        <Button size="sm" variant="outline" onClick={onInvite}>
          <UserPlus className="h-3.5 w-3.5 mr-1.5" />
          Invite User
        </Button>
      </div>

      <div className="rounded-md border border-border divide-y divide-border">
        {userMembers.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted-foreground">
            No team members yet. Invite users to get started.
          </div>
        ) : (
          userMembers.map((m) => (
            <div key={m.id} className="px-4 py-3 flex items-center gap-3 text-sm">
              <ShieldCheck className="h-4 w-4 text-muted-foreground flex-none" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium truncate">{m.userName || m.userEmail || m.principalId}</span>
                  {m.userName && m.userEmail && (
                    <span className="text-xs text-muted-foreground truncate">{m.userEmail}</span>
                  )}
                </div>
              </div>
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                {ROLE_LABEL[m.membershipRole ?? ""] ?? m.membershipRole ?? "—"}
              </span>
              <span
                className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                  m.status === "active"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                }`}
              >
                {m.status}
              </span>
              {/* Self-remove is blocked server-side; hide the button to avoid
                  surfacing a control that always errors. Owners + instance
                  admins reach this section via canManageMembers gate. */}
              {m.principalId !== currentUserId && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove ${m.userName || m.userEmail || "this member"} from the workspace? They will lose access immediately.`,
                      )
                    ) {
                      onRemoveMember(m.id);
                    }
                  }}
                  disabled={isRemoving}
                  title="Remove from workspace"
                  className="text-destructive hover:text-destructive"
                >
                  <UserMinus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))
        )}
      </div>

      {livePendingInvites.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pending Invites</h3>
          <div className="rounded-md border border-border divide-y divide-border">
            {livePendingInvites.map((inv) => (
              <div key={inv.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{inv.email}</div>
                  <div className="text-xs text-muted-foreground">
                    Expires {formatDate(inv.expiresAt)} · Role: {ROLE_LABEL[inv.role] ?? inv.role}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyInviteLink(publicUrl, inv.id)}
                  title="Invite tokens aren't recoverable from this list — generate a new invite if the link was lost"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRevokeInvite(inv.id)}
                  disabled={isRevoking}
                  title="Revoke invite"
                >
                  <MailX className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
