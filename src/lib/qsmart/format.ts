// Small formatting + display helpers for the Q-Smart UI.

import type { ServiceType, TokenPriority, TokenStatus } from "./types";

/** Format a duration in seconds as a human-friendly ETA string. */
export function formatEta(sec: number): string {
  if (sec <= 0) return "Now";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

export function formatClock(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format an approximate call time as a clock time, e.g. "≈ 10:35 AM". */
export function formatApproxCallTime(etaSec: number): string {
  if (etaSec <= 0) return "Now";
  const future = new Date(Date.now() + etaSec * 1000);
  return `≈ ${future.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function formatTimeAgo(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function serviceTypeLabel(id: string, types: ServiceType[]): string {
  return types.find((t) => t.id === id)?.name ?? id;
}

export const STATUS_LABEL: Record<TokenStatus, string> = {
  waiting: "Waiting",
  called: "Called",
  completed: "Completed",
  no_show: "No-show",
  cancelled: "Cancelled",
};

/** Tailwind classes for status badges. */
export function statusBadgeClass(status: TokenStatus): string {
  switch (status) {
    case "waiting":
      return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30";
    case "called":
      return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30";
    case "completed":
      return "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/30";
    case "no_show":
      return "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30";
    case "cancelled":
      return "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-500/15 dark:text-zinc-400 dark:border-zinc-500/30";
  }
}

/** Human-readable label for priority levels. */
export function priorityLabel(priority: TokenPriority | undefined): string {
  switch (priority) {
    case "vip": return "VIP";
    case "express": return "Express";
    case "regular": return "Regular";
    default: return "Regular";
  }
}

/** Tailwind badge classes for priority levels. */
export function priorityBadgeClass(priority: TokenPriority | undefined): string {
  switch (priority) {
    case "vip":
      return "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40";
    case "express":
      return "bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/40";
    case "regular":
    default:
      return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30";
  }
}

/** Short emoji indicator for priority. */
export function priorityEmoji(priority: TokenPriority | undefined): string {
  switch (priority) {
    case "vip": return "⭐";
    case "express": return "⚡";
    default: return "";
  }
}
