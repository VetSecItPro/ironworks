import { ListTodo, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { TASK_TEMPLATES } from "./constants";

interface StepTaskProps {
  taskTitle: string;
  taskDescription: string;
  extraTasks: { title: string; description: string }[];
  onTaskTitleChange: (value: string) => void;
  onTaskDescriptionChange: (value: string) => void;
  onExtraTasksChange: (tasks: { title: string; description: string }[]) => void;
}

export function StepTask({
  taskTitle,
  taskDescription,
  extraTasks,
  onTaskTitleChange,
  onTaskDescriptionChange,
  onExtraTasksChange,
}: StepTaskProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  useEffect(() => {
    autoResizeTextarea();
  }, [taskDescription, autoResizeTextarea]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-1">
        <div className="bg-muted/50 p-2">
          <ListTodo className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-medium">Give it something to do</h3>
          <p className="text-xs text-muted-foreground">
            Give your agent a small task to start with - a bug fix, a research question, writing a script.
          </p>
        </div>
      </div>

      {/* Task template dropdown */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Quick start template</label>
        <select
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 text-foreground"
          value=""
          onChange={(e) => {
            const tpl = TASK_TEMPLATES.find((t) => t.title === e.target.value);
            if (tpl) {
              onTaskTitleChange(tpl.title);
              onTaskDescriptionChange(tpl.description);
            }
          }}
        >
          <option value="" disabled>
            Choose a common first task...
          </option>
          {TASK_TEMPLATES.map((tpl) => (
            <option key={tpl.title} value={tpl.title}>
              {tpl.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Task title</label>
        <input
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 placeholder:text-muted-foreground/70"
          placeholder="e.g. Research competitor pricing"
          value={taskTitle}
          onChange={(e) => onTaskTitleChange(e.target.value)}
          autoFocus
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Description (optional)</label>
        <textarea
          ref={textareaRef}
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 placeholder:text-muted-foreground/70 resize-none min-h-[120px] max-h-[300px] overflow-y-auto"
          placeholder="Add more detail about what the agent should do..."
          value={taskDescription}
          onChange={(e) => onTaskDescriptionChange(e.target.value)}
        />
      </div>

      {/* Extra tasks */}
      {extraTasks.map((extra, idx) => (
        <div key={idx} className="space-y-2 rounded-md border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Task {idx + 2}</span>
            <button
              type="button"
              className="text-muted-foreground hover:text-red-400 transition-colors"
              onClick={() => onExtraTasksChange(extraTasks.filter((_, i) => i !== idx))}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <input
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 placeholder:text-muted-foreground/70"
            placeholder="Task title"
            value={extra.title}
            onChange={(e) =>
              onExtraTasksChange(extraTasks.map((t, i) => (i === idx ? { ...t, title: e.target.value } : t)))
            }
          />
          <textarea
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 placeholder:text-muted-foreground/70 resize-none min-h-[60px]"
            placeholder="Description (optional)"
            value={extra.description}
            onChange={(e) =>
              onExtraTasksChange(extraTasks.map((t, i) => (i === idx ? { ...t, description: e.target.value } : t)))
            }
          />
        </div>
      ))}

      <button
        type="button"
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => onExtraTasksChange([...extraTasks, { title: "", description: "" }])}
      >
        <Plus className="h-3.5 w-3.5" />
        Add another task
      </button>
    </div>
  );
}
