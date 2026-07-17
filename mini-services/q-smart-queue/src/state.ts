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
  getCalledTokens,
  getCompletedDurations,
  getMaxTokenNumber,
  getWaitingTokens,
  insertToken,
  updateTokenStatus,
} from "./db.js";
import type { ActivityEntry, QueueState, Token, TokenStatus } from "./types.js";

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
  };
}

/** Load durable state from SQLite into memory (called once on startup). */
export function hydrateFromDb(branchIds: string[]): void {
  for (const branchId of branchIds) {
    const s = ensure(branchId);
    s.queue = getWaitingTokens(branchId);
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

/** Customer joins the queue. Persists + pushes to live state. */
export function joinQueue(branchId: string, serviceType: string): Token {
  const s = ensure(branchId);
  s.counter += 1;
  const now = Date.now();
  const token: Token = {
    id: genId(),
    number: s.counter,
    branchId,
    serviceType,
    status: "waiting",
    position: 0,
    etaSec: 0,
    joinedAt: now,
    calledAt: null,
    completedAt: null,
    tellerId: null,
    serviceDurationSec: null,
  };
  s.queue.push(token);
  insertToken(token);
  const avg = computeAvg(s);
  return withPosition(token, s.queue.length, avg);
}

/** Teller calls the next waiting token. Returns the called token or null. */
export function callNext(branchId: string, tellerId: string): Token | null {
  const s = ensure(branchId);
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
