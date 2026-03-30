import { useState } from "react";
import { Globe, Lock, EyeOff, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "../lib/utils";

export interface LibraryACLSettings {
  defaultVisibility: "company" | "project" | "private";
  agentHomeDirectories: boolean;
  sharedFolderWriteAccess: "all" | "managers_only" | "ceo_only";
}

const DEFAULT_SETTINGS: LibraryACLSettings = {
  defaultVisibility: "company",
  agentHomeDirectories: true,
  sharedFolderWriteAccess: "managers_only",
};

const VISIBILITY_OPTIONS = [
  { value: "company", label: "Company", desc: "All agents can see", icon: Globe },
  { value: "project", label: "Project", desc: "Only project members", icon: EyeOff },
  { value: "private", label: "Private", desc: "Only the creating agent", icon: Lock },
] as const;

const WRITE_ACCESS_OPTIONS = [
  { value: "all", label: "All Agents", desc: "Any agent can write to shared/" },
  { value: "managers_only", label: "Managers Only", desc: "CEO + managers with reports" },
  { value: "ceo_only", label: "CEO Only", desc: "Only the CEO agent" },
] as const;

interface LibrarySettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings?: LibraryACLSettings;
  onSave?: (settings: LibraryACLSettings) => void;
}

export function LibrarySettingsDialog({
  open,
  onOpenChange,
  settings: initialSettings,
  onSave,
}: LibrarySettingsDialogProps) {
  const [settings, setSettings] = useState<LibraryACLSettings>(
    initialSettings ?? DEFAULT_SETTINGS,
  );

  const handleSave = () => {
    onSave?.(settings);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Library Settings
          </DialogTitle>
          <DialogDescription>
            Configure access controls and defaults for the company library.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Default Visibility */}
          <div>
            <label className="text-sm font-medium">Default Visibility</label>
            <p className="text-xs text-muted-foreground mb-2">
              When agents create files, what visibility should be applied by default?
            </p>
            <div className="grid grid-cols-3 gap-2">
              {VISIBILITY_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSelected = settings.defaultVisibility === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() =>
                      setSettings((s) => ({
                        ...s,
                        defaultVisibility: opt.value,
                      }))
                    }
                    className={cn(
                      "flex flex-col items-center gap-1 p-3 rounded-md border text-center transition-colors",
                      isSelected
                        ? "border-foreground bg-accent"
                        : "border-border hover:border-foreground/30",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-xs font-medium">{opt.label}</span>
                    <span className="text-[10px] text-muted-foreground">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Agent Home Directories */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Agent Home Directories</label>
              <p className="text-xs text-muted-foreground">
                Create agents/&lt;name&gt;/ folders automatically for each agent
              </p>
            </div>
            <button
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  agentHomeDirectories: !s.agentHomeDirectories,
                }))
              }
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors",
                settings.agentHomeDirectories ? "bg-foreground" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-background transition-transform mt-0.5",
                  settings.agentHomeDirectories ? "translate-x-4 ml-0.5" : "translate-x-0.5",
                )}
              />
            </button>
          </div>

          {/* Shared Folder Write Access */}
          <div>
            <label className="text-sm font-medium">Shared Folder Write Access</label>
            <p className="text-xs text-muted-foreground mb-2">
              Who can create and edit files in the shared/ directory?
            </p>
            <div className="space-y-1.5">
              {WRITE_ACCESS_OPTIONS.map((opt) => {
                const isSelected = settings.sharedFolderWriteAccess === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() =>
                      setSettings((s) => ({
                        ...s,
                        sharedFolderWriteAccess: opt.value as LibraryACLSettings["sharedFolderWriteAccess"],
                      }))
                    }
                    className={cn(
                      "flex items-center gap-3 w-full p-2.5 rounded-md border text-left transition-colors",
                      isSelected
                        ? "border-foreground bg-accent"
                        : "border-border hover:border-foreground/30",
                    )}
                  >
                    <div
                      className={cn(
                        "h-3.5 w-3.5 rounded-full border-2 shrink-0",
                        isSelected ? "border-foreground bg-foreground" : "border-muted-foreground",
                      )}
                    >
                      {isSelected && (
                        <div className="h-full w-full rounded-full bg-background scale-[0.35]" />
                      )}
                    </div>
                    <div>
                      <span className="text-sm font-medium">{opt.label}</span>
                      <span className="text-xs text-muted-foreground ml-2">{opt.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Settings</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LibrarySettingsButton({
  settings,
  onSave,
}: {
  settings?: LibraryACLSettings;
  onSave?: (settings: LibraryACLSettings) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            onClick={() => setOpen(true)}
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Library settings</TooltipContent>
      </Tooltip>
      <LibrarySettingsDialog
        open={open}
        onOpenChange={setOpen}
        settings={settings}
        onSave={onSave}
      />
    </>
  );
}
