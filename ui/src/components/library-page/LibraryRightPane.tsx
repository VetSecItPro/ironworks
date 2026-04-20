import { BookOpen, Bot, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { KnowledgePage } from "../../api/knowledge";
import { cn } from "../../lib/utils";
import { FileViewer } from "../library/FileViewer";
import { KnowledgePageViewer } from "../library/KnowledgePageViewer";

interface LibraryRightPaneProps {
  companyId: string;
  selectedAgentId: string | null;
  selectedPageId: string | null;
  selectedFile: string | null;
  onEdit: (page: KnowledgePage) => void;
  onScan: () => void;
  isScanPending: boolean;
}

export function LibraryRightPane({
  companyId,
  selectedAgentId,
  selectedPageId,
  selectedFile,
  onEdit,
  onScan,
  isScanPending,
}: LibraryRightPaneProps) {
  if (selectedAgentId !== null && selectedPageId) {
    return <KnowledgePageViewer companyId={companyId} pageId={selectedPageId} onEdit={onEdit} />;
  }

  if (selectedAgentId !== null) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <Bot className="h-12 w-12 text-muted-foreground/20 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">Select a document to view</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
          Browse the workspace documents on the left to view reports and records created by this agent.
        </p>
      </div>
    );
  }

  if (selectedFile) {
    return <FileViewer companyId={companyId} filePath={selectedFile} />;
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <BookOpen className="h-12 w-12 text-muted-foreground/20 mb-3" />
      <p className="text-sm font-medium text-muted-foreground">Select a file to view</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
        Browse the file tree on the left to view documents, reports, and files created by your agents.
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onScan} disabled={isScanPending}>
        <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isScanPending && "animate-spin")} />
        Scan Library
      </Button>
    </div>
  );
}
