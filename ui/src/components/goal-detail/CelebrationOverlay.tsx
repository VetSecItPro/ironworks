import { CheckCircle2 } from "lucide-react";
import { cn } from "../../lib/utils";

export function CelebrationOverlay({ show }: { show: boolean }) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
      <div className="animate-bounce text-6xl opacity-90">
        <CheckCircle2 className="h-24 w-24 text-emerald-500 drop-shadow-lg" />
      </div>
      {/* Confetti particles */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = i * 30 * (Math.PI / 180);
        const distance = 80 + Math.random() * 60;
        const colors = ["bg-emerald-500", "bg-blue-500", "bg-amber-500", "bg-violet-500", "bg-rose-500"];
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: confetti particles are anonymous; position/angle is computed from index which is the semantic identity
          <div
            key={i}
            className={cn("absolute h-2 w-2 rounded-full", colors[i % colors.length])}
            style={{
              left: `calc(50% + ${Math.cos(angle) * distance}px)`,
              top: `calc(50% + ${Math.sin(angle) * distance}px)`,
              animation: "confetti-burst 0.7s ease-out forwards",
              animationDelay: `${i * 30}ms`,
              opacity: 0,
            }}
          />
        );
      })}
    </div>
  );
}
