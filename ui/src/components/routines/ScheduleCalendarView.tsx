export function ScheduleCalendarView({
  routines,
  agentById,
  onRoutineClick,
}: {
  routines: Array<{
    id: string;
    title: string;
    status: string;
    assigneeAgentId: string | null;
    triggers?: Array<{ enabled: boolean; nextRunAt?: string | null; schedule?: string | null }>;
  }>;
  agentById: Map<string, { id: string; name: string; icon?: string | null }>;
  onRoutineClick: (id: string) => void;
}) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Parse routine schedules into day/hour slots
  type Slot = { routineId: string; title: string; agentName: string; day: number; hour: number };
  const slots: Slot[] = [];

  for (const routine of routines) {
    if (routine.status !== "active") continue;
    for (const trigger of routine.triggers ?? []) {
      if (!trigger.enabled || !trigger.schedule) continue;
      const parts = trigger.schedule.trim().split(/\s+/);
      if (parts.length !== 5) continue;
      const [_min, hr, , , dow] = parts;
      const hourNum = hr === "*" ? 0 : parseInt(hr, 10);
      const agent = routine.assigneeAgentId ? agentById.get(routine.assigneeAgentId) : null;

      if (dow === "*" || dow === "1-5") {
        // Runs on multiple days
        const runDays = dow === "*" ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4];
        for (const d of runDays) {
          slots.push({
            routineId: routine.id,
            title: routine.title,
            agentName: agent?.name ?? "-",
            day: d,
            hour: hourNum,
          });
        }
      } else if (/^\d$/.test(dow)) {
        const d = parseInt(dow, 10);
        // Convert: 0=Sun -> index 6, 1=Mon -> index 0, etc.
        const dayIdx = d === 0 ? 6 : d - 1;
        slots.push({
          routineId: routine.id,
          title: routine.title,
          agentName: agent?.name ?? "-",
          day: dayIdx,
          hour: hourNum,
        });
      }
    }
  }

  // Group by day and hour
  const grid = new Map<string, Slot[]>();
  for (const slot of slots) {
    const key = `${slot.day}-${slot.hour}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(slot);
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Day headers */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] gap-px bg-border/30">
          <div className="bg-background" />
          {days.map((day) => (
            <div key={day} className="bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground text-center">
              {day}
            </div>
          ))}
        </div>
        {/* Hour rows - show only hours 6-22 */}
        {hours
          .filter((h) => h >= 6 && h <= 22)
          .map((hour) => (
            <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] gap-px bg-border/10 min-h-[28px]">
              <div className="bg-background flex items-center justify-end pr-2 text-[10px] text-muted-foreground/80">
                {hour === 0 ? "12AM" : hour < 12 ? `${hour}AM` : hour === 12 ? "12PM" : `${hour - 12}PM`}
              </div>
              {days.map((day, dayIdx) => {
                const key = `${dayIdx}-${hour}`;
                const cellSlots = grid.get(key) ?? [];
                return (
                  <div key={day} className="bg-background p-0.5 min-h-[28px]">
                    {cellSlots.map((slot) => (
                      <button
                        type="button"
                        key={slot.routineId}
                        onClick={() => onRoutineClick(slot.routineId)}
                        className="block w-full text-left text-[10px] rounded px-1 py-0.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors truncate"
                        title={`${slot.title} (${slot.agentName})`}
                      >
                        {slot.title}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
      </div>
    </div>
  );
}
