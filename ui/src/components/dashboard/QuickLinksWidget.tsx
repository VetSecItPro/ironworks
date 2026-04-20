import { X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "@/lib/router";

interface QuickLink {
  id: string;
  label: string;
  url: string;
}
const QUICK_LINKS_KEY = "ironworks:quick-links";

export function QuickLinksWidget() {
  const navigate = useNavigate();
  const [links, setLinks] = useState<QuickLink[]>(() => {
    try {
      const raw = localStorage.getItem(QUICK_LINKS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const save = (updated: QuickLink[]) => {
    setLinks(updated);
    try {
      localStorage.setItem(QUICK_LINKS_KEY, JSON.stringify(updated));
    } catch {
      /* */
    }
  };

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick Links</h4>
        <button
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setAdding(true)}
        >
          + Add
        </button>
      </div>
      {adding && (
        <div className="flex items-center gap-2">
          <input
            className="flex-1 border border-border rounded px-2 py-1 text-xs bg-transparent"
            placeholder="Label"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            autoFocus
          />
          <input
            className="flex-1 border border-border rounded px-2 py-1 text-xs bg-transparent"
            placeholder="/path"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
          />
          <button
            className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground"
            onClick={() => {
              if (newLabel.trim() && newUrl.trim()) {
                save([...links, { id: `ql-${Date.now()}`, label: newLabel.trim(), url: newUrl.trim() }]);
                setNewLabel("");
                setNewUrl("");
                setAdding(false);
              }
            }}
          >
            Save
          </button>
          <button
            className="text-xs text-muted-foreground"
            onClick={() => {
              setAdding(false);
              setNewLabel("");
              setNewUrl("");
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {links.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground">No quick links. Click + Add to create shortcuts.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {links.map((link) => (
            <div key={link.id} className="group inline-flex items-center gap-1">
              <button
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                onClick={() => navigate(link.url)}
              >
                {link.label}
              </button>
              <button
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                onClick={() => save(links.filter((l) => l.id !== link.id))}
                aria-label={`Remove ${link.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
