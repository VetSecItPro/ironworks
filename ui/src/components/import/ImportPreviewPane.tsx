import type { CompanyPortabilityFileEntry } from "@ironworksai/shared";
import { Package } from "lucide-react";
import { getPortableFileDataUrl, getPortableFileText, isPortableImageFile } from "../../lib/portable-files";
import { cn } from "../../lib/utils";
import { EmptyState } from "../EmptyState";
import { MarkdownBody } from "../MarkdownBody";
import { FRONTMATTER_FIELD_LABELS, parseFrontmatter } from "../PackageFileTree";
import { ACTION_COLORS } from "./ImportHelpers";

function FrontmatterCard({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="rounded-md border border-border bg-accent/20 px-4 py-3 mb-4">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-muted-foreground whitespace-nowrap py-0.5">{FRONTMATTER_FIELD_LABELS[key] ?? key}</dt>
            <dd className="py-0.5">
              {Array.isArray(value) ? (
                <div className="flex flex-wrap gap-1.5">
                  {(value as string[]).map((item) => (
                    <span
                      key={item}
                      className="inline-flex items-center rounded-md border border-border bg-background px-2 py-0.5 text-xs"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : (
                <span>{String(value)}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ImportPreviewPane({
  selectedFile,
  content,
  allFiles,
  action,
  renamedTo,
}: {
  selectedFile: string | null;
  content: CompanyPortabilityFileEntry | null;
  allFiles: Record<string, CompanyPortabilityFileEntry>;
  action: string | null;
  renamedTo: string | null;
}) {
  if (!selectedFile || content === null) {
    return <EmptyState icon={Package} message="Select a file to preview its contents." />;
  }

  const textContent = getPortableFileText(content);
  const isMarkdownFile = selectedFile.endsWith(".md") && textContent !== null;
  const parsed = isMarkdownFile && textContent ? parseFrontmatter(textContent) : null;
  const imageSrc = isPortableImageFile(selectedFile, content) ? getPortableFileDataUrl(selectedFile, content) : null;
  const actionColor = action ? (ACTION_COLORS[action] ?? ACTION_COLORS.skip) : "";

  const resolveImageSrc = isMarkdownFile
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
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2">
            <span className="truncate font-mono text-sm">{selectedFile}</span>
            {renamedTo && <span className="shrink-0 font-mono text-sm text-cyan-500">&rarr; {renamedTo}</span>}
          </div>
          {action && (
            <span
              className={cn("shrink-0 rounded-full border px-2 py-0.5 text-xs uppercase tracking-wide", actionColor)}
            >
              {action}
            </span>
          )}
        </div>
      </div>
      <div className="min-h-[560px] px-5 py-5">
        {parsed ? (
          <>
            <FrontmatterCard data={parsed.data} />
            {parsed.body.trim() && <MarkdownBody resolveImageSrc={resolveImageSrc}>{parsed.body}</MarkdownBody>}
          </>
        ) : isMarkdownFile ? (
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
