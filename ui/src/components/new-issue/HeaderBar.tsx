import { FileText, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { pickTextColorForSolidBg } from "@/lib/color-contrast";
import { cn } from "../../lib/utils";
import { ISSUE_TEMPLATES } from "./constants";

interface Company {
  id: string;
  name: string;
  brandColor?: string | null;
  status?: string;
}

interface HeaderBarProps {
  dialogCompany: Company | null | undefined;
  companies: Company[];
  effectiveCompanyId: string | null;
  companyOpen: boolean;
  setCompanyOpen: (open: boolean) => void;
  handleCompanyChange: (companyId: string) => void;
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
  isPending: boolean;
  onClose: () => void;
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  setPriority: (priority: string) => void;
}

export function HeaderBar({
  dialogCompany,
  companies,
  effectiveCompanyId,
  companyOpen,
  setCompanyOpen,
  handleCompanyChange,
  expanded,
  setExpanded,
  isPending,
  onClose,
  setTitle,
  setDescription,
  setPriority,
}: HeaderBarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Popover open={companyOpen} onOpenChange={setCompanyOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "px-1.5 py-0.5 rounded text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity",
                !dialogCompany?.brandColor && "bg-muted",
              )}
              style={
                dialogCompany?.brandColor
                  ? {
                      backgroundColor: dialogCompany.brandColor,
                      color: pickTextColorForSolidBg(dialogCompany.brandColor),
                    }
                  : undefined
              }
            >
              {(dialogCompany?.name ?? "").slice(0, 3).toUpperCase()}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1" align="start">
            {companies
              .filter((c) => c.status !== "archived")
              .map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className={cn(
                    "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
                    c.id === effectiveCompanyId && "bg-accent",
                  )}
                  onClick={() => {
                    handleCompanyChange(c.id);
                    setCompanyOpen(false);
                  }}
                >
                  <span
                    className={cn(
                      "px-1 py-0.5 rounded text-[10px] font-semibold leading-none",
                      !c.brandColor && "bg-muted",
                    )}
                    style={
                      c.brandColor
                        ? {
                            backgroundColor: c.brandColor,
                            color: pickTextColorForSolidBg(c.brandColor),
                          }
                        : undefined
                    }
                  >
                    {c.name.slice(0, 3).toUpperCase()}
                  </span>
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
          </PopoverContent>
        </Popover>
        <span className="text-muted-foreground/80">&rsaquo;</span>
        <span>New issue</span>
      </div>
      <div className="flex items-center gap-1">
        {/* Template dropdown */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground h-7 px-2 gap-1"
              disabled={isPending}
            >
              <FileText className="h-3 w-3" />
              Template
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-1" align="end">
            {ISSUE_TEMPLATES.map((tpl) => (
              <button
                key={tpl.key}
                type="button"
                className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs rounded hover:bg-accent/50 text-left"
                onClick={() => {
                  setTitle(tpl.titlePrefix);
                  setDescription(tpl.description);
                  setPriority(tpl.priority);
                }}
              >
                {tpl.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          onClick={() => setExpanded(!expanded)}
          disabled={isPending}
        >
          {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </Button>
        <Button variant="ghost" size="icon-xs" className="text-muted-foreground" onClick={onClose} disabled={isPending}>
          <span className="text-lg leading-none">&times;</span>
        </Button>
      </div>
    </div>
  );
}
