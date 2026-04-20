import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaymentMethodCardProps {
  onManage: () => void;
  isManaging: boolean;
}

export function PaymentMethodCard({ onManage, isManaging }: PaymentMethodCardProps) {
  return (
    <div className="border rounded-lg p-5 space-y-3">
      <div className="flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Payment Method</h2>
      </div>
      <div className="flex items-center gap-3 rounded-md border border-border px-4 py-3">
        <div className="h-8 w-12 rounded bg-gradient-to-r from-blue-600 to-blue-800 flex items-center justify-center">
          <CreditCard className="h-4 w-4 text-white" />
        </div>
        <div>
          <div className="text-sm font-medium">Visa ending in 4242</div>
          <div className="text-xs text-muted-foreground">Expires 12/2027</div>
        </div>
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={onManage} disabled={isManaging}>
            Update
          </Button>
        </div>
      </div>
    </div>
  );
}
