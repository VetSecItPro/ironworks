import { useMutation, useQuery } from "@tanstack/react-query";
import { MailWarning } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authApi } from "../api/auth";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";

/**
 * Banner shown to session-backed users whose email has not yet been
 * verified. The /api/companies and /api/companies/onboard routes return 403
 * with `code: email_verification_required` for these users, so we surface a
 * single, persistent prompt to resend the verification mail. Existing
 * legacy users default to `emailVerified: true` on the client, so this
 * banner does not regress the historical UX.
 */
export function EmailVerificationBanner() {
  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });
  const { pushToast } = useToast();
  const [cooldown, setCooldown] = useState(false);

  const resend = useMutation({
    mutationFn: async () => {
      const email = sessionQuery.data?.user.email;
      if (!email) throw new Error("No email on session");
      await authApi.resendVerification(email);
    },
    onSuccess: () => {
      pushToast({ title: "Verification email sent. Check your inbox." });
      // Throttle the button for 30s so an impatient user doesn't blow
      // through the 3/hour server-side limit on accident.
      setCooldown(true);
      setTimeout(() => setCooldown(false), 30_000);
    },
    onError: (err) => {
      const detail = err instanceof Error ? err.message : "Try again in a moment.";
      pushToast({ title: `Could not resend verification email: ${detail}` });
    },
  });

  const user = sessionQuery.data?.user;
  if (!user || user.emailVerified) return null;

  return (
    <div className="rounded-lg border-2 border-dashed border-amber-500/50 bg-amber-500/5 p-4">
      <div className="flex items-start gap-3">
        <MailWarning className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1">
          <h3 className="text-sm font-medium">Verify your email to finish setup</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            We sent a verification link to <span className="font-mono">{user.email ?? "your inbox"}</span>. You need to
            click that link before you can create a company.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={resend.isPending || cooldown || !user.email}
              onClick={() => resend.mutate()}
            >
              {resend.isPending ? "Sending..." : cooldown ? "Sent — check inbox" : "Resend verification email"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
