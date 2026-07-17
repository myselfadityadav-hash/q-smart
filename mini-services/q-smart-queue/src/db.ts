// SQLite persistence layer (the "Postgres" equivalent) using bun:sqlite.
// Stores durable records: branches, service types, tellers, and a daily
// audit log of every token. The live queue state lives in memory (state.ts)
// and is rebuilt from this database on startup.

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ActivityEntry, Branch, ServiceType, Teller, Token, TokenStatus } from "./types.js";

const DB_PATH = "/home/z/my-project/db/q-smart.db";

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
    location TEXT NOT NULL
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS service_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    estimated_sec INTEGER NOT NULL
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS tellers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    branch_id TEXT NOT NULL
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS tokens (
    id TEXT PRIMARY KEY,
    number INTEGER NOT NULL,
    branch_id TEXT NOT NULL,
    service_type TEXT NOT NULL,
    status TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    called_at INTEGER,
    completed_at INTEGER,
    teller_id TEXT,
    service_duration_sec INTEGER
  );
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_tokens_branch ON tokens(branch_id);`);
db.run(`CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);`);
db.run(`CREATE INDEX IF NOT EXISTS idx_tokens_branch_status ON tokens(branch_id, status);`);

// ---------- Seed data ----------
const seedBranches: Branch[] = [
  { id: "main", name: "Downtown Branch", location: "Hauptstrasse 12, Kathmandu" },
  { id: "north", name: "Northgate Branch", location: "Northgate Mall, Ring Road" },
  { id: "airport", name: "Airport Counter", location: "Tribhuvan Intl. Airport, T1" },
];

const seedServiceTypes: ServiceType[] = [
  { id: "general", name: "General Inquiry", estimatedSec: 180 },
  { id: "accounts", name: "Account Services", estimatedSec: 300 },
  { id: "loans", name: "Loans & Mortgages", estimatedSec: 480 },
  { id: "cards", name: "Cards & Payments", estimatedSec: 240 },
];

const seedTellers: Teller[] = [
  { id: "teller-1", name: "Aarav Sharma", branchId: "main" },
  { id: "teller-2", name: "Priya Thapa", branchId: "main" },
  { id: "teller-3", name: "Bishan Gurung", branchId: "north" },
  { id: "teller-4", name: "Sita Karki", branchId: "airport" },
];

export function seedIfEmpty() {
  const branchCount = db.prepare("SELECT COUNT(*) as c FROM branches").get() as { c: number };
  if (branchCount.c === 0) {
    const insertBranch = db.prepare("INSERT INTO branches (id, name, location) VALUES (?, ?, ?)");
    for (const b of seedBranches) insertBranch.run(b.id, b.name, b.location);
  }
  const stCount = db.prepare("SELECT COUNT(*) as c FROM service_types").get() as { c: number };
  if (stCount.c === 0) {
    const insert = db.prepare("INSERT INTO service_types (id, name, estimated_sec) VALUES (?, ?, ?)");
    for (const s of seedServiceTypes) insert.run(s.id, s.name, s.estimatedSec);
  }
  const tCount = db.prepare("SELECT COUNT(*) as c FROM tellers").get() as { c: number };
  if (tCount.c === 0) {
    const insert = db.prepare("INSERT INTO tellers (id, name, branch_id) VALUES (?, ?, ?)");
    for (const t of seedTellers) insert.run(t.id, t.name, t.branchId);
  }
}

// ---------- Queries ----------
export function getBranches(): Branch[] {
  return db.prepare("SELECT id, name, location FROM branches ORDER BY name").all() as Branch[];
}

export function getServiceTypes(): ServiceType[] {
  return db
    .prepare("SELECT id, name, estimated_sec as estimatedSec FROM service_types ORDER BY name")
    .all() as ServiceType[];
}

export function getTellers(): Teller[] {
  return db
    .prepare("SELECT id, name, branch_id as branchId FROM tellers ORDER BY name")
    .all() as Teller[];
}

export function getTellersByBranch(branchId: string): Teller[] {
  return db
    .prepare("SELECT id, name, branch_id as branchId FROM tellers WHERE branch_id = ? ORDER BY name")
    .all(branchId) as Teller[];
}

interface TokenRow {
  id: string;
  number: number;
  branch_id: string;
  service_type: string;
  status: string;
  joined_at: number;
  called_at: number | null;
  completed_at: number | null;
  teller_id: string | null;
  service_duration_sec: number | null;
}

function rowToToken(r: TokenRow): Token {
  return {
    id: r.id,
    number: r.number,
    branchId: r.branch_id,
    serviceType: r.service_type,
    status: r.status as TokenStatus,
    position: 0,
    etaSec: 0,
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

export function getMaxTokenNumber(branchId: string): number {
  const row = db
    .prepare("SELECT COALESCE(MAX(number), 0) as m FROM tokens WHERE branch_id = ?")
    .get(branchId) as { m: number };
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
    `INSERT INTO tokens (id, number, branch_id, service_type, status, joined_at, called_at, completed_at, teller_id, service_duration_sec)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    token.id,
    token.number,
    token.branchId,
    token.serviceType,
    token.status,
    token.joinedAt,
    token.calledAt,
    token.completedAt,
    token.tellerId,
    token.serviceDurationSec
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
