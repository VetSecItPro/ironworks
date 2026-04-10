import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type SecretMessage = {
  title: string;
  webhookUrl: string;
  webhookSecret: string;
};

export function SecretMessageBanner({
  secretMessage,
  onCopy,
}: {
  secretMessage: SecretMessage;
  onCopy: (label: string, value: string) => void;
}) {
  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 space-y-3 text-sm">
      <div>
        <p className="font-medium">{secretMessage.title}</p>
        <p className="text-xs text-muted-foreground">Save this now. Ironworks will not show the secret value again.</p>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Input value={secretMessage.webhookUrl} readOnly className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => onCopy("Webhook URL", secretMessage.webhookUrl)}>
            <Copy className="h-3.5 w-3.5 mr-1" />
            URL
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Input value={secretMessage.webhookSecret} readOnly className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => onCopy("Webhook secret", secretMessage.webhookSecret)}>
            <Copy className="h-3.5 w-3.5 mr-1" />
            Secret
          </Button>
        </div>
      </div>
    </div>
  );
}
