import type { Agent } from "@ironworksai/shared";

interface IssueLiveRunBannerProps {
  activeAgentName?: string | null;
}

export function IssueLiveRunBanner({ activeAgentName }: IssueLiveRunBannerProps) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-2.5 text-sm">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500" />
      </span>
      <span className="text-cyan-700 dark:text-cyan-300 font-medium">
        {activeAgentName ?? "An agent"} is actively working on this issue
      </span>
    </div>
  );
}
