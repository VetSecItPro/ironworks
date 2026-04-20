import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface KbPageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isEdit: boolean;
  title: string;
  setTitle: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  visibility: "company" | "private";
  setVisibility: (v: "company" | "private") => void;
  department: string;
  setDepartment: (v: string) => void;
  isSaving: boolean;
  onSave: () => void;
}

export function KbPageDialog({
  open,
  onOpenChange,
  isEdit,
  title,
  setTitle,
  body,
  setBody,
  visibility,
  setVisibility,
  department,
  setDepartment,
  isSaving,
  onSave,
}: KbPageDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Page" : "New Page"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label htmlFor="kb-page-title" className="text-xs text-muted-foreground mb-1 block">
              Title
            </label>
            <input
              id="kb-page-title"
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Page title..."
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <span className="text-xs text-muted-foreground mb-1 block">Visibility</span>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as "company" | "private")}>
                <SelectTrigger className="h-8 text-xs" aria-label="Visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">Company</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!isEdit && (
              <div className="flex-1">
                <label htmlFor="kb-page-department" className="text-xs text-muted-foreground mb-1 block">
                  Department (optional)
                </label>
                <input
                  id="kb-page-department"
                  className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-xs outline-none h-8 focus:ring-1 focus:ring-ring"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Engineering"
                />
              </div>
            )}
          </div>
          <div>
            <label htmlFor="kb-page-body" className="text-xs text-muted-foreground mb-1 block">
              Body (Markdown)
            </label>
            <textarea
              id="kb-page-body"
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm font-mono outline-none resize-none focus:ring-1 focus:ring-ring"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write content in markdown..."
              rows={12}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!title.trim() || isSaving} onClick={onSave}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {isEdit ? (isSaving ? "Saving..." : "Save") : isSaving ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
