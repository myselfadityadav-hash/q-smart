// In-memory live queue state (the "Redis" equivalent).
// Source of truth for the *current* queue; SQLite (db.ts) is the durable audit log.
// On startup the live state is rebuilt from the database so a restart never
// loses waiting customers.
//
// Multi-counter support: each teller has their own "currently serving" entry.
// `nowServing` is kept as the first/primary one for backwards compatibility;
// `currentlyServing` is the per-teller map that holds ALL active tellers.

import {
  countByStatusToday,
  getBranchById,
  getCalledTokens,
  getCompletedDurations,
  getMaxTokenNumber,
  getMaxTokenNumberToday,
  getWaitingTokens,
  insertToken,
  setBranchLastResetDay,
  updateTokenServiceType,
  updateTokenStatus,
} from "./db.js";
import type { QueueState, Token, TokenPriority, TokenStatus } from "./types.js";

const ROLLING_WINDOW = 20; // last N completed services used for the rolling average
const DEFAULT_AVG_SEC = 180; // fallback ETA per-position when no history exists

interface BranchLiveState {
  queue: Token[]; // waiting tokens, in FIFO order
  /** Per-teller currently-serving token. Key = tellerId. */
  currentlyServing: Map<string, Token>;
  counter: number; // last issued token number
  recentDurations: number[]; // most-recent-first completed service durations
}

const live = new Map<string, BranchLiveState>();

/** Paused tellers set — tracks which tellers are paused (across all branches). */
const pausedTellers = new Set<string>();

function ensure(branchId: string): BranchLiveState {
  let s = live.get(branchId);
  if (!s) {
    s = { queue: [], currentlyServing: new Map(), counter: 0, recentDurations: [] };
    live.set(branchId, s);
  }
  return s;
}

/** Recompute the rolling-average service time for a branch (seconds). */
function computeAvg(s: BranchLiveState): number {
  if (s.recentDurations.length === 0) return DEFAULT_AVG_SEC;
  const sum = s.recentDurations.reduce((a, b) => a + b, 0);
  return Math.round(sum / s.recentDurations.length);
}

function avgFor(branchId: string): number {
  return computeAvg(ensure(branchId));
}

function withPosition(token: Token, position: number, avgSec: number): Token {
  return {
    ...token,
    position,
    etaSec: position > 0 ? position * avgSec : 0,
  };
}

/** Build the full queue-state snapshot for a branch (with positions/ETAs). */
export function buildQueueState(branchId: string): QueueState {
  const s = ensure(branchId);
  const avg = computeAvg(s);
  const queue = s.queue.map((t, i) => withPosition(t, i + 1, avg));
  const nowServingList = Array.from(s.currentlyServing.values()).map((t) =>
    withPosition(t, 0, 0)
  );
  // Backwards compat: primary nowServing is the first entry (or null).
  const nowServing = nowServingList.length > 0 ? nowServingList[0] : null;
  return {
    branchId,
    nowServing,
    nowServingList,
    queue,
    waitingCount: s.queue.length,
    avgServiceTimeSec: avg,
    servedToday: countByStatusToday(branchId, "completed"),
    noShowToday: countByStatusToday(branchId, "no_show"),
    lastServiceTimeSec: s.recentDurations[0] ?? null,
    pausedTellers: Array.from(pausedTellers),
  };
}

/** Load durable state from SQLite into memory (called once on startup). */
export function hydrateFromDb(branchIds: string[]): void {
  for (const branchId of branchIds) {
    const s = ensure(branchId);
    s.queue = getWaitingTokens(branchId);
    sortQueue(s.queue); // sort by priority after loading from DB
    // Load all called tokens (one per teller).
    const calledTokens = getCalledTokens(branchId);
    for (const t of calledTokens) {
      if (t.tellerId) {
        s.currentlyServing.set(t.tellerId, t);
      }
    }
    s.counter = getMaxTokenNumber(branchId);
    s.recentDurations = getCompletedDurations(branchId, ROLLING_WINDOW);
  }
}

function genId(): string {
  return `tk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class QueueError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Priority weight: higher = served first. */
const PRIORITY_WEIGHT: Record<TokenPriority, number> = {
  vip: 3,
  express: 2,
  regular: 1,
};

/** Sort queue by priority (desc) then by joinedAt (asc). */
function sortQueue(queue: Token[]): void {
  queue.sort((a, b) => {
    const wa = PRIORITY_WEIGHT[a.priority] ?? 1;
    const wb = PRIORITY_WEIGHT[b.priority] ?? 1;
    if (wb !== wa) return wb - wa; // higher priority first
    return a.joinedAt - b.joinedAt; // FIFO within same priority
  });
}

/** Customer joins the queue. Persists + pushes to live state. */
export function joinQueue(branchId: string, serviceType: string, priority: TokenPriority = "regular"): Token {
  const s = ensure(branchId);

  // Daily reset: if the branch has daily-reset enabled and the day has changed,
  // reset the in-memory counter so token numbers start from 1 again.
  maybeDailyReset(branchId, s);

  s.counter += 1;
  const now = Date.now();
  // Predicted ETA = current position * avg service time (computed before push).
  const avg = computeAvg(s);
  const predictedPosition = s.queue.length + 1;
  const predictedEta = predictedPosition * avg;
  const token: Token = {
    id: genId(),
    number: s.counter,
    branchId,
    serviceType,
    status: "waiting",
    priority,
    position: 0,
    etaSec: 0,
    predictedEtaSec: predictedEta,
    joinedAt: now,
    calledAt: null,
    completedAt: null,
    tellerId: null,
    serviceDurationSec: null,
  };
  s.queue.push(token);
  sortQueue(s.queue);
  insertToken(token);
  const idx = s.queue.findIndex((t) => t.id === token.id);
  return withPosition(token, idx + 1, avg);
}

/** Format YYYY-MM-DD for the local timezone. */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** If daily-reset is enabled for this branch and the day has rolled over, reset counter. */
function maybeDailyReset(branchId: string, s: BranchLiveState): void {
  const branch = getBranchById(branchId);
  if (!branch || !branch.dailyResetEnabled) return;
  const today = todayKey();
  const lastReset = (branch as Branch & { lastResetDay?: string | null }).lastResetDay;
  if (lastReset !== today) {
    // Reset the counter to today's max token (so we don't reuse numbers from earlier today).
    s.counter = getMaxTokenNumberToday(branchId);
    setBranchLastResetDay(branchId, today);
    console.log(`[daily-reset] Branch ${branchId} counter reset to ${s.counter} for ${today}`);
  }
}

/** Teller calls the next waiting token. Returns the called token or null. */
export function callNext(branchId: string, tellerId: string): Token | null {
  const s = ensure(branchId);

  // Check if teller is paused.
  if (pausedTellers.has(tellerId)) {
    throw new QueueError(409, "Your counter is paused. Resume before calling next.");
  }

  // Check if THIS teller already has someone being served.
  if (s.currentlyServing.has(tellerId)) {
    throw new QueueError(
      409,
      "You are already serving a customer. Complete or mark no-show first."
    );
  }
  const token = s.queue.shift();
  if (!token) return null;
  const now = Date.now();
  token.status = "called";
  token.calledAt = now;
  token.tellerId = tellerId;
  s.currentlyServing.set(tellerId, token);
  updateTokenStatus(token.id, "called", now, null, tellerId, null);
  return withPosition(token, 0, 0);
}

/** Teller completes service for their currently-served token. */
export function completeService(
  branchId: string,
  tellerId: string
): { token: Token; serviceTimeSec: number } {
  const s = ensure(branchId);
  const token = s.currentlyServing.get(tellerId);
  if (!token) {
    throw new QueueError(409, "You are not currently serving any customer.");
  }
  const now = Date.now();
  const duration = token.calledAt ? Math.max(1, Math.round((now - token.calledAt) / 1000)) : 0;
  token.status = "completed";
  token.completedAt = now;
  token.serviceDurationSec = duration;
  token.tellerId = tellerId;
  s.currentlyServing.delete(tellerId);
  s.recentDurations.unshift(duration);
  if (s.recentDurations.length > ROLLING_WINDOW) s.recentDurations.pop();
  updateTokenStatus(token.id, "completed", null, now, tellerId, duration);
  return { token: withPosition(token, 0, 0), serviceTimeSec: duration };
}

/** Teller marks their currently-served token as a no-show. */
export function markNoShow(branchId: string, tellerId: string): Token {
  const s = ensure(branchId);
  const token = s.currentlyServing.get(tellerId);
  if (!token) {
    throw new QueueError(409, "You are not currently serving any customer.");
  }
  const now = Date.now();
  token.status = "no_show";
  token.completedAt = now;
  token.tellerId = tellerId;
  s.currentlyServing.delete(tellerId);
  updateTokenStatus(token.id, "no_show", null, now, tellerId, null);
  return withPosition(token, 0, 0);
}

/** Customer voluntarily leaves the queue (by token id). */
export function leaveQueue(tokenId: string): Token | null {
  for (const [branchId, s] of live.entries()) {
    const idx = s.queue.findIndex((t) => t.id === tokenId);
    if (idx >= 0) {
      const [token] = s.queue.splice(idx, 1);
      token.status = "cancelled";
      updateTokenStatus(token.id, "cancelled", null, Date.now(), null, null);
      return withPosition(token, 0, 0);
    }
  }
  return null;
}

/** Get all currently-being-served tokens for a branch (one per active teller). */
export function getCurrentlyServing(branchId: string): Token[] {
  const s = ensure(branchId);
  return Array.from(s.currentlyServing.values());
}

/** Reset all waiting tokens for a branch, clear all currently serving, reset counter. */
export function resetBranch(branchId: string): number {
  const s = ensure(branchId);
  const clearedCount = s.queue.length + s.currentlyServing.size;

  // Cancel all waiting tokens in DB.
  for (const token of s.queue) {
    token.status = "cancelled";
    updateTokenStatus(token.id, "cancelled", null, Date.now(), null, null);
  }

  // Cancel all currently-serving tokens in DB.
  for (const [, token] of s.currentlyServing) {
    token.status = "cancelled";
    updateTokenStatus(token.id, "cancelled", null, Date.now(), null, null);
  }

  // Clear in-memory state.
  s.queue = [];
  s.currentlyServing.clear();
  // Note: we do NOT reset the counter so token numbers remain unique ever-incrementing.

  return clearedCount;
}

// ---------- Pause / Resume Counter ----------

/** Pause a teller's counter (they cannot call next while paused). */
export function pauseTeller(branchId: string, tellerId: string): void {
  pausedTellers.add(tellerId);
}

/** Resume a paused teller's counter. */
export function resumeTeller(branchId: string, tellerId: string): void {
  pausedTellers.delete(tellerId);
}

/** Check if a teller is currently paused. */
export function isTellerPaused(tellerId: string): boolean {
  return pausedTellers.has(tellerId);
}

// ---------- Transfer Token ----------

/** Transfer a waiting token to a different service type. */
export function transferToken(branchId: string, tokenId: string, newServiceType: string): Token | null {
  const s = ensure(branchId);
  // Find the token in the waiting queue.
  const token = s.queue.find((t) => t.id === tokenId);
  if (!token) return null;
  if (token.status !== "waiting") return null;
  // Update in memory.
  token.serviceType = newServiceType;
  // Persist to DB.
  updateTokenServiceType(tokenId, newServiceType);
  return token;
}
