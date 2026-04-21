import { ChevronLeft, Edit3, Globe, History, Lock, Save, ShieldCheck, Trash2, User, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { KnowledgePage } from "../../api/knowledge";
import { timeAgo } from "../../lib/timeAgo";

export function KBPageHeader({
  selectedPage,
  editing,
  editTitle,
  onEditTitleChange,
  onSave,
  onCancelEdit,
  onStartEditing,
  onToggleHistory,
  onDelete,
  onBack,
  isSaving,
  showHistory: _showHistory,
}: {
  selectedPage: KnowledgePage;
  editing: boolean;
  editTitle: string;
  onEditTitleChange: (title: string) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onStartEditing: () => void;
  onToggleHistory: () => void;
  onDelete: () => void;
  onBack: () => void;
  isSaving: boolean;
  showHistory: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <button type="button" className="md:hidden text-muted-foreground" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        {editing ? (
          <input
            className="text-sm font-semibold bg-transparent outline-none border-b border-border flex-1 min-w-0"
            value={editTitle}
            onChange={(e) => onEditTitleChange(e.target.value)}
          />
        ) : (
          <h2 className="text-sm font-semibold truncate">{selectedPage.title}</h2>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {editing ? (
          <>
            <Button size="sm" className="h-7 text-xs" disabled={isSaving} onClick={onSave}>
              <Save className="h-3 w-3 mr-1" />
              {isSaving ? "Saving..." : "Save"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancelEdit}>
              <X className="h-3 w-3 mr-1" />
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onStartEditing}>
              <Edit3 className="h-3 w-3 mr-1" />
              Edit
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onToggleHistory}>
              <History className="h-3 w-3 mr-1" />
              History
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={onDelete}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function KBPageMetadata({
  selectedPage,
  onVisibilityChange,
}: {
  selectedPage: KnowledgePage;
  onVisibilityChange: (visibility: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-1.5 text-[10px] text-muted-foreground border-b border-border/50 shrink-0 flex-wrap">
      <span>Revision #{selectedPage.revisionNumber}</span>
      <span>·</span>
      <span>Updated {timeAgo(selectedPage.updatedAt)}</span>
      <span>·</span>
      {/* Visibility dropdown */}
      <Select value={selectedPage.visibility} onValueChange={onVisibilityChange}>
        <SelectTrigger className="h-5 w-auto min-w-0 text-[10px] border-0 bg-transparent p-0 gap-1 shadow-none hover:bg-accent/50 rounded px-1.5">
          <span className="inline-flex items-center gap-1">
            {selectedPage.visibility === "company" && <Globe className="h-2.5 w-2.5" />}
            {selectedPage.visibility === "private" && <Lock className="h-2.5 w-2.5" />}
            {selectedPage.visibility === "project" && <ShieldCheck className="h-2.5 w-2.5" />}
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="company">
            <span className="inline-flex items-center gap-1.5">
              <Globe className="h-3 w-3" />
              Everyone
            </span>
          </SelectItem>
          <SelectItem value="private">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-3 w-3" />
              Admins only
            </span>
          </SelectItem>
          <SelectItem value="project">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3 w-3" />
              Specific agents
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      {selectedPage.department && (
        <>
          <span>·</span>
          <span className="inline-flex items-center gap-0.5 text-blue-400">
            <Users className="h-2.5 w-2.5" />
            {selectedPage.department}
          </span>
        </>
      )}
      {selectedPage.agentId && (
        <>
          <span>·</span>
          <span className="inline-flex items-center gap-0.5 text-purple-400">
            <User className="h-2.5 w-2.5" />
            Agent-scoped
          </span>
        </>
      )}
    </div>
  );
}
