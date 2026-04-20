import { useMemo } from "react";
import { Link } from "@/lib/router";

function CircleDotIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
}

export function IssueReferenceChips({ body, companyPrefix: _companyPrefix }: { body: string; companyPrefix: string }) {
  const refs = useMemo(() => {
    const pattern = /\b([A-Z]{2,6}-\d{1,6})\b/g;
    const matches = new Set<string>();
    let match = pattern.exec(body);
    while (match !== null) {
      matches.add(match[1]);
      match = pattern.exec(body);
    }
    return Array.from(matches);
  }, [body]);

  if (refs.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 pb-2">
      {refs.map((ref) => (
        <Link
          key={ref}
          to={`/issues`}
          className="inline-flex items-center gap-1 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-400 hover:bg-indigo-500/20 transition-colors"
        >
          <CircleDotIcon className="h-3 w-3" />
          {ref}
        </Link>
      ))}
    </div>
  );
}
