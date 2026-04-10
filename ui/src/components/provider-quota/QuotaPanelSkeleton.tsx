import { Skeleton } from "@/components/ui/skeleton";

export function QuotaPanelSkeleton() {
  return (
    <div className="border border-border px-4 py-4">
      <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-7 w-28" />
      </div>
      <div className="mt-4 space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="border border-border px-3.5 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-44 max-w-full" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="mt-3 h-2 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
