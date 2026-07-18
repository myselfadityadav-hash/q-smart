// REST API helpers for the Q-Smart backend. All calls use relative URLs and
// route through the gateway via ?XTransformPort=3004.

import { restUrl } from "./config";
import type {
  ActivityEntry,
  Admin,
  Branch,
  EtaAccuracyStats,
  EtaConfidence,
  FeedbackStats,
  HourlyStat,
  QueueState,
  ServiceType,
  Teller,
  Token,
  TokenPriority,
} from "./types";

const ADMIN_TOKEN_KEY = "qsmart_admin_token";

/** Read the persisted admin token (localStorage). Returns null if not logged in. */
export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ADMIN_TOKEN_KEY);
}

/** Persist (or clear) the admin token. */
export function setAdminToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else window.localStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init?.headers) Object.assign(headers, init.headers);
  // Auto-attach admin token if available.
  const adminToken = getAdminToken();
  if (adminToken) headers["x-admin-token"] = adminToken;
  const res = await fetch(url, { ...init, headers });
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

  joinQueue: (branchId: string, serviceType: string, priority?: TokenPriority) =>
    jsonFetch<{ token: Token }>(restUrl("/api/queue/join"), {
      method: "POST",
      body: JSON.stringify({ branchId, serviceType, priority: priority ?? "regular" }),
    }),

  leaveQueue: (tokenId: string) =>
    jsonFetch<{ ok: boolean }>(restUrl("/api/queue/leave"), {
      method: "POST",
      body: JSON.stringify({ tokenId }),
    }),

  // ---------- Teller Authentication ----------

  tellerLogin: (branchId: string, tellerId: string, pin: string) =>
    jsonFetch<{ ok: boolean; teller?: Omit<Teller, "pin">; error?: string }>(
      restUrl("/api/teller/login"),
      {
        method: "POST",
        body: JSON.stringify({ branchId, tellerId, pin }),
      }
    ),

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

  // ---------- Pause / Resume Counter ----------

  pauseTeller: (branchId: string, tellerId: string) =>
    jsonFetch<{ ok: boolean; state: QueueState }>(restUrl("/api/teller/pause"), {
      method: "POST",
      body: JSON.stringify({ branchId, tellerId }),
    }),

  resumeTeller: (branchId: string, tellerId: string) =>
    jsonFetch<{ ok: boolean; state: QueueState }>(restUrl("/api/teller/resume"), {
      method: "POST",
      body: JSON.stringify({ branchId, tellerId }),
    }),

  // ---------- Transfer Token ----------

  transferToken: (branchId: string, tokenId: string, newServiceType: string) =>
    jsonFetch<{ ok: boolean; token: Token; state: QueueState }>(
      restUrl("/api/teller/transfer"),
      {
        method: "POST",
        body: JSON.stringify({ branchId, tokenId, newServiceType }),
      }
    ),

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

  /** Get hourly throughput stats for analytics chart. */
  getHourlyStats: (branchId: string, hours = 8) =>
    jsonFetch<HourlyStat[]>(
      restUrl(`/api/admin/hourly-stats/${encodeURIComponent(branchId)}?hours=${hours}`)
    ),

  // ---------- Feedback ----------

  /** Submit customer feedback after service. */
  submitFeedback: (tokenId: string, rating: number, comment?: string) =>
    jsonFetch<{ ok: boolean; id: string }>(restUrl("/api/feedback"), {
      method: "POST",
      body: JSON.stringify({ tokenId, rating, comment }),
    }),

  /** Get feedback stats for a branch. */
  getFeedbackStats: (branchId: string) =>
    jsonFetch<FeedbackStats>(
      restUrl(`/api/admin/feedback-stats/${encodeURIComponent(branchId)}`)
    ),

  /** Get ETA accuracy stats for a branch (admin-only). */
  getEtaAccuracy: (branchId: string) =>
    jsonFetch<EtaAccuracyStats>(
      restUrl(`/api/admin/eta-accuracy/${encodeURIComponent(branchId)}`)
    ),

  /** Get ETA confidence indicator for a branch (public). */
  getEtaConfidence: (branchId: string) =>
    jsonFetch<EtaConfidence>(
      restUrl(`/api/eta-confidence/${encodeURIComponent(branchId)}`)
    ),

  // ---------- Admin Auth ----------

  /** Admin login. Returns a session token to be persisted in localStorage. */
  adminLogin: (username: string, pin: string) =>
    jsonFetch<{ ok: boolean; token: string; admin: Admin }>(restUrl("/api/admin/login"), {
      method: "POST",
      body: JSON.stringify({ username, pin }),
    }),

  /** Admin logout (revokes the session token). */
  adminLogout: () =>
    jsonFetch<{ ok: boolean }>(restUrl("/api/admin/logout"), { method: "POST" }),

  /** Verify the current admin token is still valid. */
  adminMe: () => jsonFetch<{ ok: boolean; admin: Admin }>(restUrl("/api/admin/me")),

  // ---------- Admin CRUD ----------

  /** Create a new branch. */
  createBranch: (id: string, name: string, location: string, dailyResetEnabled = false) =>
    jsonFetch<{ ok: boolean; branch: Branch }>(restUrl("/api/admin/branch"), {
      method: "POST",
      body: JSON.stringify({ id, name, location, dailyResetEnabled }),
    }),

  /** Update a branch. */
  updateBranch: (
    id: string,
    data: { name?: string; location?: string; active?: boolean; dailyResetEnabled?: boolean }
  ) =>
    jsonFetch<{ ok: boolean; branch: Branch }>(
      restUrl(`/api/admin/branch/${encodeURIComponent(id)}`),
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    ),

  /** Create a new service type. */
  createServiceType: (id: string, name: string, estimatedSec: number) =>
    jsonFetch<{ ok: boolean; serviceType: ServiceType }>(restUrl("/api/admin/service-type"), {
      method: "POST",
      body: JSON.stringify({ id, name, estimatedSec }),
    }),

  /** Update a service type. */
  updateServiceType: (id: string, data: { name?: string; estimatedSec?: number; active?: boolean }) =>
    jsonFetch<{ ok: boolean; serviceType: ServiceType }>(
      restUrl(`/api/admin/service-type/${encodeURIComponent(id)}`),
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    ),

  /** Create a new teller. */
  createTeller: (id: string, name: string, branchId: string, pin?: string) =>
    jsonFetch<{ ok: boolean; teller: Omit<Teller, "pin"> }>(restUrl("/api/admin/teller"), {
      method: "POST",
      body: JSON.stringify({ id, name, branchId, pin }),
    }),

  /** Update a teller. */
  updateTeller: (id: string, data: { name?: string; branchId?: string; pin?: string; active?: boolean }) =>
    jsonFetch<{ ok: boolean; teller: Omit<Teller, "pin"> }>(
      restUrl(`/api/admin/teller/${encodeURIComponent(id)}`),
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    ),

  /** Change admin PIN. */
  adminChangePin: (currentPin: string, newPin: string) =>
    jsonFetch<{ ok: boolean }>(restUrl("/api/admin/change-pin"), {
      method: "POST",
      body: JSON.stringify({ currentPin, newPin }),
    }),
};
