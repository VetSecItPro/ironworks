import { Copy, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router";

export function OrgChartToolbar({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div className="mb-2 flex items-center justify-start gap-2 shrink-0">
      <Link to="/company/import">
        <Button variant="outline" size="sm">
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          Import company
        </Button>
      </Link>
      <Link to="/company/export">
        <Button variant="outline" size="sm">
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Export company
        </Button>
      </Link>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          const svgEl = containerRef.current?.querySelector("svg");
          if (!svgEl) return;
          const svgData = new XMLSerializer().serializeToString(svgEl);
          navigator.clipboard.writeText(svgData).catch((err: unknown) => {
            console.error("Clipboard write failed", err instanceof Error ? err.message : err);
          });
        }}
      >
        <Copy className="mr-1.5 h-3.5 w-3.5" />
        Copy SVG
      </Button>
    </div>
  );
}

export function OrgChartZoomControls({
  zoom,
  pan,
  bounds,
  containerRef,
  onZoomPan,
}: {
  zoom: number;
  pan: { x: number; y: number };
  bounds: { width: number; height: number };
  containerRef: React.RefObject<HTMLDivElement | null>;
  onZoomPan: (zoom: number, pan: { x: number; y: number }) => void;
}) {
  return (
    <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
      <button type="button"
        className="w-7 h-7 flex items-center justify-center bg-background border border-border rounded text-sm hover:bg-accent transition-colors"
        onClick={() => {
          const newZoom = Math.min(zoom * 1.2, 2);
          const container = containerRef.current;
          if (container) {
            const cx = container.clientWidth / 2;
            const cy = container.clientHeight / 2;
            const scale = newZoom / zoom;
            onZoomPan(newZoom, { x: cx - scale * (cx - pan.x), y: cy - scale * (cy - pan.y) });
          } else {
            onZoomPan(newZoom, pan);
          }
        }}
        aria-label="Zoom in"
      >
        +
      </button>
      <button type="button"
        className="w-7 h-7 flex items-center justify-center bg-background border border-border rounded text-sm hover:bg-accent transition-colors"
        onClick={() => {
          const newZoom = Math.max(zoom * 0.8, 0.2);
          const container = containerRef.current;
          if (container) {
            const cx = container.clientWidth / 2;
            const cy = container.clientHeight / 2;
            const scale = newZoom / zoom;
            onZoomPan(newZoom, { x: cx - scale * (cx - pan.x), y: cy - scale * (cy - pan.y) });
          } else {
            onZoomPan(newZoom, pan);
          }
        }}
        aria-label="Zoom out"
      >
        &minus;
      </button>
      <button type="button"
        className="w-7 h-7 flex items-center justify-center bg-background border border-border rounded text-[10px] hover:bg-accent transition-colors"
        onClick={() => {
          if (!containerRef.current) return;
          const cW = containerRef.current.clientWidth;
          const cH = containerRef.current.clientHeight;
          const scaleX = (cW - 40) / bounds.width;
          const scaleY = (cH - 40) / bounds.height;
          const fitZoom = Math.min(scaleX, scaleY, 1);
          const chartW = bounds.width * fitZoom;
          const chartH = bounds.height * fitZoom;
          onZoomPan(fitZoom, { x: (cW - chartW) / 2, y: (cH - chartH) / 2 });
        }}
        title="Fit to screen"
        aria-label="Fit chart to screen"
      >
        Fit
      </button>
    </div>
  );
}

export function OrgChartVacantPositions({
  hiringRequests,
  roleLabel,
}: {
  hiringRequests: Array<{ id: string; status: string; role: string; title?: string }>;
  roleLabel: (role: string) => string;
}) {
  const openPositions = hiringRequests.filter((h) => h.status === "pending" || h.status === "pending_approval");
  if (openPositions.length === 0) return null;

  return (
    <div className="absolute bottom-3 right-3 z-10 max-w-xs print:hidden">
      <div className="rounded-lg border border-dashed border-amber-400/50 bg-amber-50/50 dark:bg-amber-900/10 p-3 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1">
          <span className="h-3 w-3 inline-block">
            {/* UserPlus inline to avoid import bloat */}
            <svg aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" x2="19" y1="8" y2="14" />
              <line x1="22" x2="16" y1="11" y2="11" />
            </svg>
          </span>
          Open Positions
        </p>
        {openPositions.slice(0, 4).map((h) => (
          <div key={h.id} className="flex items-center gap-2 text-xs">
            <div className="h-6 w-6 rounded-full border-2 border-dashed border-amber-400/50 flex items-center justify-center">
              <svg aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-amber-400/50"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" x2="19" y1="8" y2="14" />
                <line x1="22" x2="16" y1="11" y2="11" />
              </svg>
            </div>
            <span className="text-muted-foreground">{h.title ?? roleLabel(h.role)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
