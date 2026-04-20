import type { CompanyPortabilityFileEntry } from "@ironworksai/shared";
import { Package } from "lucide-react";
import { getPortableFileDataUrl, getPortableFileText, isPortableImageFile } from "../../lib/portable-files";
import { cn } from "../../lib/utils";
import { EmptyState } from "../EmptyState";
import { MarkdownBody } from "../MarkdownBody";
import { FRONTMATTER_FIELD_LABELS, type FrontmatterData, parseFrontmatter } from "../PackageFileTree";

function FrontmatterCard({ data, onSkillClick }: { data: FrontmatterData; onSkillClick?: (skill: string) => void }) {
  return (
    <div className="rounded-md border border-border bg-accent/20 px-4 py-3 mb-4">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-muted-foreground whitespace-nowrap py-0.5">{FRONTMATTER_FIELD_LABELS[key] ?? key}</dt>
            <dd className="py-0.5">
              {Array.isArray(value) ? (
                <div className="flex flex-wrap gap-1.5">
                  {value.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={cn(
                        "inline-flex items-center rounded-md border border-border bg-background px-2 py-0.5 text-xs",
                        key === "skills" &&
                          onSkillClick &&
                          "cursor-pointer hover:bg-accent/50 hover:border-foreground/30 transition-colors",
                      )}
                      onClick={() => key === "skills" && onSkillClick?.(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              ) : (
                <span>{value}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ExportPreviewPane({
  selectedFile,
  content,
  allFiles,
  onSkillClick,
}: {
  selectedFile: string | null;
  content: CompanyPortabilityFileEntry | null;
  allFiles: Record<string, CompanyPortabilityFileEntry>;
  onSkillClick?: (skill: string) => void;
}) {
  if (!selectedFile || content === null) {
    return <EmptyState icon={Package} message="Select a file to preview its contents." />;
  }

  const textContent = getPortableFileText(content);
  const isMarkdown = selectedFile.endsWith(".md") && textContent !== null;
  const parsed = isMarkdown && textContent ? parseFrontmatter(textContent) : null;
  const imageSrc = isPortableImageFile(selectedFile, content) ? getPortableFileDataUrl(selectedFile, content) : null;

  const resolveImageSrc = isMarkdown
    ? (src: string) => {
        if (/^(?:https?:|data:)/i.test(src)) return null;
        const dir = selectedFile.includes("/") ? selectedFile.slice(0, selectedFile.lastIndexOf("/") + 1) : "";
        const resolved = dir + src;
        const entry = allFiles[resolved] ?? allFiles[src];
        if (!entry) return null;
        return getPortableFileDataUrl(resolved in allFiles ? resolved : src, entry);
      }
    : undefined;

  return (
    <div className="min-w-0">
      <div className="border-b border-border px-5 py-3">
        <div className="truncate font-mono text-sm">{selectedFile}</div>
      </div>
      <div className="min-h-[560px] px-5 py-5">
        {parsed ? (
          <>
            <FrontmatterCard data={parsed.data} onSkillClick={onSkillClick} />
            {parsed.body.trim() && <MarkdownBody resolveImageSrc={resolveImageSrc}>{parsed.body}</MarkdownBody>}
          </>
        ) : isMarkdown ? (
          <MarkdownBody resolveImageSrc={resolveImageSrc}>{textContent ?? ""}</MarkdownBody>
        ) : imageSrc ? (
          <div className="flex min-h-[520px] items-center justify-center rounded-lg border border-border bg-accent/10 p-6">
            <img src={imageSrc} alt={selectedFile} className="max-h-[480px] max-w-full object-contain" />
          </div>
        ) : textContent !== null ? (
          <pre className="overflow-x-auto whitespace-pre-wrap break-words border-0 bg-transparent p-0 font-mono text-sm text-foreground">
            <code>{textContent}</code>
          </pre>
        ) : (
          <div className="rounded-lg border border-border bg-accent/10 px-4 py-3 text-sm text-muted-foreground">
            Binary asset preview is not available for this file type.
          </div>
        )}
      </div>
    </div>
  );
}
