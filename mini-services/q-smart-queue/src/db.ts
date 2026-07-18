// SQLite persistence layer (the "Postgres" equivalent) using bun:sqlite.
// Stores durable records: branches, service types, tellers, and a daily
// audit log of every token. The live queue state lives in memory (state.ts)
// and is rebuilt from this database on startup.

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ActivityEntry, Admin, Branch, ServiceType, Teller, Token, TokenPriority, TokenStatus } from "./types.js";

import { fileURLToPath } from "node:url";
import { join } from "node:path";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DB_PATH = join(__dirname, "../../../db/q-smart.db");

// Ensure the db directory exists.
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
// WAL mode for better concurrency and crash-resilience.
db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA foreign_keys = ON;");

db.run(`
  CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS service_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    estimated_sec INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS tellers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    pin TEXT NOT NULL DEFAULT '0000',
    active INTEGER NOT NULL DEFAULT 1
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS tokens (
    id TEXT PRIMARY KEY,
    number INTEGER NOT NULL,
    branch_id TEXT NOT NULL,
    service_type TEXT NOT NULL,
    status TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'regular',
    joined_at INTEGER NOT NULL,
    called_at INTEGER,
    completed_at INTEGER,
    teller_id TEXT,
    service_duration_sec INTEGER
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    token_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 3),
    comment TEXT,
    created_at INTEGER NOT NULL
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    pin TEXT NOT NULL DEFAULT '0000',
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_feedback_token ON feedback(token_id);`);

db.run(`CREATE INDEX IF NOT EXISTS idx_tokens_branch ON tokens(branch_id);`);
db.run(`CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);`);
db.run(`CREATE INDEX IF NOT EXISTS idx_tokens_branch_status ON tokens(branch_id, status);`);
db.run(`CREATE INDEX IF NOT EXISTS idx_tokens_joined ON tokens(joined_at);`);

// Migrate existing tables: add columns if they don't exist yet.
try { db.run("ALTER TABLE branches ADD COLUMN active INTEGER NOT NULL DEFAULT 1"); } catch {}
try { db.run("ALTER TABLE branches ADD COLUMN daily_reset_enabled INTEGER NOT NULL DEFAULT 0"); } catch {}
try { db.run("ALTER TABLE branches ADD COLUMN last_reset_day TEXT"); } catch {}
try { db.run("ALTER TABLE service_types ADD COLUMN active INTEGER NOT NULL DEFAULT 1"); } catch {}
try { db.run("ALTER TABLE tellers ADD COLUMN pin TEXT NOT NULL DEFAULT '0000'"); } catch {}
try { db.run("ALTER TABLE tellers ADD COLUMN active INTEGER NOT NULL DEFAULT 1"); } catch {}
try { db.run("ALTER TABLE tokens ADD COLUMN priority TEXT NOT NULL DEFAULT 'regular'"); } catch {}
try { db.run("ALTER TABLE tokens ADD COLUMN predicted_eta_sec INTEGER"); } catch {}

// ---------- Seed data ----------
const seedBranches: Branch[] = [
  { id: "main", name: "Downtown Branch", location: "Hauptstrasse 12, Kathmandu", active: true, dailyResetEnabled: false },
  { id: "north", name: "Northgate Branch", location: "Northgate Mall, Ring Road", active: true, dailyResetEnabled: false },
  { id: "airport", name: "Airport Counter", location: "Tribhuvan Intl. Airport, T1", active: true, dailyResetEnabled: true },
];

const seedServiceTypes: ServiceType[] = [
  { id: "general", name: "General Inquiry", estimatedSec: 180, active: true },
  { id: "accounts", name: "Account Services", estimatedSec: 300, active: true },
  { id: "loans", name: "Loans & Mortgages", estimatedSec: 480, active: true },
  { id: "cards", name: "Cards & Payments", estimatedSec: 240, active: true },
];

const seedTellers: (Teller & { pin: string })[] = [
  { id: "teller-1", name: "Aarav Sharma", branchId: "main", pin: "1234", active: true },
  { id: "teller-2", name: "Priya Thapa", branchId: "main", pin: "2345", active: true },
  { id: "teller-3", name: "Bishan Gurung", branchId: "north", pin: "3456", active: true },
  { id: "teller-4", name: "Sita Karki", branchId: "airport", pin: "4567", active: true },
];

const seedAdmins: Admin[] = [
  { id: "admin-1", username: "admin", pin: "9999", active: true, createdAt: Date.now() },
];

export function seedIfEmpty() {
  const branchCount = db.prepare("SELECT COUNT(*) as c FROM branches").get() as { c: number };
  if (branchCount.c === 0) {
    const insertBranch = db.prepare("INSERT INTO branches (id, name, location, active, daily_reset_enabled) VALUES (?, ?, ?, ?, ?)");
    for (const b of seedBranches) insertBranch.run(b.id, b.name, b.location, b.active ? 1 : 0, b.dailyResetEnabled ? 1 : 0);
  }
  const stCount = db.prepare("SELECT COUNT(*) as c FROM service_types").get() as { c: number };
  if (stCount.c === 0) {
    const insert = db.prepare("INSERT INTO service_types (id, name, estimated_sec, active) VALUES (?, ?, ?, ?)");
    for (const s of seedServiceTypes) insert.run(s.id, s.name, s.estimatedSec, s.active ? 1 : 0);
  }
  const tCount = db.prepare("SELECT COUNT(*) as c FROM tellers").get() as { c: number };
  if (tCount.c === 0) {
    const insert = db.prepare("INSERT INTO tellers (id, name, branch_id, pin, active) VALUES (?, ?, ?, ?, ?)");
    for (const t of seedTellers) insert.run(t.id, t.name, t.branchId, t.pin, t.active ? 1 : 0);
  } else {
    // Update PINs for existing seed tellers if they still have default '0000'
    const pinMap: Record<string, string> = {
      "teller-1": "1234",
      "teller-2": "2345",
      "teller-3": "3456",
      "teller-4": "4567",
    };
    for (const [tid, pin] of Object.entries(pinMap)) {
      db.prepare("UPDATE tellers SET pin = ? WHERE id = ? AND pin = '0000'").run(pin, tid);
    }
  }
  // Seed default admin if none exists.
  const aCount = db.prepare("SELECT COUNT(*) as c FROM admins").get() as { c: number };
  if (aCount.c === 0) {
    const insert = db.prepare("INSERT INTO admins (id, username, pin, active, created_at) VALUES (?, ?, ?, ?, ?)");
    for (const a of seedAdmins) insert.run(a.id, a.username, a.pin, a.active ? 1 : 0, a.createdAt);
  }
}

// ---------- Queries ----------
export function getBranches(): Branch[] {
  return db
    .prepare("SELECT id, name, location, active, daily_reset_enabled as dailyResetEnabled FROM branches WHERE active = 1 ORDER BY name")
    .all() as Branch[];
}

export function getAllBranches(): Branch[] {
  return db
    .prepare("SELECT id, name, location, active, daily_reset_enabled as dailyResetEnabled FROM branches ORDER BY name")
    .all() as Branch[];
}

export function getBranchById(id: string): Branch | null {
  return db
    .prepare("SELECT id, name, location, active, daily_reset_enabled as dailyResetEnabled, last_reset_day as lastResetDay FROM branches WHERE id = ?")
    .get(id) as Branch | null;
}

export function getServiceTypes(): ServiceType[] {
  return db
    .prepare("SELECT id, name, estimated_sec as estimatedSec, active FROM service_types WHERE active = 1 ORDER BY name")
    .all() as ServiceType[];
}

export function getAllServiceTypes(): ServiceType[] {
  return db
    .prepare("SELECT id, name, estimated_sec as estimatedSec, active FROM service_types ORDER BY name")
    .all() as ServiceType[];
}

export function getServiceTypeById(id: string): ServiceType | null {
  return db
    .prepare("SELECT id, name, estimated_sec as estimatedSec, active FROM service_types WHERE id = ?")
    .get(id) as ServiceType | null;
}

export function getTellers(): Teller[] {
  return db
    .prepare("SELECT id, name, branch_id as branchId, pin, active FROM tellers WHERE active = 1 ORDER BY name")
    .all() as Teller[];
}

export function getAllTellers(): Teller[] {
  return db
    .prepare("SELECT id, name, branch_id as branchId, pin, active FROM tellers ORDER BY name")
    .all() as Teller[];
}

export function getTellersByBranch(branchId: string): Teller[] {
  return db
    .prepare("SELECT id, name, branch_id as branchId, pin, active FROM tellers WHERE branch_id = ? AND active = 1 ORDER BY name")
    .all(branchId) as Teller[];
}

export function getTellerById(id: string): Teller | null {
  return db
    .prepare("SELECT id, name, branch_id as branchId, pin, active FROM tellers WHERE id = ?")
    .get(id) as Teller | null;
}

interface TokenRow {
  id: string;
  number: number;
  branch_id: string;
  service_type: string;
  status: string;
  priority: string;
  joined_at: number;
  called_at: number | null;
  completed_at: number | null;
  teller_id: string | null;
  service_duration_sec: number | null;
  predicted_eta_sec: number | null;
}

function rowToToken(r: TokenRow): Token {
  return {
    id: r.id,
    number: r.number,
    branchId: r.branch_id,
    serviceType: r.service_type,
    status: r.status as TokenStatus,
    priority: (r.priority as TokenPriority) || "regular",
    position: 0,
    etaSec: 0,
    predictedEtaSec: r.predicted_eta_sec ?? null,
    joinedAt: r.joined_at,
    calledAt: r.called_at,
    completedAt: r.completed_at,
    tellerId: r.teller_id,
    serviceDurationSec: r.service_duration_sec,
  };
}

export function getWaitingTokens(branchId: string): Token[] {
  const rows = db
    .prepare(
      "SELECT * FROM tokens WHERE branch_id = ? AND status = ? ORDER BY joined_at ASC"
    )
    .all(branchId, "waiting") as TokenRow[];
  return rows.map(rowToToken);
}

/** Get the single most-recent called token for a branch (backwards compat). */
export function getCalledToken(branchId: string): Token | null {
  const row = db
    .prepare("SELECT * FROM tokens WHERE branch_id = ? AND status = ? ORDER BY called_at DESC LIMIT 1")
    .get(branchId, "called") as TokenRow | null;
  return row ? rowToToken(row) : null;
}

/** Get ALL currently-called tokens for a branch (multi-counter support). */
export function getCalledTokens(branchId: string): Token[] {
  const rows = db
    .prepare("SELECT * FROM tokens WHERE branch_id = ? AND status = ? ORDER BY called_at ASC")
    .all(branchId, "called") as TokenRow[];
  return rows.map(rowToToken);
}

export function getTokenById(id: string): Token | null {
  const row = db
    .prepare("SELECT * FROM tokens WHERE id = ?")
    .get(id) as TokenRow | null;
  return row ? rowToToken(row) : null;
}

export function getMaxTokenNumber(branchId: string): number {
  const row = db
    .prepare("SELECT COALESCE(MAX(number), 0) as m FROM tokens WHERE branch_id = ?")
    .get(branchId) as { m: number };
  return row.m;
}

/** Get the max token number issued today (for daily reset). */
export function getMaxTokenNumberToday(branchId: string): number {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const row = db
    .prepare("SELECT COALESCE(MAX(number), 0) as m FROM tokens WHERE branch_id = ? AND joined_at >= ?")
    .get(branchId, startOfDay.getTime()) as { m: number };
  return row.m;
}

export function getCompletedDurations(branchId: string, limit = 50): number[] {
  const rows = db
    .prepare(
      "SELECT service_duration_sec as d FROM tokens WHERE branch_id = ? AND status = ? AND service_duration_sec IS NOT NULL ORDER BY completed_at DESC LIMIT ?"
    )
    .all(branchId, "completed", limit) as { d: number }[];
  return rows.map((r) => r.d);
}

export function countByStatusToday(branchId: string, status: TokenStatus): number {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const row = db
    .prepare(
      "SELECT COUNT(*) as c FROM tokens WHERE branch_id = ? AND status = ? AND joined_at >= ?"
    )
    .get(branchId, status, startOfDay.getTime()) as { c: number };
  return row.c;
}

export function insertToken(token: Token): void {
  db.prepare(
    `INSERT INTO tokens (id, number, branch_id, service_type, status, priority, joined_at, called_at, completed_at, teller_id, service_duration_sec, predicted_eta_sec)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    token.id,
    token.number,
    token.branchId,
    token.serviceType,
    token.status,
    token.priority,
    token.joinedAt,
    token.calledAt,
    token.completedAt,
    token.tellerId,
    token.serviceDurationSec,
    token.predictedEtaSec
  );
}

export function updateTokenStatus(
  id: string,
  status: TokenStatus,
  calledAt: number | null,
  completedAt: number | null,
  tellerId: string | null,
  serviceDurationSec: number | null
): void {
  db.prepare(
    `UPDATE tokens SET status = ?, called_at = COALESCE(?, called_at), completed_at = COALESCE(?, completed_at), teller_id = COALESCE(?, teller_id), service_duration_sec = COALESCE(?, service_duration_sec) WHERE id = ?`
  ).run(status, calledAt, completedAt, tellerId, serviceDurationSec, id);
}

/** Update the service type of a token (used for token transfer). */
export function updateTokenServiceType(id: string, newServiceType: string): void {
  db.prepare("UPDATE tokens SET service_type = ? WHERE id = ?").run(newServiceType, id);
}

/** Get the last N completed/no-show tokens for a branch (activity log). */
export function getActivityLog(branchId: string, limit = 50): ActivityEntry[] {
  const rows = db
    .prepare(
      `SELECT t.id, t.number, t.service_type as serviceType, t.status, t.teller_id as tellerId,
              tl.name as tellerName, t.called_at as calledAt, t.completed_at as completedAt,
              t.service_duration_sec as serviceDurationSec
       FROM tokens t
       LEFT JOIN tellers tl ON t.teller_id = tl.id
       WHERE t.branch_id = ? AND t.status IN ('completed', 'no_show')
       ORDER BY t.completed_at DESC
       LIMIT ?`
    )
    .all(branchId, limit) as ActivityEntry[];
  return rows;
}

/** Hourly throughput stats for the analytics chart. */
export interface HourlyStat {
  hour: string;       // "09", "10", etc.
  served: number;
  noShow: number;
  avgDuration: number; // seconds, 0 if none
}

export function getHourlyStats(branchId: string, hours = 8): HourlyStat[] {
  const now = new Date();
  const results: HourlyStat[] = [];
  for (let i = hours - 1; i >= 0; i--) {
    const hourStart = new Date(now);
    hourStart.setHours(now.getHours() - i, 0, 0, 0);
    const hourEnd = new Date(hourStart);
    hourEnd.setHours(hourStart.getHours() + 1);
    const startMs = hourStart.getTime();
    const endMs = hourEnd.getTime();
    const hourLabel = String(hourStart.getHours()).padStart(2, "0");

    const servedRow = db
      .prepare(
        `SELECT COUNT(*) as c, COALESCE(AVG(service_duration_sec), 0) as avg FROM tokens
         WHERE branch_id = ? AND status = 'completed' AND completed_at >= ? AND completed_at < ?`
      )
      .get(branchId, startMs, endMs) as { c: number; avg: number };
    const noShowRow = db
      .prepare(
        `SELECT COUNT(*) as c FROM tokens
         WHERE branch_id = ? AND status = 'no_show' AND completed_at >= ? AND completed_at < ?`
      )
      .get(branchId, startMs, endMs) as { c: number };

    results.push({
      hour: hourLabel,
      served: servedRow.c,
      noShow: noShowRow.c,
      avgDuration: Math.round(servedRow.avg),
    });
  }
  return results;
}

// ---------- Admin CRUD functions ----------

/** Create a new branch. */
export function createBranch(id: string, name: string, location: string, dailyResetEnabled = false): Branch {
  db.prepare("INSERT INTO branches (id, name, location, active, daily_reset_enabled) VALUES (?, ?, ?, 1, ?)").run(id, name, location, dailyResetEnabled ? 1 : 0);
  return { id, name, location, active: true, dailyResetEnabled };
}

/** Update a branch. */
export function updateBranch(id: string, data: { name?: string; location?: string; active?: boolean; dailyResetEnabled?: boolean }): Branch | null {
  const existing = getBranchById(id);
  if (!existing) return null;
  const name = data.name ?? existing.name;
  const location = data.location ?? existing.location;
  const active = data.active ?? existing.active;
  const dailyResetEnabled = data.dailyResetEnabled ?? existing.dailyResetEnabled;
  db.prepare("UPDATE branches SET name = ?, location = ?, active = ?, daily_reset_enabled = ? WHERE id = ?").run(name, location, active ? 1 : 0, dailyResetEnabled ? 1 : 0, id);
  return { id, name, location, active, dailyResetEnabled };
}

/** Update the last reset day for a branch (used by daily-reset logic). */
export function setBranchLastResetDay(id: string, day: string): void {
  db.prepare("UPDATE branches SET last_reset_day = ? WHERE id = ?").run(day, id);
}

/** Create a new service type. */
export function createServiceType(id: string, name: string, estimatedSec: number): ServiceType {
  db.prepare("INSERT INTO service_types (id, name, estimated_sec, active) VALUES (?, ?, ?, 1)").run(id, name, estimatedSec);
  return { id, name, estimatedSec, active: true };
}

/** Update a service type. */
export function updateServiceType(id: string, data: { name?: string; estimatedSec?: number; active?: boolean }): ServiceType | null {
  const existing = getServiceTypeById(id);
  if (!existing) return null;
  const name = data.name ?? existing.name;
  const estimatedSec = data.estimatedSec ?? existing.estimatedSec;
  const active = data.active ?? existing.active;
  db.prepare("UPDATE service_types SET name = ?, estimated_sec = ?, active = ? WHERE id = ?").run(name, estimatedSec, active ? 1 : 0, id);
  return { id, name, estimatedSec, active };
}

/** Create a new teller. */
export function createTeller(id: string, name: string, branchId: string, pin = "0000"): Teller {
  db.prepare("INSERT INTO tellers (id, name, branch_id, pin, active) VALUES (?, ?, ?, ?, 1)").run(id, name, branchId, pin);
  return { id, name, branchId, pin, active: true };
}

/** Update a teller. */
export function updateTeller(id: string, data: { name?: string; branchId?: string; pin?: string; active?: boolean }): Teller | null {
  const existing = getTellerById(id);
  if (!existing) return null;
  const name = data.name ?? existing.name;
  const branchId = data.branchId ?? existing.branchId;
  const pin = data.pin ?? existing.pin;
  const active = data.active ?? existing.active;
  db.prepare("UPDATE tellers SET name = ?, branch_id = ?, pin = ?, active = ? WHERE id = ?").run(name, branchId, pin, active ? 1 : 0, id);
  return { id, name, branchId, pin, active };
}

// ---------- Feedback ----------

export interface FeedbackRow {
  id: string;
  tokenId: string;
  rating: number;
  comment: string | null;
  createdAt: number;
}

export function insertFeedback(id: string, tokenId: string, rating: number, comment: string | null): void {
  db.prepare(
    "INSERT INTO feedback (id, token_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, tokenId, rating, comment, Date.now());
}

export interface FeedbackStats {
  avgRating: number;
  totalResponses: number;
  distribution: { rating1: number; rating2: number; rating3: number };
}

export function getFeedbackStats(branchId: string): FeedbackStats {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const since = startOfDay.getTime();
  const row = db.prepare(
    `SELECT
       COUNT(*) as total,
       COALESCE(AVG(f.rating), 0) as avg,
       SUM(CASE WHEN f.rating = 1 THEN 1 ELSE 0 END) as r1,
       SUM(CASE WHEN f.rating = 2 THEN 1 ELSE 0 END) as r2,
       SUM(CASE WHEN f.rating = 3 THEN 1 ELSE 0 END) as r3
     FROM feedback f
     JOIN tokens t ON f.token_id = t.id
     WHERE t.branch_id = ? AND f.created_at >= ?`
  ).get(branchId, since) as { total: number; avg: number; r1: number; r2: number; r3: number };
  return {
    avgRating: Math.round(row.avg * 10) / 10,
    totalResponses: row.total,
    distribution: {
      rating1: row.r1 ?? 0,
      rating2: row.r2 ?? 0,
      rating3: row.r3 ?? 0,
    },
  };
}

// ---------- Admin auth ----------

export function getAdminByUsername(username: string): Admin | null {
  const row = db
    .prepare("SELECT id, username, pin, active, created_at as createdAt FROM admins WHERE username = ?")
    .get(username) as Admin | null;
  return row;
}

export function getAdminById(id: string): Admin | null {
  const row = db
    .prepare("SELECT id, username, pin, active, created_at as createdAt FROM admins WHERE id = ?")
    .get(id) as Admin | null;
  return row;
}

export function createAdmin(id: string, username: string, pin: string): Admin {
  db.prepare("INSERT INTO admins (id, username, pin, active, created_at) VALUES (?, ?, ?, 1, ?)").run(id, username, pin, Date.now());
  return { id, username, pin, active: true, createdAt: Date.now() };
}

export function updateAdminPin(id: string, pin: string): void {
  db.prepare("UPDATE admins SET pin = ? WHERE id = ?").run(pin, id);
}

// ---------- ETA accuracy ----------

export interface EtaAccuracyStats {
  sampleSize: number;
  avgPredictedSec: number;
  avgActualSec: number;
  avgErrorSec: number;
  /** Mean absolute percentage error, 0..1 (1 = 100% off). */
  mape: number;
  /** Percentage of tokens whose actual wait was within ±60s of predicted. */
  within60sPct: number;
  /** Distribution buckets: how many fell into each accuracy band. */
  buckets: {
    under: number;  // actual < predicted * 0.5 (way faster)
    close: number;  // within ±30%
    over: number;   // actual > predicted * 1.5 (way slower)
  };
}

/** Compute ETA accuracy for tokens called today (predicted vs actual wait). */
export function getEtaAccuracy(branchId: string): EtaAccuracyStats {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const rows = db
    .prepare(
      `SELECT predicted_eta_sec as predicted, called_at as calledAt, joined_at as joinedAt
       FROM tokens
       WHERE branch_id = ? AND status IN ('called','completed','no_show')
         AND called_at IS NOT NULL AND joined_at >= ? AND predicted_eta_sec IS NOT NULL`
    )
    .all(branchId, startOfDay.getTime()) as { predicted: number; calledAt: number; joinedAt: number }[];

  const sampleSize = rows.length;
  if (sampleSize === 0) {
    return {
      sampleSize: 0,
      avgPredictedSec: 0,
      avgActualSec: 0,
      avgErrorSec: 0,
      mape: 0,
      within60sPct: 0,
      buckets: { under: 0, close: 0, over: 0 },
    };
  }

  let sumPred = 0;
  let sumActual = 0;
  let sumAbsErr = 0;
  let sumAbsPctErr = 0;
  let within60s = 0;
  let under = 0;
  let close = 0;
  let over = 0;

  for (const r of rows) {
    const actual = Math.max(1, Math.round((r.calledAt - r.joinedAt) / 1000));
    const predicted = r.predicted;
    sumPred += predicted;
    sumActual += actual;
    sumAbsErr += Math.abs(actual - predicted);
    sumAbsPctErr += Math.abs(actual - predicted) / Math.max(predicted, 1);
    if (Math.abs(actual - predicted) <= 60) within60s += 1;
    const ratio = actual / Math.max(predicted, 1);
    if (ratio < 0.7) under += 1;
    else if (ratio > 1.3) over += 1;
    else close += 1;
  }

  return {
    sampleSize,
    avgPredictedSec: Math.round(sumPred / sampleSize),
    avgActualSec: Math.round(sumActual / sampleSize),
    avgErrorSec: Math.round(sumAbsErr / sampleSize),
    mape: Math.round((sumAbsPctErr / sampleSize) * 100) / 100,
    within60sPct: Math.round((within60s / sampleSize) * 1000) / 10, // 0..100 with 1 decimal
    buckets: { under, close, over },
  };
}
