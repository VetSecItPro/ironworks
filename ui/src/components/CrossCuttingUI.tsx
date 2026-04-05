/**
 * 12.18 Cross-Cutting UI components:
 * - Page-specific loading skeletons with shimmer
 * - Mobile audit helpers at 375px
 * - Dark mode audit helpers for SVG/gradient colors
 */
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "../lib/utils";

/* ------------------------------------------------------------------ */
/*  Page-specific Loading Skeletons with Shimmer                       */
/* ------------------------------------------------------------------ */

export function LibrarySkeleton() {
  return (
    <div className="flex h-full">
      <div className="w-72 border-r border-border p-3 space-y-2 shrink-0">
        <Skeleton className="h-7 w-full shimmer" />
        <Skeleton className="h-5 w-40 shimmer" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 py-1">
            <Skeleton className="h-4 w-4 shrink-0 shimmer" />
            <Skeleton className="h-4 flex-1 shimmer" />
          </div>
        ))}
      </div>
      <div className="flex-1 p-6 space-y-4">
        <Skeleton className="h-6 w-64 shimmer" />
        <Skeleton className="h-4 w-32 shimmer" />
        <div className="space-y-2 mt-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full shimmer" style={{ width: `${60 + Math.random() * 40}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function KnowledgeBaseSkeleton() {
  return (
    <div className="flex h-full">
      <div className="w-72 border-r border-border shrink-0">
        <div className="p-3 border-b border-border space-y-2">
          <Skeleton className="h-7 w-full shimmer" />
          <Skeleton className="h-7 w-full shimmer" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="px-3 py-2.5 border-b border-border/50">
            <Skeleton className="h-4 w-3/4 shimmer" />
            <Skeleton className="h-3 w-1/2 mt-1 shimmer" />
          </div>
        ))}
      </div>
      <div className="flex-1 p-6 space-y-4">
        <Skeleton className="h-6 w-48 shimmer" />
        <div className="space-y-2 mt-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full shimmer" style={{ width: `${50 + Math.random() * 50}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function PlaybooksSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border">
        <Skeleton className="h-7 w-48 shimmer" />
        <Skeleton className="h-4 w-64 mt-1 shimmer" />
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="w-80 border-r border-border p-3 space-y-2 shrink-0">
          <Skeleton className="h-7 w-full shimmer" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-3 border-b border-border/50">
              <Skeleton className="h-4 w-3/4 shimmer" />
              <Skeleton className="h-3 w-1/2 mt-1.5 shimmer" />
            </div>
          ))}
        </div>
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-6 w-48 shimmer" />
          <Skeleton className="h-4 w-32 shimmer" />
          <div className="space-y-3 mt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-6 w-6 rounded-full shrink-0 shimmer" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-40 shimmer" />
                  <Skeleton className="h-3 w-64 shimmer" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChannelSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <Skeleton className="h-5 w-40 shimmer" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full shimmer" />
          <Skeleton className="h-6 w-16 rounded-full shimmer" />
        </div>
      </div>
      <div className="flex-1 space-y-4 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-7 w-7 rounded-full shrink-0 shimmer" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3 w-24 shimmer" />
              <Skeleton className="h-4 shimmer" style={{ width: `${40 + Math.random() * 50}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="px-4 py-3 border-t border-border">
        <Skeleton className="h-10 w-full shimmer" />
      </div>
    </div>
  );
}

export function DeliverablesSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border flex justify-between">
        <Skeleton className="h-6 w-40 shimmer" />
        <Skeleton className="h-8 w-32 shimmer" />
      </div>
      <div className="flex-1 divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-48 shimmer" />
              <Skeleton className="h-3 w-32 shimmer" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function OrgChartSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="flex gap-2">
        <Skeleton className="h-8 w-32 shimmer" />
        <Skeleton className="h-8 w-32 shimmer" />
      </div>
      <div className="relative h-[calc(100vh-8rem)] rounded-lg border border-border overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="space-y-8">
            <div className="flex justify-center">
              <Skeleton className="h-28 w-64 rounded-xl shimmer" />
            </div>
            <div className="flex gap-8 justify-center">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-64 rounded-xl shimmer" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BillingSkeleton() {
  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div>
        <Skeleton className="h-7 w-32 shimmer" />
        <Skeleton className="h-4 w-56 mt-1 shimmer" />
      </div>
      <Skeleton className="h-40 w-full rounded-lg shimmer" />
      <Skeleton className="h-32 w-full rounded-lg shimmer" />
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-lg shimmer" />
        ))}
      </div>
    </div>
  );
}

export function CompanySettingsSkeleton() {
  return (
    <div className="flex gap-6 p-6">
      <div className="w-48 shrink-0 space-y-1">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full shimmer" />
        ))}
      </div>
      <div className="flex-1 space-y-4">
        <Skeleton className="h-6 w-40 shimmer" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24 shimmer" />
            <Skeleton className="h-9 w-full shimmer" />
          </div>
        ))}
        <Skeleton className="h-9 w-32 shimmer" />
      </div>
    </div>
  );
}

export function BoardBriefingSkeleton() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4">
      <div className="border-b border-border pb-4">
        <Skeleton className="h-7 w-48 shimmer" />
        <Skeleton className="h-4 w-64 mt-1 shimmer" />
      </div>
      <Skeleton className="h-24 w-full rounded-xl shimmer" />
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-40 rounded-xl shimmer" />
        <Skeleton className="h-40 rounded-xl shimmer" />
      </div>
      <Skeleton className="h-48 w-full rounded-xl shimmer" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mobile Responsive Wrapper                                          */
/* ------------------------------------------------------------------ */

export function MobileResponsiveContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(
      "min-w-[375px]",
      // At 375px, remove side paddings and adjust layouts
      "max-[375px]:px-2 max-[375px]:text-sm",
      className,
    )}>
      {children}
    </div>
  );
}
