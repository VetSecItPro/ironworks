/**
 * Dashboard / War Room domain types
 *
 * Types shared between the Dashboard page and its sub-components.
 */

import type { ActivityEvent, LiveEvent } from "@ironworksai/shared";

/** Wrapper around a raw SSE LiveEvent with UI metadata. */
export interface LiveFeedEvent {
  id: string;
  sseType: string;
  receivedAt: Date;
  event: LiveEvent;
}

/** A group of consecutive activity events collapsed into a single row. */
export interface AggregatedGroup {
  key: string;
  action: string;
  actorName: string;
  count: number;
  models: string[];
  latestEvent: ActivityEvent;
  events: ActivityEvent[];
}
