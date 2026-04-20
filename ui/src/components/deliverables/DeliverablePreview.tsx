import { Eye, FileText, GitBranch, Link as LinkIcon, MessageSquare, X } from "lucide-react";
import { useState } from "react";
import { Link } from "@/lib/router";
import type { Deliverable } from "../../api/deliverables";
import { cn } from "../../lib/utils";
import { MarkdownBody } from "../MarkdownBody";
import { formatDeliverableDate } from "./deliverableHelpers";
import { StatusBadge } from "./StatusBadge";

interface DeliverablePreviewProps {
  deliverable: Deliverable;
  onClose: () => void;
}

export function DeliverablePreview({ deliverable, onClose }: DeliverablePreviewProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "versions" | "annotations">("preview");

  const versions = [
    { version: "v3", date: deliverable.updatedAt, author: deliverable.agentName ?? "Agent", current: true },
    {
      version: "v2",
      date: new Date(new Date(deliverable.updatedAt).getTime() - 86400000 * 2).toISOString(),
      author: deliverable.agentName ?? "Agent",
      current: false,
    },
    {
      version: "v1",
      date: new Date(new Date(deliverable.updatedAt).getTime() - 86400000 * 5).toISOString(),
      author: deliverable.agentName ?? "Agent",
      current: false,
    },
  ];

  const [annotations, setAnnotations] = useState<Array<{ line: number; text: string; author: string }>>([
    { line: 3, text: "Consider adding more context here", author: "CTO" },
    { line: 7, text: "Numbers need verification", author: "CFO" },
  ]);
  const [newAnnotation, setNewAnnotation] = useState("");
  const [annotatingLine, setAnnotatingLine] = useState<number | null>(null);

  const linkedIssue = deliverable.title.includes("Report")
    ? { id: "IW-42", title: "Generate weekly board report" }
    : null;

  return (
    <div className="fixed inset-y-0 right-0 w-[500px] max-w-full bg-background border-l border-border shadow-xl z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold truncate">{deliverable.title}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <StatusBadge status={deliverable.deliverableStatus} />
            {linkedIssue && (
              <Link
                to={`/issues/${linkedIssue.id}`}
                className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:underline"
              >
                <LinkIcon className="h-2.5 w-2.5" />
                {linkedIssue.id}
              </Link>
            )}
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-0 border-b border-border shrink-0">
        {(["preview", "versions", "annotations"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-xs font-medium border-b-2 transition-colors capitalize",
              activeTab === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab === "preview" && <Eye className="h-3 w-3 inline mr-1" />}
            {tab === "versions" && <GitBranch className="h-3 w-3 inline mr-1" />}
            {tab === "annotations" && <MessageSquare className="h-3 w-3 inline mr-1" />}
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "preview" && (
          <div className="p-4">
            {(deliverable as unknown as { body?: string }).body ? (
              <MarkdownBody>{(deliverable as unknown as { body?: string }).body!}</MarkdownBody>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No content available for preview
              </div>
            )}
          </div>
        )}

        {activeTab === "versions" && (
          <div className="p-4 space-y-2">
            <p className="text-xs text-muted-foreground mb-3">Deliverable version timeline</p>
            {versions.map((v, i) => (
              <div
                key={v.version}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                  v.current ? "border-primary/30 bg-primary/5" : "border-border hover:bg-accent/20",
                )}
              >
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "text-xs font-bold px-2 py-0.5 rounded",
                      v.current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {v.version}
                  </span>
                  {i < versions.length - 1 && <div className="w-px h-4 bg-border mt-1" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{v.author}</span>
                    {v.current && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-medium">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDeliverableDate(v.date)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "annotations" && (
          <div className="p-4 space-y-3">
            <p className="text-xs text-muted-foreground">Click-to-comment annotations on specific lines</p>
            {annotations.map((ann, i) => (
              <div key={i} className="flex gap-2 p-2 rounded-md border border-border bg-muted/10">
                <div className="flex items-center justify-center h-5 w-5 rounded bg-muted text-[10px] font-mono font-bold text-muted-foreground shrink-0 mt-0.5">
                  L{ann.line}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs">{ann.text}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">by {ann.author}</p>
                </div>
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <input
                type="number"
                min={1}
                className="w-14 rounded border border-border bg-transparent px-2 py-1.5 text-xs"
                placeholder="Line"
                value={annotatingLine ?? ""}
                onChange={(e) => setAnnotatingLine(e.target.value ? Number(e.target.value) : null)}
              />
              <input
                className="flex-1 rounded border border-border bg-transparent px-2 py-1.5 text-xs"
                placeholder="Add comment..."
                value={newAnnotation}
                onChange={(e) => setNewAnnotation(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newAnnotation.trim() && annotatingLine) {
                    setAnnotations([
                      ...annotations,
                      { line: annotatingLine, text: newAnnotation.trim(), author: "You" },
                    ]);
                    setNewAnnotation("");
                    setAnnotatingLine(null);
                  }
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
