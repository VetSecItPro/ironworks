import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Gamepad2, Hash, KeyRound, Loader2, Mail, MessageCircle, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { type MessagingBridge, messagingApi } from "../api/messaging";
import { Field } from "./agent-config-primitives";

interface MessagingSetupProps {
  companyId: string;
}

export function MessagingSetup({ companyId }: MessagingSetupProps) {
  const _queryClient = useQueryClient();
  const queryKey = ["messaging", "bridges", companyId];

  const bridgesQuery = useQuery({
    queryKey,
    queryFn: () => messagingApi.listBridges(companyId),
    enabled: !!companyId,
  });

  const data = bridgesQuery.data;
  const telegramBridge = data?.bridges.find((b) => b.platform === "telegram") ?? null;

  return (
    <div className="space-y-4">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <MessageCircle className="h-3.5 w-3.5" />
        Messaging Bridges
      </div>

      {bridgesQuery.isLoading && (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading messaging configuration...
        </div>
      )}

      {bridgesQuery.isError && <div className="text-sm text-destructive">Failed to load messaging configuration.</div>}

      {data && (
        <div className="space-y-3">
          {/* Email */}
          <EmailBridgeCard address={data.email.address} status={data.email.status} note={data.email.note} />

          {/* Telegram */}
          <TelegramBridgeCard companyId={companyId} bridge={telegramBridge} queryKey={queryKey} />

          {/* Slack - Planned */}
          <PlannedPlatformCard platform="Slack" icon={<Hash className="h-4 w-4 text-muted-foreground" />} />

          {/* Discord - Planned */}
          <PlannedPlatformCard platform="Discord" icon={<Gamepad2 className="h-4 w-4 text-muted-foreground" />} />
        </div>
      )}
    </div>
  );
}

// ── Email Card ──

function EmailBridgeCard({ address, status, note }: { address: string | null; status: string; note: string }) {
  // Surface the real backend status. "ready" = webhook secret set; "inactive"
  // = bridge disabled. The label/colour drives operator expectations so the
  // card matches whether email actually works.
  const isReady = status === "ready";
  return (
    <div className="rounded-md border border-border px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Email</span>
        </div>
        <StatusBadge status={isReady ? "auto_configured" : "disconnected"} label={isReady ? "Ready" : "Inactive"} />
      </div>
      {address && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">
            Reserved inbound address {isReady ? "" : "(not yet receiving mail)"}:
          </div>
          <code
            className={`block text-xs rounded px-2 py-1.5 font-mono select-all ${
              isReady ? "bg-muted/50" : "bg-muted/30 text-muted-foreground line-through decoration-1"
            }`}
          >
            {address}
          </code>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

// ── Telegram Card ──

function TelegramBridgeCard({
  companyId,
  bridge,
  queryKey,
}: {
  companyId: string;
  bridge: MessagingBridge | null;
  queryKey: unknown[];
}) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");
  const [showTokenInput, setShowTokenInput] = useState(false);

  const configureMutation = useMutation({
    mutationFn: (botToken: string) => messagingApi.configureTelegram(companyId, botToken),
    onSuccess: () => {
      setToken("");
      setShowTokenInput(false);
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => messagingApi.removeTelegram(companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const resetOwnerMutation = useMutation({
    mutationFn: () => messagingApi.resetTelegramOwner(companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const testMutation = useMutation({
    mutationFn: () => messagingApi.testTelegram(companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const isConnected = bridge?.status === "connected";
  const isError = bridge?.status === "error";
  const botUsername = (bridge?.config as { botUsername?: string })?.botUsername;
  const ownerChatId = (bridge?.config as { ownerChatId?: string })?.ownerChatId;
  const persistedAllowedChatIds = (bridge?.config as { allowedChatIds?: string[] })?.allowedChatIds ?? [];

  // SEC-CHAOS-002: pre-registered chatId allowlist editor. Empty list = legacy
  // first-claimer mode; populated list = strict gate (only listed chatIds reach
  // the CEO chat loop). Each line is one chatId.
  const [allowedChatIdsText, setAllowedChatIdsText] = useState<string>(persistedAllowedChatIds.join("\n"));

  // Reset the textarea when the persisted value changes (after a successful
  // save or a fresh fetch). Depending on the joined string keeps the effect
  // stable across the array-identity churn from each react-query render.
  const persistedKey = persistedAllowedChatIds.join(",");
  useEffect(() => {
    setAllowedChatIdsText(persistedKey.length === 0 ? "" : persistedKey.replace(/,/g, "\n"));
  }, [persistedKey]);

  const updateAllowedMutation = useMutation({
    mutationFn: (ids: string[]) => messagingApi.updateTelegramAllowedChatIds(companyId, ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return (
    <div className="rounded-md border border-border px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-medium">Telegram</span>
        </div>
        {bridge ? (
          <StatusBadge
            status={bridge.status}
            label={
              isConnected ? `Connected${botUsername ? ` (@${botUsername})` : ""}` : isError ? "Error" : "Disconnected"
            }
          />
        ) : (
          <StatusBadge status="disconnected" label="Not configured" />
        )}
      </div>

      {/* Connected state */}
      {bridge && isConnected && (
        <div className="space-y-2">
          {botUsername && (
            <div className="text-xs text-muted-foreground">
              Bot: @{botUsername} {bridge.running ? "(running)" : "(stopped)"}
            </div>
          )}
          {ownerChatId && (
            <div className="text-xs text-muted-foreground">
              Owner chat ID: <code className="font-mono">{ownerChatId}</code>
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
              {testMutation.isPending ? (
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1.5" />
              )}
              Test Connection
            </Button>
            {ownerChatId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (
                    window.confirm(
                      "Reset Telegram owner? The next message to the bot will claim ownership. The current owner will lose access until they re-claim.",
                    )
                  ) {
                    resetOwnerMutation.mutate();
                  }
                }}
                disabled={resetOwnerMutation.isPending}
                title="Clear current owner so a new operator can claim the bot"
              >
                {resetOwnerMutation.isPending ? (
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                ) : (
                  <KeyRound className="h-3 w-3 mr-1.5" />
                )}
                Reset Owner
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (window.confirm("Disconnect Telegram bridge? The bot will stop responding.")) {
                  removeMutation.mutate();
                }
              }}
              disabled={removeMutation.isPending}
            >
              <Trash2 className="h-3 w-3 mr-1.5" />
              Disconnect
            </Button>
          </div>
          {testMutation.isSuccess && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <Check className="h-3 w-3" /> Connection verified
            </span>
          )}

          {/* SEC-CHAOS-002: pre-registered chatId allowlist. Empty list keeps the legacy
              first-claimer single-owner mode; one chatId per line locks the bot to those operators. */}
          <div className="space-y-1.5 pt-2 border-t border-border/50">
            <Field
              label="Allowed chat IDs"
              hint="One chat ID per line. Leave empty to allow the first chat that messages the bot to claim ownership (legacy mode). Populated → only listed chat IDs can interact."
            >
              <textarea
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm font-mono outline-none min-h-[72px]"
                value={allowedChatIdsText}
                onChange={(e) => setAllowedChatIdsText(e.target.value)}
                placeholder="123456789&#10;987654321"
                spellCheck={false}
              />
            </Field>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const ids = allowedChatIdsText
                    .split(/\r?\n/)
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0);
                  updateAllowedMutation.mutate(ids);
                }}
                disabled={updateAllowedMutation.isPending}
              >
                {updateAllowedMutation.isPending ? (
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                ) : (
                  <Check className="h-3 w-3 mr-1.5" />
                )}
                Save allowed chat IDs
              </Button>
              {persistedAllowedChatIds.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {persistedAllowedChatIds.length} chat ID{persistedAllowedChatIds.length === 1 ? "" : "s"} active
                </span>
              )}
            </div>
            {updateAllowedMutation.isError && (
              <p className="text-xs text-destructive">
                {updateAllowedMutation.error instanceof Error
                  ? updateAllowedMutation.error.message
                  : "Failed to save allowed chat IDs"}
              </p>
            )}
            {updateAllowedMutation.isSuccess && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <Check className="h-3 w-3" /> Allowed chat IDs saved
              </span>
            )}
          </div>
        </div>
      )}

      {/* Error state */}
      {bridge && isError && (
        <div className="space-y-2">
          <p className="text-xs text-destructive">{bridge.lastError ?? "Connection error. Try reconfiguring."}</p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowTokenInput(true)}>
              Reconfigure
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending}
            >
              <Trash2 className="h-3 w-3 mr-1.5" />
              Remove
            </Button>
          </div>
        </div>
      )}

      {/* Not configured or reconfigure state */}
      {(!bridge || showTokenInput) && (
        <div className="space-y-2">
          <Field label="Bot Token" hint="Get a token from @BotFather on Telegram. Send /newbot and follow the prompts.">
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm font-mono outline-none"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
              autoComplete="off"
            />
          </Field>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => configureMutation.mutate(token)}
              disabled={configureMutation.isPending || token.trim().length < 10}
            >
              {configureMutation.isPending ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                  Connecting...
                </>
              ) : (
                "Connect"
              )}
            </Button>
            {showTokenInput && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowTokenInput(false);
                  setToken("");
                }}
              >
                Cancel
              </Button>
            )}
          </div>
          {configureMutation.isError && (
            <p className="text-xs text-destructive">
              {configureMutation.error instanceof Error ? configureMutation.error.message : "Failed to connect"}
            </p>
          )}
        </div>
      )}

      {removeMutation.isError && (
        <p className="text-xs text-destructive">
          {removeMutation.error instanceof Error ? removeMutation.error.message : "Failed to disconnect"}
        </p>
      )}
    </div>
  );
}

// ── Planned Platform Card ──

function PlannedPlatformCard({ platform, icon }: { platform: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border px-4 py-3 opacity-60">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium">{platform}</span>
        </div>
        <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">Planned</span>
      </div>
    </div>
  );
}

// ── Status Badge ──

function StatusBadge({ status, label }: { status: string; label: string }) {
  const colors: Record<string, string> = {
    connected: "bg-green-500/10 text-green-600 dark:text-green-400",
    auto_configured: "bg-green-500/10 text-green-600 dark:text-green-400",
    disconnected: "bg-muted text-muted-foreground",
    error: "bg-destructive/10 text-destructive",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
        colors[status] ?? colors.disconnected
      }`}
    >
      {(status === "connected" || status === "auto_configured") && (
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
      )}
      {status === "error" && <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive" />}
      {label}
    </span>
  );
}
