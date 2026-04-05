/**
 * 12.49 - Charts & Data Visualization shared components
 * Chart type switcher, annotations, drill-down, export, responsive sizing,
 * loading skeletons, no-data states, zoom/pan, comparison mode
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Camera,
  ChevronDown,
  Download,
  LineChart,
  Maximize2,
  Minus,
  AreaChart,
  ZoomIn,
  ZoomOut,
  Layers,
  X,
} from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ChartDataPoint {
  label: string;
  value: number;
  metadata?: Record<string, unknown>;
}

export interface ChartAnnotation {
  label: string;
  index: number; // index into data array
  color?: string;
  dashed?: boolean;
}

export type ChartType = "bar" | "line" | "area";

interface ChartProps {
  data: ChartDataPoint[];
  annotations?: ChartAnnotation[];
  formatValue?: (v: number) => string;
  height?: number;
  onPointClick?: (point: ChartDataPoint, index: number) => void;
  showSwitcher?: boolean;
  defaultType?: ChartType;
  comparisonData?: ChartDataPoint[];
  comparisonLabel?: string;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Chart Loading Skeleton                                             */
/* ------------------------------------------------------------------ */

export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-3 animate-pulse" style={{ height }}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-6 w-20" />
      </div>
      <div className="flex items-end gap-1 h-[calc(100%-3rem)]">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-t"
            style={{ height: `${30 + Math.random() * 60}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Chart No-Data State                                                */
/* ------------------------------------------------------------------ */

export function ChartNoData({ message, height = 200 }: { message?: string; height?: number }) {
  return (
    <div
      className="rounded-lg border border-border flex flex-col items-center justify-center text-center"
      style={{ height }}
    >
      <BarChart3 className="h-8 w-8 text-muted-foreground/30 mb-2" />
      <p className="text-sm text-muted-foreground">{message ?? "No data available"}</p>
      <p className="text-xs text-muted-foreground/60 mt-0.5">Data will appear once activity is recorded</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Chart Type Switcher                                                */
/* ------------------------------------------------------------------ */

function ChartTypeSwitcher({
  active,
  onChange,
}: {
  active: ChartType;
  onChange: (t: ChartType) => void;
}) {
  const types: { type: ChartType; icon: typeof BarChart3; label: string }[] = [
    { type: "bar", icon: BarChart3, label: "Bar" },
    { type: "line", icon: LineChart, label: "Line" },
    { type: "area", icon: AreaChart, label: "Area" },
  ];

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5" role="group" aria-label="Chart type">
      {types.map(({ type, icon: Icon, label }) => (
        <button
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

/* ------------------------------------------------------------------ */
/*  Export as PNG                                                       */
/* ------------------------------------------------------------------ */

function exportChartAsPng(svgElement: SVGSVGElement, filename: string) {
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

/* ------------------------------------------------------------------ */
/*  Main Interactive Chart                                             */
/* ------------------------------------------------------------------ */

export function InteractiveChart({
  data,
  annotations = [],
  formatValue = (v) => String(v),
  height = 240,
  onPointClick,
  showSwitcher = true,
  defaultType = "bar",
  comparisonData,
  comparisonLabel,
  className,
}: ChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartType, setChartType] = useState<ChartType>(defaultType);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const [showComparison, setShowComparison] = useState(!!comparisonData);

  // Zoom/pan state for time series
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);

  // Responsive sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Visible data slice for zoom
  const visibleData = useMemo(() => {
    if (!zoomRange) return data;
    return data.slice(zoomRange[0], zoomRange[1] + 1);
  }, [data, zoomRange]);

  const visibleComparison = useMemo(() => {
    if (!comparisonData || !showComparison) return undefined;
    if (!zoomRange) return comparisonData;
    return comparisonData.slice(zoomRange[0], zoomRange[1] + 1);
  }, [comparisonData, showComparison, zoomRange]);

  // Compute chart dimensions
  const PADDING = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartWidth = containerWidth - PADDING.left - PADDING.right;
  const chartHeight = height - PADDING.top - PADDING.bottom;

  const maxValue = useMemo(() => {
    let max = Math.max(...visibleData.map((d) => d.value), 1);
    if (visibleComparison) {
      max = Math.max(max, ...visibleComparison.map((d) => d.value));
    }
    return max * 1.1;
  }, [visibleData, visibleComparison]);

  const barWidth = Math.max(4, Math.min(40, (chartWidth / visibleData.length) * 0.6));
  const gap = (chartWidth - barWidth * visibleData.length) / Math.max(visibleData.length - 1, 1);

  const getX = useCallback(
    (i: number) => PADDING.left + i * (barWidth + gap) + barWidth / 2,
    [barWidth, gap, PADDING.left],
  );
  const getY = useCallback(
    (v: number) => PADDING.top + chartHeight - (v / maxValue) * chartHeight,
    [chartHeight, maxValue, PADDING.top],
  );

  // Build paths for line/area
  const linePath = useMemo(() => {
    if (visibleData.length === 0) return "";
    return visibleData.map((d, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getY(d.value)}`).join(" ");
  }, [visibleData, getX, getY]);

  const areaPath = useMemo(() => {
    if (visibleData.length === 0) return "";
    const base = PADDING.top + chartHeight;
    return (
      `M ${getX(0)} ${base} ` +
      visibleData.map((d, i) => `L ${getX(i)} ${getY(d.value)}`).join(" ") +
      ` L ${getX(visibleData.length - 1)} ${base} Z`
    );
  }, [visibleData, getX, getY, chartHeight, PADDING.top]);

  const comparisonLinePath = useMemo(() => {
    if (!visibleComparison || visibleComparison.length === 0) return "";
    return visibleComparison.map((d, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getY(d.value)}`).join(" ");
  }, [visibleComparison, getX, getY]);

  // Scroll zoom handler
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (data.length <= 3) return;
      e.preventDefault();
      const current = zoomRange ?? [0, data.length - 1];
      const center = Math.floor((current[0] + current[1]) / 2);
      const halfRange = Math.floor((current[1] - current[0]) / 2);
      const delta = e.deltaY > 0 ? 1 : -1;
      const newHalf = Math.max(1, Math.min(Math.floor(data.length / 2), halfRange + delta));
      const newStart = Math.max(0, center - newHalf);
      const newEnd = Math.min(data.length - 1, center + newHalf);
      if (newEnd - newStart < 2) return;
      setZoomRange([newStart, newEnd]);
    },
    [data, zoomRange],
  );

  if (data.length === 0) {
    return <ChartNoData height={height} />;
  }

  // Y-axis ticks
  const yTicks = Array.from({ length: 5 }, (_, i) => (maxValue / 4) * i);

  return (
    <div ref={containerRef} className={cn("space-y-2", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {showSwitcher && <ChartTypeSwitcher active={chartType} onChange={setChartType} />}
        <div className="flex items-center gap-1.5 ml-auto">
          {comparisonData && (
            <button
              onClick={() => setShowComparison(!showComparison)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border transition-colors",
                showComparison
                  ? "border-purple-400 bg-purple-500/10 text-purple-400"
                  : "border-border text-muted-foreground hover:bg-accent/50",
              )}
            >
              <Layers className="h-3 w-3" />
              {comparisonLabel ?? "Compare"}
            </button>
          )}
          {zoomRange && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] px-2"
              onClick={() => setZoomRange(null)}
            >
              <Maximize2 className="h-3 w-3 mr-0.5" />
              Reset
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            title="Export as PNG"
            onClick={() => {
              if (svgRef.current) exportChartAsPng(svgRef.current, "chart");
            }}
          >
            <Camera className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Chart SVG */}
      <svg
        ref={svgRef}
        width={containerWidth}
        height={height}
        className="select-none"
        onWheel={handleWheel}
      >
        {/* Grid lines */}
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line
              x1={PADDING.left}
              y1={getY(tick)}
              x2={containerWidth - PADDING.right}
              y2={getY(tick)}
              stroke="var(--border)"
              strokeWidth={0.5}
              strokeDasharray={i === 0 ? undefined : "3 3"}
            />
            <text
              x={PADDING.left - 8}
              y={getY(tick) + 3}
              textAnchor="end"
              fontSize={9}
              fill="var(--muted-foreground)"
            >
              {formatValue(tick)}
            </text>
          </g>
        ))}

        {/* Annotations (vertical lines) */}
        {annotations.map((ann, i) => {
          const dataIdx = zoomRange ? ann.index - zoomRange[0] : ann.index;
          if (dataIdx < 0 || dataIdx >= visibleData.length) return null;
          const x = getX(dataIdx);
          return (
            <g key={`ann-${i}`}>
              <line
                x1={x}
                y1={PADDING.top}
                x2={x}
                y2={PADDING.top + chartHeight}
                stroke={ann.color ?? "var(--destructive)"}
                strokeWidth={1.5}
                strokeDasharray={ann.dashed ? "4 4" : undefined}
                opacity={0.7}
              />
              <text
                x={x}
                y={PADDING.top - 4}
                textAnchor="middle"
                fontSize={8}
                fill={ann.color ?? "var(--destructive)"}
                fontWeight={600}
              >
                {ann.label}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        {chartType === "area" && (
          <path d={areaPath} fill="var(--primary)" opacity={0.1} />
        )}

        {/* Comparison line */}
        {showComparison && comparisonLinePath && (
          <path
            d={comparisonLinePath}
            fill="none"
            stroke="var(--chart-2, #a855f7)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            opacity={0.7}
          />
        )}

        {/* Main data rendering */}
        {chartType === "bar"
          ? visibleData.map((d, i) => (
              <g key={i}>
                <rect
                  x={getX(i) - barWidth / 2}
                  y={getY(d.value)}
                  width={barWidth}
                  height={Math.max(0, PADDING.top + chartHeight - getY(d.value))}
                  rx={2}
                  fill={hoveredIndex === i ? "var(--primary)" : "var(--primary)"}
                  opacity={hoveredIndex === i ? 1 : 0.7}
                  className="transition-opacity cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onClick={() => onPointClick?.(d, zoomRange ? i + zoomRange[0] : i)}
                />
                {/* Comparison bar overlay */}
                {showComparison && visibleComparison?.[i] && (
                  <rect
                    x={getX(i) - barWidth / 2 + barWidth * 0.4}
                    y={getY(visibleComparison[i].value)}
                    width={barWidth * 0.5}
                    height={Math.max(0, PADDING.top + chartHeight - getY(visibleComparison[i].value))}
                    rx={2}
                    fill="var(--chart-2, #a855f7)"
                    opacity={0.5}
                  />
                )}
              </g>
            ))
          : (
              <>
                <path
                  d={linePath}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
                {visibleData.map((d, i) => (
                  <circle
                    key={i}
                    cx={getX(i)}
                    cy={getY(d.value)}
                    r={hoveredIndex === i ? 5 : 3}
                    fill="var(--primary)"
                    stroke="var(--background)"
                    strokeWidth={2}
                    className="cursor-pointer transition-all"
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onClick={() => onPointClick?.(d, zoomRange ? i + zoomRange[0] : i)}
                  />
                ))}
              </>
            )}

        {/* X-axis labels */}
        {visibleData.map((d, i) => {
          // Skip labels if too many
          const skip = visibleData.length > 12 ? Math.ceil(visibleData.length / 8) : 1;
          if (i % skip !== 0 && i !== visibleData.length - 1) return null;
          return (
            <text
              key={i}
              x={getX(i)}
              y={PADDING.top + chartHeight + 16}
              textAnchor="middle"
              fontSize={9}
              fill="var(--muted-foreground)"
            >
              {d.label}
            </text>
          );
        })}

        {/* Tooltip on hover */}
        {hoveredIndex !== null && visibleData[hoveredIndex] && (
          <g>
            <rect
              x={Math.min(getX(hoveredIndex) - 40, containerWidth - PADDING.right - 80)}
              y={getY(visibleData[hoveredIndex].value) - 28}
              width={80}
              height={22}
              rx={4}
              fill="var(--popover)"
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text
              x={Math.min(getX(hoveredIndex), containerWidth - PADDING.right - 40)}
              y={getY(visibleData[hoveredIndex].value) - 14}
              textAnchor="middle"
              fontSize={10}
              fontWeight={600}
              fill="var(--foreground)"
            >
              {formatValue(visibleData[hoveredIndex].value)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
