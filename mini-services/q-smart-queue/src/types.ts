// Shared domain types for the Q-Smart queue backend.
// These mirror the contract consumed by the Next.js frontend.

export type TokenStatus = "waiting" | "called" | "completed" | "no_show" | "cancelled";

export interface ServiceType {
  id: string;
  name: string;
  /** Estimated service duration in seconds (used as ETA fallback). */
  estimatedSec: number;
}

export interface Branch {
  id: string;
  name: string;
  location: string;
}

export interface Teller {
  id: string;
  name: string;
  branchId: string;
}

export interface Token {
  id: string;
  number: number;
  branchId: string;
  serviceType: string;
  status: TokenStatus;
  /** 1-based position while waiting; 0 once called/completed. */
  position: number;
  /** Estimated wait time in seconds (position-based). */
  etaSec: number;
  joinedAt: number; // epoch ms
  calledAt: number | null;
  completedAt: number | null;
  tellerId: string | null;
  serviceDurationSec: number | null;
}

export interface QueueState {
  branchId: string;
  nowServing: Token | null;
  /** All currently-being-served tokens (one per active teller). */
  nowServingList: Token[];
  queue: Token[];
  waitingCount: number;
  avgServiceTimeSec: number;
  servedToday: number;
  noShowToday: number;
  lastServiceTimeSec: number | null;
}

export interface ActivityEntry {
  id: string;
  number: number;
  serviceType: string;
  status: "completed" | "no_show";
  tellerId: string | null;
  tellerName: string | null;
  calledAt: number | null;
  completedAt: number | null;
  serviceDurationSec: number | null;
}
