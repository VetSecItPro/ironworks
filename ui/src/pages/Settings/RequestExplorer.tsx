/**
 * Settings > Request/Response Explorer (G.25 adapter-call audit log).
 *
 * Architecture:
 *   FilterBar       - adapter_type, status, source dropdowns + agent_id input
 *   ColumnHeaders   - sticky header row
 *   CallRow         - one row per audit record in the virtual scroll list
 *   CallDrawer      - Sheet with full detail + SSE replay confirm dialog
 *   CompareView     - Sheet showing two selected calls side-by-side
 *
 * Pagination strategy: intersection observer on a sentinel div at the list
 * bottom. When the sentinel becomes visible and nextCursor is available,
 * the cursor is advanced to load the next page. Items accumulate locally
 * so the list never collapses between pages.
 *
 * Selection: max 2 items via checkbox; "Compare" button appears when exactly
 * 2 calls are selected.
 *
 * SSE replay: raw fetch() + ReadableStream — EventSource is GET-only, so we
 * parse the SSE frames manually. A confirm dialog prevents accidental spend.
 *
 * Redaction: promptPayload and responsePayload are rendered as-received.
 * The server already strips secret keys from adapterConfigSnapshot before
 * writing to the DB, and again on read in the route handler. This component
 * does not need additional client-side redaction.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { adapterCallsApi } from "../../api/adapter-calls";
import { useAdapterCallDetail, useAdapterCallList } from "../../hooks/useAdapterCalls";
import { relativeTime } from "../../lib/utils";
import type {
  AdapterCallListItem,
  AdapterCallListQuery,
  AdapterCallSource,
  AdapterCallStatus,
} from "../../types/adapter-calls";
import { SettingsProviderNav } from "./SettingsProviderNav";

// ── types ─────────────────────────────────────────────────────────────────────

interface FilterState {
  adapter_type: string;
  status: AdapterCallStatus | "";
  source: AdapterCallSource | "";
  agent_id: string;
}

const EMPTY_FILTERS: FilterState = {
  adapter_type: "",
  status: "",
  source: "",
  agent_id: "",
};

// ── helpers ───────────────────────────────────────────────────────────────────

function formatCents(cents: number | null): string {
  if (cents == null) return "-";
  return `$${(cents / 100).toFixed(4)}`;
}

function formatMs(ms: number | null): string {
  if (ms == null) return "-";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function formatTokens(n: number | null): string {
  return n == null ? "-" : n.toLocaleString();
}

// ── FilterBar ─────────────────────────────────────────────────────────────────

function FilterBar({ filters, onChange }: { filters: FilterState; onChange: (f: FilterState) => void }) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <Select
        value={filters.adapter_type || "all"}
        onValueChange={(v) => onChange({ ...filters, adapter_type: v === "all" ? "" : v })}
      >
        <SelectTrigger className="w-40" aria-label="Filter by adapter">
          <SelectValue placeholder="Adapter" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All adapters</SelectItem>
          <SelectItem value="anthropic_api">Anthropic</SelectItem>
          <SelectItem value="openai_api">OpenAI</SelectItem>
          <SelectItem value="openrouter_api">OpenRouter</SelectItem>
          <SelectItem value="poe_api">Poe</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.status || "all"}
        onValueChange={(v) => onChange({ ...filters, status: v === "all" ? "" : (v as AdapterCallStatus) })}
      >
        <SelectTrigger className="w-32" aria-label="Filter by status">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All status</SelectItem>
          <SelectItem value="success">Success</SelectItem>
          <SelectItem value="error">Error</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.source || "all"}
        onValueChange={(v) => onChange({ ...filters, source: v === "all" ? "" : (v as AdapterCallSource) })}
      >
        <SelectTrigger className="w-32" aria-label="Filter by source">
          <SelectValue placeholder="Source" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All sources</SelectItem>
          <SelectItem value="agent">Agent</SelectItem>
          <SelectItem value="playground">Playground</SelectItem>
          <SelectItem value="replay">Replay</SelectItem>
        </SelectContent>
      </Select>

      <Input
        className="w-64"
        placeholder="Agent ID (UUID)"
        value={filters.agent_id}
        onChange={(e) => onChange({ ...filters, agent_id: e.target.value })}
        aria-label="Filter by agent ID"
      />

      {(filters.adapter_type || filters.status || filters.source || filters.agent_id) && (
        <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

// ── ColumnHeaders ─────────────────────────────────────────────────────────────

function ColumnHeaders() {
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label on div for AT announcement of the column group
    <div
      className="grid items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border sticky top-0 bg-background z-10"
      style={{ gridTemplateColumns: "24px 1fr 120px 80px 80px 80px 80px 90px" }}
      aria-label="Column headers"
    >
      <span />
      <span>Adapter / Model</span>
      <span>Status</span>
      <span>Latency</span>
      <span>In tokens</span>
      <span>Out tokens</span>
      <span>Cost</span>
      <span>Time</span>
    </div>
  );
}

// ── CallRow ───────────────────────────────────────────────────────────────────

function CallRow({
  call,
  selected,
  onToggle,
  onClick,
}: {
  call: AdapterCallListItem;
  selected: boolean;
  onToggle: () => void;
  onClick: () => void;
}) {
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: row click is supplemental to the checkbox
    // biome-ignore lint/a11y/noStaticElementInteractions: row click is a convenience shortcut; checkbox handles accessible interaction
    <div
      className="grid items-center gap-2 px-3 py-2 border-b border-border hover:bg-muted/40 cursor-pointer text-sm"
      style={{ gridTemplateColumns: "24px 1fr 120px 80px 80px 80px 80px 90px" }}
      onClick={onClick}
    >
      <input
        type="checkbox"
        className="h-3 w-3"
        checked={selected}
        onChange={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label={`Select call ${call.id}`}
      />
      <div className="min-w-0">
        <div className="truncate font-medium">{call.adapterType}</div>
        <div className="truncate text-xs text-muted-foreground">{call.model}</div>
        {call.promptPreview && (
          <div className="truncate text-xs text-muted-foreground mt-0.5">{call.promptPreview}</div>
        )}
      </div>
      <div>
        <Badge variant={call.status === "success" ? "default" : "destructive"} className="text-xs">
          {call.status}
        </Badge>
      </div>
      <span className="text-xs tabular-nums">{formatMs(call.latencyMs)}</span>
      <span className="text-xs tabular-nums">{formatTokens(call.inputTokens)}</span>
      <span className="text-xs tabular-nums">{formatTokens(call.outputTokens)}</span>
      <span className="text-xs tabular-nums">{formatCents(call.costUsdCents)}</span>
      <span className="text-xs text-muted-foreground" title={call.occurredAt}>
        {relativeTime(call.occurredAt)}
      </span>
    </div>
  );
}

// ── CallDrawer ────────────────────────────────────────────────────────────────

function CallDrawer({
  companyId,
  callId,
  open,
  onClose,
}: {
  companyId: string;
  callId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: detail } = useAdapterCallDetail(companyId, callId);
  const [replayOutput, setReplayOutput] = useState<string>("");
  const [replayRunning, setReplayRunning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleReplayConfirm() {
    setConfirmOpen(false);
    if (!callId) return;
    setReplayRunning(true);
    setReplayOutput("");

    // SSE replay — adapterCallsApi.replayStream returns the raw Response so
    // we can read chunk frames manually (EventSource is GET-only).
    adapterCallsApi
      .replayStream(companyId, callId)
      .then(async (res) => {
        if (!res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
            if (dataLine) {
              try {
                const payload = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
                if (typeof payload.chunk === "string") {
                  setReplayOutput((prev) => prev + payload.chunk);
                }
              } catch {
                // Malformed SSE frame — skip
              }
            }
          }
        }
      })
      .finally(() => setReplayRunning(false));
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent className="w-[600px] sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Call Detail</SheetTitle>
          </SheetHeader>
          {detail && (
            <div className="mt-4 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">Adapter</div>
                  <div>{detail.adapterType}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Model</div>
                  <div>{detail.model}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Status</div>
                  <Badge variant={detail.status === "success" ? "default" : "destructive"}>{detail.status}</Badge>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Latency</div>
                  <div>{formatMs(detail.latencyMs)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Input tokens</div>
                  <div>{formatTokens(detail.inputTokens)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Output tokens</div>
                  <div>{formatTokens(detail.outputTokens)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Cost</div>
                  <div>{formatCents(detail.costUsdCents)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Source</div>
                  <div>{detail.source}</div>
                </div>
                {detail.replayOf && (
                  <div className="col-span-2">
                    <div className="text-xs text-muted-foreground">Replay of</div>
                    <div className="font-mono text-xs">{detail.replayOf}</div>
                  </div>
                )}
              </div>

              {detail.promptPayload != null && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Prompt payload</div>
                  <pre className="bg-muted rounded p-2 text-xs overflow-x-auto max-h-48 whitespace-pre-wrap">
                    {JSON.stringify(detail.promptPayload, null, 2)}
                  </pre>
                </div>
              )}

              {detail.responsePayload != null && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Response payload</div>
                  <pre className="bg-muted rounded p-2 text-xs overflow-x-auto max-h-48 whitespace-pre-wrap">
                    {JSON.stringify(detail.responsePayload, null, 2)}
                  </pre>
                </div>
              )}

              {replayOutput && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Replay output</div>
                  <pre className="bg-muted rounded p-2 text-xs overflow-x-auto max-h-48 whitespace-pre-wrap">
                    {replayOutput}
                  </pre>
                </div>
              )}

              <Button variant="outline" size="sm" disabled={replayRunning} onClick={() => setConfirmOpen(true)}>
                {replayRunning ? "Replaying..." : "Replay call"}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replay this call?</DialogTitle>
            <DialogDescription>
              This will re-send the original prompt to the provider and consume API credits. The original call record
              will not be modified.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleReplayConfirm}>Confirm replay</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── CompareView ───────────────────────────────────────────────────────────────

function CompareView({
  companyId,
  callIds,
  open,
  onClose,
}: {
  companyId: string;
  callIds: [string, string];
  open: boolean;
  onClose: () => void;
}) {
  const { data: a } = useAdapterCallDetail(companyId, callIds[0]);
  const { data: b } = useAdapterCallDetail(companyId, callIds[1]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[900px] sm:max-w-4xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Compare calls</SheetTitle>
        </SheetHeader>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          {([a, b] as const).map((call, idx) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: positional pair
            <div key={idx} className="space-y-3">
              <div className="font-medium text-xs text-muted-foreground">Call {idx + 1}</div>
              {call ? (
                <>
                  <div>
                    <span className="text-xs text-muted-foreground">Adapter: </span>
                    {call.adapterType}
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Model: </span>
                    {call.model}
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Status: </span>
                    <Badge variant={call.status === "success" ? "default" : "destructive"}>{call.status}</Badge>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Latency: </span>
                    {formatMs(call.latencyMs)}
                  </div>
                  {call.promptPayload != null && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Prompt</div>
                      <pre className="bg-muted rounded p-2 text-xs overflow-x-auto max-h-40 whitespace-pre-wrap">
                        {JSON.stringify(call.promptPayload, null, 2)}
                      </pre>
                    </div>
                  )}
                  {call.responsePayload != null && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Response</div>
                      <pre className="bg-muted rounded p-2 text-xs overflow-x-auto max-h-40 whitespace-pre-wrap">
                        {JSON.stringify(call.responsePayload, null, 2)}
                      </pre>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-muted-foreground">Loading...</div>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── RequestExplorer (page) ────────────────────────────────────────────────────

export function RequestExplorer({ companyId }: { companyId: string }) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allItems, setAllItems] = useState<AdapterCallListItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerCallId, setDrawerCallId] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const query: AdapterCallListQuery = {
    ...(filters.adapter_type && { adapter_type: filters.adapter_type }),
    ...(filters.status && { status: filters.status }),
    ...(filters.source && { source: filters.source }),
    ...(filters.agent_id && { agent_id: filters.agent_id }),
    ...(cursor && { cursor }),
  };

  const { data, isLoading, error } = useAdapterCallList(companyId, query);

  // Accumulate pages — reset accumulated list when cursor resets to undefined
  useEffect(() => {
    if (!cursor) setAllItems([]);
  }, [cursor]);

  useEffect(() => {
    if (data?.items) {
      setAllItems((prev) => (cursor ? [...prev, ...data.items] : data.items));
    }
  }, [data, cursor]);

  // Reset cursor and accumulated items when filters change
  const handleFilterChange = useCallback((f: FilterState) => {
    setFilters(f);
    setCursor(undefined);
    setAllItems([]);
  }, []);

  // Advance cursor when sentinel enters the viewport
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && data?.nextCursor && !isLoading) {
          setCursor(data.nextCursor);
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [data?.nextCursor, isLoading]);

  // SSR-safe: prefer accumulated allItems, fall back to first page data
  const displayItems = allItems.length > 0 ? allItems : (data?.items ?? []);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 2) {
        // Limit to 2 selections for compare mode
        next.add(id);
      }
      return next;
    });
  }

  const selectedPair = selectedIds.size === 2 ? ([...selectedIds] as [string, string]) : null;

  return (
    <div className="p-6 max-w-full">
      <SettingsProviderNav />

      <h1 className="text-xl font-semibold mb-4">Request / Response Explorer</h1>

      <FilterBar filters={filters} onChange={handleFilterChange} />

      {selectedPair && (
        <div className="mb-3">
          <Button size="sm" onClick={() => setCompareOpen(true)}>
            Compare 2 calls
          </Button>
        </div>
      )}

      <div className="rounded-md border border-border overflow-hidden">
        <ColumnHeaders />

        {error && (
          <div className="px-4 py-3 text-sm text-destructive">Failed to load adapter calls: {error.message}</div>
        )}

        {!error && displayItems.length === 0 && !isLoading && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No adapter calls found. Calls appear here after agents or playground sessions run.
          </div>
        )}

        {displayItems.map((call) => (
          <CallRow
            key={call.id}
            call={call}
            selected={selectedIds.has(call.id)}
            onToggle={() => toggleSelect(call.id)}
            onClick={() => setDrawerCallId(call.id)}
          />
        ))}

        {isLoading && <div className="px-4 py-3 text-sm text-muted-foreground">Loading...</div>}

        {/* Sentinel div for infinite scroll — triggers next-page load on intersection */}
        <div ref={sentinelRef} className="h-1" aria-hidden="true" />
      </div>

      <CallDrawer
        companyId={companyId}
        callId={drawerCallId}
        open={drawerCallId !== null}
        onClose={() => setDrawerCallId(null)}
      />

      {selectedPair && (
        <CompareView
          companyId={companyId}
          callIds={selectedPair}
          open={compareOpen}
          onClose={() => setCompareOpen(false)}
        />
      )}
    </div>
  );
}
