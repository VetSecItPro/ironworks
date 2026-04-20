import { AreaChart, BarChart3, LineChart } from "lucide-react";
import { cn } from "../../lib/utils";
import type { ChartType } from "./chart-types";

export function ChartTypeSwitcher({ active, onChange }: { active: ChartType; onChange: (t: ChartType) => void }) {
  const types: { type: ChartType; icon: typeof BarChart3; label: string }[] = [
    { type: "bar", icon: BarChart3, label: "Bar" },
    { type: "line", icon: LineChart, label: "Line" },
    { type: "area", icon: AreaChart, label: "Area" },
  ];

  return (
    <div
      className="flex items-center gap-0.5 rounded-md border border-border p-0.5"
      role="group"
      aria-label="Chart type"
    >
      {types.map(({ type, icon: Icon, label }) => (
        <button type="button"
          key={type}
          onClick={() => onChange(type)}
          className={cn(
            "flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-colors",
            active === type
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
          )}
          title={label}
        >
          <Icon className="h-3 w-3" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

export function exportChartAsPng(svgElement: SVGSVGElement, filename: string) {
  const svgData = new XMLSerializer().serializeToString(svgElement);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const img = new Image();
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  img.onload = () => {
    canvas.width = img.width * 2;
    canvas.height = img.height * 2;
    ctx.scale(2, 2);
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, img.width, img.height);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

    const pngUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = pngUrl;
    a.download = `${filename}.png`;
    a.click();
  };
  img.src = url;
}
