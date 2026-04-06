import { Skeleton } from "@/components/ui/skeleton";

interface PageSkeletonProps {
  variant?:
    | "list"
    | "issues-list"
    | "detail"
    | "agent-detail"
    | "issue-detail"
    | "goals"
    | "dashboard"
    | "approvals"
    | "costs"
    | "inbox"
    | "org-chart"
    | "library"
    | "knowledge-base"
    | "playbooks"
    | "channel"
    | "deliverables"
    | "billing"
    | "company-settings"
    | "board-briefing";
}

export function PageSkeleton({ variant = "list" }: PageSkeletonProps) {
  if (variant === "dashboard") {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full border border-border" />

        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  if (variant === "approvals") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-44" />
        </div>
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (variant === "costs") {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-28" />
          ))}
        </div>

        <Skeleton className="h-40 w-full" />

        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  if (variant === "inbox") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-8 w-40" />
        </div>

        <div className="space-y-5">
          {Array.from({ length: 3 }).map((_, section) => (
            <div key={section} className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <div className="space-y-1 border border-border">
                {Array.from({ length: 3 }).map((_, row) => (
                  <Skeleton key={row} className="h-14 w-full rounded-none" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "org-chart") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[calc(100vh-4rem)] w-full rounded-lg border border-border" />
      </div>
    );
  }

  if (variant === "detail") {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-3 w-64" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-6" />
            <Skeleton className="h-6 w-6" />
            <Skeleton className="h-7 w-48" />
          </div>
          <Skeleton className="h-4 w-40" />
        </div>

        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (variant === "agent-detail") {
    return (
      <div className="space-y-6">
        {/* Agent header */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-lg skeleton" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48 skeleton" />
            <Skeleton className="h-4 w-32 skeleton" />
          </div>
          <div className="ml-auto flex gap-2">
            <Skeleton className="h-9 w-24 skeleton" />
            <Skeleton className="h-9 w-24 skeleton" />
          </div>
        </div>

        {/* Status cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg skeleton" />
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border pb-2">
          <Skeleton className="h-8 w-20 skeleton" />
          <Skeleton className="h-8 w-20 skeleton" />
          <Skeleton className="h-8 w-20 skeleton" />
          <Skeleton className="h-8 w-20 skeleton" />
        </div>

        {/* Content area */}
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full skeleton" />
          ))}
        </div>
      </div>
    );
  }

  if (variant === "issue-detail") {
    return (
      <div className="space-y-6">
        {/* Breadcrumb + identifier */}
        <Skeleton className="h-4 w-64 skeleton" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-6 rounded skeleton" />
          <Skeleton className="h-7 w-80 skeleton" />
        </div>

        {/* Properties row */}
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-8 w-24 rounded skeleton" />
          <Skeleton className="h-8 w-24 rounded skeleton" />
          <Skeleton className="h-8 w-32 rounded skeleton" />
          <Skeleton className="h-8 w-28 rounded skeleton" />
        </div>

        {/* Description */}
        <Skeleton className="h-32 w-full rounded-lg skeleton" />

        {/* Tabs */}
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 skeleton" />
          <Skeleton className="h-8 w-24 skeleton" />
          <Skeleton className="h-8 w-24 skeleton" />
        </div>

        {/* Comments area */}
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full shrink-0 skeleton" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32 skeleton" />
                <Skeleton className="h-16 w-full skeleton" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "goals") {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40 skeleton" />
          <Skeleton className="h-9 w-28 skeleton" />
        </div>

        {/* Goal cards */}
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-48 skeleton" />
                <Skeleton className="h-5 w-16 rounded-full skeleton" />
              </div>
              <Skeleton className="h-2 w-full rounded-full skeleton" />
              <div className="flex gap-4">
                <Skeleton className="h-4 w-20 skeleton" />
                <Skeleton className="h-4 w-24 skeleton" />
                <Skeleton className="h-4 w-16 skeleton" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "issues-list") {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-9 w-64" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>

        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <div className="space-y-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-none" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-9 w-44" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>

      <div className="space-y-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-none" />
        ))}
      </div>
    </div>
  );
}
