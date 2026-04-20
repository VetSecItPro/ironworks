const DEPT_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#06b6d4", "#10b981", "#eab308", "#ef4444"];

export function DepartmentMiniChart({ departments }: { departments: Array<{ name: string; count: number }> }) {
  const maxCount = Math.max(...departments.map((d) => d.count), 1);

  return (
    <div className="space-y-2">
      {departments.map((dept, i) => (
        <div key={dept.name} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="truncate">{dept.name}</span>
            <span className="text-muted-foreground tabular-nums shrink-0 ml-2">{dept.count}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${(dept.count / maxCount) * 100}%`,
                backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
