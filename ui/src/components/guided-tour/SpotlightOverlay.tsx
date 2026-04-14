interface SpotlightProps {
  targetRect: DOMRect | null;
}

export function SpotlightOverlay({ targetRect }: SpotlightProps) {
  if (!targetRect) {
    return (
      <div className="fixed inset-0 z-[9998] bg-black/60 transition-opacity duration-300" />
    );
  }

  const padding = 8;
  const x = targetRect.left - padding;
  const y = targetRect.top - padding;
  const w = targetRect.width + padding * 2;
  const h = targetRect.height + padding * 2;
  const r = 8;

  return (
    <svg
      className="fixed inset-0 z-[9998] pointer-events-none"
      width="100%"
      height="100%"
      style={{ width: "100vw", height: "100vh" }}
    >
      <defs>
        <mask id="tour-spotlight-mask">
          <rect width="100%" height="100%" fill="white" />
          <rect x={x} y={y} width={w} height={h} rx={r} ry={r} fill="black" />
        </mask>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="rgba(0,0,0,0.6)"
        mask="url(#tour-spotlight-mask)"
      />
    </svg>
  );
}

export function getTargetRect(selector: string): DOMRect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  return el.getBoundingClientRect();
}
