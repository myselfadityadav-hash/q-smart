// Shared domain types for the Q-Smart queue backend.
// These mirror the contract consumed by the Next.js frontend.

export type TokenStatus = "waiting" | "called" | "completed" | "no_show" | "cancelled";

export type TokenPriority = "regular" | "express" | "vip";

export interface ServiceType {
  id: string;
  name: string;
  /** Estimated service duration in seconds (used as ETA fallback). */
  estimatedSec: number;
  active: boolean;
}

export interface Branch {
  id: string;
  name: string;
  location: string;
  active: boolean;
  /** Whether token numbers reset to 1 at the start of each new day. */
  dailyResetEnabled: boolean;
}

export interface Teller {
  id: string;
  name: string;
  branchId: string;
  pin: string;
  active: boolean;
}

export interface Admin {
  id: string;
  username: string;
  pin: string;
  active: boolean;
  createdAt: number;
}

export interface Token {
  id: string;
  number: number;
  branchId: string;
  serviceType: string;
  status: TokenStatus;
  /** Priority level: vip > express > regular. */
  priority: TokenPriority;
  /** 1-based position while waiting; 0 once called/completed. */
  position: number;
  /** Estimated wait time in seconds (position-based). */
  etaSec: number;
  /** Predicted ETA recorded at join time, used for accuracy tracking. */
  predictedEtaSec: number | null;
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
  /** IDs of tellers who have paused their counter. */
  pausedTellers: string[];
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
