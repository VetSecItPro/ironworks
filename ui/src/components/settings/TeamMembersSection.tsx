import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";

interface TeamMembersSectionProps {
  members: unknown[];
  onInvite: () => void;
}

export function TeamMembersSection({
  members,
  onInvite,
}: TeamMembersSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Team Members
        </h2>
        <Button size="sm" variant="outline" onClick={onInvite}>
          <UserPlus className="h-3.5 w-3.5 mr-1.5" />
          Invite User
        </Button>
      </div>
      <div className="rounded-md border border-border divide-y divide-border">
        {members.length === 0 && (
          <div className="px-4 py-3 text-xs text-muted-foreground">
            No team members yet. Invite users to get started.
          </div>
        )}
      </div>
    </div>
  );
}
