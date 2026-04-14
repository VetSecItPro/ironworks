import type { KnowledgePage } from "../../api/knowledge";
import { MarkdownBody } from "../MarkdownBody";
import { BookOpen, Link as LinkIcon } from "lucide-react";
import { WikiLinkedBody } from "./WikiLinkedBody";
import { IssueReferenceChips } from "./IssueReferenceChips";
import { AutoTableOfContents } from "./AutoTableOfContents";
import { PageAnalytics } from "./PageAnalytics";

export function KBPageContent({
  selectedPage,
  pages,
  suggestedPages,
  onNavigateToSlug,
  onSelectPage,
}: {
  selectedPage: KnowledgePage;
  pages: KnowledgePage[];
  suggestedPages: KnowledgePage[];
  onNavigateToSlug: (slug: string) => void;
  onSelectPage: (id: string) => void;
}) {
  return (
    <div className="p-4 space-y-6">
      {/* Wiki cross-links */}
      <WikiLinkedBody
        body={selectedPage.body}
        pages={pages}
        onNavigate={onNavigateToSlug}
      />
      {/* Issue reference chips */}
      <IssueReferenceChips body={selectedPage.body} companyPrefix={selectedPage.companyId} />
      {/* Auto table of contents */}
      <AutoTableOfContents body={selectedPage.body} />
      <MarkdownBody>{selectedPage.body}</MarkdownBody>

      {/* Suggested pages */}
      {suggestedPages.length > 0 && (
        <div className="border-t border-border pt-4 mt-6">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <LinkIcon className="h-3 w-3" />Suggested Pages
          </h4>
          <div className="flex flex-wrap gap-2">
            {suggestedPages.map((sp) => (
              <button
                key={sp.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent/50 transition-colors"
                onClick={() => onSelectPage(sp.id)}
              >
                <BookOpen className="h-3 w-3 text-muted-foreground" />
                {sp.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Page Analytics */}
      <PageAnalytics page={selectedPage} />
    </div>
  );
}
