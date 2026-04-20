import { Brain } from "lucide-react";
import type { AgentExpertise } from "../../api/channels";

interface ExpertiseMapSectionProps {
  expertiseMap: AgentExpertise[];
}

export function ExpertiseMapSection({ expertiseMap }: ExpertiseMapSectionProps) {
  return (
    <div className="rounded-xl border border-border p-5 space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <Brain className="h-3.5 w-3.5" />
        Expertise Map
      </h3>
      <p className="text-[12px] text-muted-foreground">
        Agent topic strengths derived from channel message analysis. Higher scores indicate more decisions and
        discussion on that topic.
      </p>
      <div className="space-y-3">
        {expertiseMap.slice(0, 8).map((agent) => (
          <div key={agent.agentId} className="space-y-1.5">
            <div className="text-[13px] font-medium text-foreground">{agent.agentName}</div>
            <div className="flex flex-wrap gap-1.5">
              {agent.topics.slice(0, 5).map((t) => (
                <span
                  key={t.topic}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-border bg-muted/30 text-muted-foreground"
                  title={`${t.messageCount} messages, ${t.decisionCount} decisions`}
                >
                  <span className="capitalize">{t.topic}</span>
                  <span className="text-muted-foreground/80">{t.messageCount + t.decisionCount * 2}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
