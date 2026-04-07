import { useEffect, useState } from "react";

export function LastUpdatedBadge({ dataUpdatedAt }: { dataUpdatedAt?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  if (!dataUpdatedAt) return null;
  const seconds = Math.max(0, Math.floor((now - dataUpdatedAt) / 1000));
  const label =
    seconds < 5 ? "just now" :
    seconds < 60 ? `${seconds}s ago` :
    seconds < 3600 ? `${Math.floor(seconds / 60)}m ago` :
    `${Math.floor(seconds / 3600)}h ago`;
  return (
    <span className="text-[10px] text-muted-foreground/80 tabular-nums">
      Updated {label}
    </span>
  );
}
