// REST API helpers for the Q-Smart backend. All calls use relative URLs and
// route through the gateway via ?XTransformPort=3004.

import { restUrl } from "./config";
import type { ActivityEntry, Branch, QueueState, ServiceType, Teller, Token } from "./types";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "error" in data && String((data as { error: unknown }).error)) ||
      `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export const api = {
  health: () => jsonFetch<{ ok: boolean }>(restUrl("/api/health")),
  listBranches: () => jsonFetch<Branch[]>(restUrl("/api/branches")),
  listServiceTypes: () => jsonFetch<ServiceType[]>(restUrl("/api/service-types")),
  listTellers: () => jsonFetch<Teller[]>(restUrl("/api/tellers")),
  listTellersByBranch: (branchId: string) =>
    jsonFetch<Teller[]>(restUrl(`/api/tellers/${encodeURIComponent(branchId)}`)),
  getQueue: (branchId: string) =>
    jsonFetch<QueueState>(restUrl(`/api/queue/${encodeURIComponent(branchId)}`)),

  joinQueue: (branchId: string, serviceType: string) =>
    jsonFetch<{ token: Token }>(restUrl("/api/queue/join"), {
      method: "POST",
      body: JSON.stringify({ branchId, serviceType }),
    }),

  leaveQueue: (tokenId: string) =>
    jsonFetch<{ ok: boolean }>(restUrl("/api/queue/leave"), {
      method: "POST",
      body: JSON.stringify({ tokenId }),
    }),

  callNext: (branchId: string, tellerId: string) =>
    jsonFetch<{ token: Token | null; state: QueueState }>(restUrl("/api/teller/next"), {
      method: "POST",
      body: JSON.stringify({ branchId, tellerId }),
    }),

  completeService: (branchId: string, tellerId: string) =>
    jsonFetch<{ ok: boolean; token: Token; serviceTimeSec: number; state: QueueState }>(
      restUrl("/api/teller/complete"),
      { method: "POST", body: JSON.stringify({ branchId, tellerId }) }
    ),

  markNoShow: (branchId: string, tellerId: string) =>
    jsonFetch<{ ok: boolean; state: QueueState }>(restUrl("/api/teller/no-show"), {
      method: "POST",
      body: JSON.stringify({ branchId, tellerId }),
    }),

  /** Get all currently-being-served tokens for a branch (multi-counter). */
  getServing: (branchId: string) =>
    jsonFetch<{ serving: Token[] }>(
      restUrl(`/api/teller/serving/${encodeURIComponent(branchId)}`)
    ),

  /** Reset all waiting & currently-serving tokens for a branch. */
  resetBranch: (branchId: string) =>
    jsonFetch<{ ok: boolean; clearedCount: number; state: QueueState }>(
      restUrl(`/api/admin/reset/${encodeURIComponent(branchId)}`),
      { method: "POST" }
    ),

  /** Get recent completed/no-show activity log for a branch. */
  getActivityLog: (branchId: string, limit = 50) =>
    jsonFetch<ActivityEntry[]>(
      restUrl(`/api/admin/activity/${encodeURIComponent(branchId)}?limit=${limit}`)
    ),
};
