import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IssueProperties } from "@/components/IssueProperties";

interface IssueMobilePropsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issue: Parameters<typeof IssueProperties>[0]["issue"];
  onUpdate: (data: Record<string, unknown>) => void;
}

export function IssueMobilePropsDrawer({ open, onOpenChange, issue, onUpdate }: IssueMobilePropsDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] pb-[env(safe-area-inset-bottom)]">
        <SheetHeader>
          <SheetTitle className="text-sm">Properties</SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="px-4 pb-4">
            <IssueProperties issue={issue} onUpdate={onUpdate} inline />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
