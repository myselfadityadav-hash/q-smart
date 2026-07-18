// Shared domain types — mirror the backend contract (mini-services/q-smart-queue).

export type TokenStatus =
  | "waiting"
  | "called"
  | "completed"
  | "no_show"
  | "cancelled";

export type TokenPriority = "regular" | "express" | "vip";

export interface ServiceType {
  id: string;
  name: string;
  estimatedSec: number;
  active?: boolean;
}

export interface Branch {
  id: string;
  name: string;
  location: string;
  active?: boolean | number;
  /** Whether token numbers reset to 1 at the start of each new day. */
  dailyResetEnabled?: boolean | number;
}

export interface Teller {
  id: string;
  name: string;
  branchId: string;
  pin?: string;
  active?: boolean | number;
}

export interface Admin {
  id: string;
  username: string;
}

export interface Token {
  id: string;
  number: number;
  branchId: string;
  serviceType: string;
  status: TokenStatus;
  priority: TokenPriority;
  position: number;
  etaSec: number;
  /** Predicted ETA recorded at join time (used for accuracy tracking). */
  predictedEtaSec?: number | null;
  joinedAt: number;
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

export interface HourlyStat {
  hour: string;
  served: number;
  noShow: number;
  avgDuration: number;
}

export interface FeedbackStats {
  avgRating: number;
  totalResponses: number;
  distribution: { rating1: number; rating2: number; rating3: number };
}

export interface EtaAccuracyStats {
  sampleSize: number;
  avgPredictedSec: number;
  avgActualSec: number;
  avgErrorSec: number;
  /** Mean absolute percentage error, 0..1. */
  mape: number;
  /** Percentage of tokens whose actual wait was within ±60s of predicted. */
  within60sPct: number;
  /** Distribution buckets: how many fell into each accuracy band. */
  buckets: { under: number; close: number; over: number };
}

export interface EtaConfidence {
  sampleSize: number;
  within60sPct: number;
  mape: number;
  confidence: "high" | "medium" | "low";
}
