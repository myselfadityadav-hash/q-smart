// Q-Smart backend entry point.
//
// Two HTTP servers in one process, sharing in-memory state + the Socket.IO
// instance:
//   * Port 3003 — Socket.IO only, path "/". This path is REQUIRED by the
//     gateway (Caddy) so browser WebSocket handshakes to
//     /?XTransformPort=3003 are forwarded here. With path "/" engine.io
//     intercepts every request on the port, so REST cannot live here.
//   * Port 3004 — Express REST API. The frontend calls these with
//     ?XTransformPort=3004.
//
// In-memory live state (state.ts) is the source of truth for the current
// queue; SQLite (db.ts) is the durable audit log. REST handlers mutate state
// and then call io.to(...).emit(...) to broadcast updates to WebSocket clients
// connected on port 3003.

import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { Server } from "socket.io";
import type { QueueState, TokenPriority } from "./types.js";
import {
  createBranch,
  createServiceType,
  createTeller,
  getAdminById,
  getAdminByUsername,
  getActivityLog,
  getAllBranches,
  getAllServiceTypes,
  getAllTellers,
  getBranches,
  getBranchById,
  getEtaAccuracy,
  getFeedbackStats,
  getHourlyStats,
  getServiceTypes,
  getServiceTypeById,
  getTellers,
  getTellerById,
  getTellersByBranch,
  insertFeedback,
  seedIfEmpty,
  updateAdminPin,
  updateBranch,
  updateServiceType,
  updateTeller,
} from "./db.js";
import {
  QueueError,
  buildQueueState,
  callNext,
  completeService,
  hydrateFromDb,
  isTellerPaused,
  joinQueue,
  leaveQueue,
  markNoShow,
  pauseTeller,
  resetBranch,
  resumeTeller,
  transferToken,
} from "./state.js";

const WS_PORT = 3003;
const REST_PORT = 3004;

seedIfEmpty();
hydrateFromDb(getBranches().map((b) => b.id));

// ---------------- Admin sessions (in-memory) ----------------
// Simple token-based sessions for admin auth. Tokens are random 32-byte hex
// strings; sessions expire after 8 hours of inactivity.
interface AdminSession {
  adminId: string;
  username: string;
  token: string;
  createdAt: number;
  lastSeen: number;
}
const adminSessions = new Map<string, AdminSession>(); // token -> session
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function createAdminSession(admin: { id: string; username: string }): string {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  adminSessions.set(token, { adminId: admin.id, username: admin.username, token, createdAt: now, lastSeen: now });
  return token;
}

function getAdminSession(token: string | undefined): AdminSession | null {
  if (!token) return null;
  const s = adminSessions.get(token);
  if (!s) return null;
  if (Date.now() - s.lastSeen > ADMIN_SESSION_TTL_MS) {
    adminSessions.delete(token);
    return null;
  }
  s.lastSeen = Date.now();
  return s;
}

function destroyAdminSession(token: string | undefined): void {
  if (token) adminSessions.delete(token);
}

/** Admin-auth middleware. Looks for `x-admin-token` header OR `?adminToken=` query. */
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const token = (req.headers["x-admin-token"] as string | undefined) ?? (req.query.adminToken as string | undefined);
  const session = getAdminSession(token);
  if (!session) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }
  (req as express.Request & { adminSession?: AdminSession }).adminSession = session;
  next();
}

// ---------------- Express REST (port 3004) ----------------
const app = express();
app.use(cors());
app.use(express.json());

app.use((req, _res, next) => {
  console.log(`[REST] ${req.method} ${req.url}`);
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "q-smart-queue", time: Date.now() });
});

app.get("/api/branches", (_req, res) => res.json(getBranches()));
app.get("/api/service-types", (_req, res) => res.json(getServiceTypes()));
app.get("/api/tellers", (_req, res) => res.json(getTellers()));
app.get("/api/tellers/:branchId", (req, res) =>
  res.json(getTellersByBranch(req.params.branchId))
);
app.get("/api/queue/:branchId", (req, res) =>
  res.json(buildQueueState(req.params.branchId))
);

app.post("/api/queue/join", (req, res) => {
  const { branchId, serviceType, priority } = req.body ?? {};
  if (!branchId || !serviceType) {
    res.status(400).json({ error: "branchId and serviceType are required" });
    return;
  }
  const validPriorities: TokenPriority[] = ["regular", "express", "vip"];
  const tokenPriority: TokenPriority = validPriorities.includes(priority) ? priority : "regular";
  try {
    const token = joinQueue(branchId, serviceType, tokenPriority);
    broadcast(branchId);
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/api/queue/leave", (req, res) => {
  const { tokenId } = req.body ?? {};
  if (!tokenId) {
    res.status(400).json({ error: "tokenId is required" });
    return;
  }
  const token = leaveQueue(tokenId);
  if (token) {
    broadcast(token.branchId);
    io.to(roomFor(token.branchId)).emit("token_removed", {
      branchId: token.branchId,
      token,
      reason: "cancelled",
    });
  }
  res.json({ ok: !!token, token: token ?? null });
});

// ---------- Teller Authentication ----------

app.post("/api/teller/login", (req, res) => {
  const { branchId, tellerId, pin } = req.body ?? {};
  if (!branchId || !tellerId || pin === undefined) {
    res.status(400).json({ error: "branchId, tellerId, and pin are required" });
    return;
  }
  const teller = getTellerById(tellerId);
  if (!teller) {
    res.status(404).json({ ok: false, error: "Teller not found" });
    return;
  }
  if (teller.branchId !== branchId) {
    res.status(403).json({ ok: false, error: "Teller does not belong to this branch" });
    return;
  }
  if (!teller.active) {
    res.status(403).json({ ok: false, error: "Teller account is deactivated" });
    return;
  }
  if (teller.pin !== String(pin)) {
    res.status(401).json({ ok: false, error: "Invalid PIN" });
    return;
  }
  // Return teller without pin for security
  const { pin: _, ...safeTeller } = teller;
  res.json({ ok: true, teller: safeTeller });
});

app.post("/api/teller/next", (req, res) => {
  const { branchId, tellerId } = req.body ?? {};
  if (!branchId || !tellerId) {
    res.status(400).json({ error: "branchId and tellerId are required" });
    return;
  }
  try {
    const token = callNext(branchId, tellerId);
    const state = broadcast(branchId);
    if (token) io.to(roomFor(branchId)).emit("token_called", { branchId, token });
    res.json({ token, state });
  } catch (err) {
    const status = err instanceof QueueError ? err.status : 500;
    res.status(status).json({ error: (err as Error).message });
  }
});

app.post("/api/teller/complete", (req, res) => {
  const { branchId, tellerId } = req.body ?? {};
  if (!branchId || !tellerId) {
    res.status(400).json({ error: "branchId and tellerId are required" });
    return;
  }
  try {
    const { token, serviceTimeSec } = completeService(branchId, tellerId);
    const state = broadcast(branchId);
    io.to(roomFor(branchId)).emit("service_completed", { branchId, token, serviceTimeSec });
    res.json({ ok: true, token, serviceTimeSec, state });
  } catch (err) {
    const status = err instanceof QueueError ? err.status : 500;
    res.status(status).json({ error: (err as Error).message });
  }
});

app.post("/api/teller/no-show", (req, res) => {
  const { branchId, tellerId } = req.body ?? {};
  if (!branchId || !tellerId) {
    res.status(400).json({ error: "branchId and tellerId are required" });
    return;
  }
  try {
    const token = markNoShow(branchId, tellerId);
    const state = broadcast(branchId);
    io.to(roomFor(branchId)).emit("token_removed", {
      branchId,
      token,
      reason: "no_show",
    });
    res.json({ ok: true, token, state });
  } catch (err) {
    const status = err instanceof QueueError ? err.status : 500;
    res.status(status).json({ error: (err as Error).message });
  }
});

// ---------- Pause / Resume Counter ----------

app.post("/api/teller/pause", (req, res) => {
  const { branchId, tellerId } = req.body ?? {};
  if (!branchId || !tellerId) {
    res.status(400).json({ error: "branchId and tellerId are required" });
    return;
  }
  pauseTeller(branchId, tellerId);
  const state = broadcast(branchId);
  res.json({ ok: true, state });
});

app.post("/api/teller/resume", (req, res) => {
  const { branchId, tellerId } = req.body ?? {};
  if (!branchId || !tellerId) {
    res.status(400).json({ error: "branchId and tellerId are required" });
    return;
  }
  resumeTeller(branchId, tellerId);
  const state = broadcast(branchId);
  res.json({ ok: true, state });
});

// ---------- Transfer Token ----------

app.post("/api/teller/transfer", (req, res) => {
  const { branchId, tokenId, newServiceType } = req.body ?? {};
  if (!branchId || !tokenId || !newServiceType) {
    res.status(400).json({ error: "branchId, tokenId, and newServiceType are required" });
    return;
  }
  const token = transferToken(branchId, tokenId, newServiceType);
  if (!token) {
    res.status(404).json({ error: "Token not found or not in waiting state" });
    return;
  }
  const state = broadcast(branchId);
  res.json({ ok: true, token, state });
});

// --- New: Get currently-being-served tokens for a branch ---
app.get("/api/teller/serving/:branchId", (req, res) => {
  const branchId = req.params.branchId;
  const state = buildQueueState(branchId);
  res.json({ serving: state.nowServingList });
});

// --- New: Admin daily reset ---
app.post("/api/admin/reset/:branchId", (req, res) => {
  const branchId = req.params.branchId;
  try {
    const clearedCount = resetBranch(branchId);
    const state = broadcast(branchId);
    res.json({ ok: true, clearedCount, state });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- New: Activity log ---
app.get("/api/admin/activity/:branchId", (req, res) => {
  const branchId = req.params.branchId;
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const activity = getActivityLog(branchId, limit);
  res.json(activity);
});

// --- New: Hourly stats for analytics chart ---
app.get("/api/admin/hourly-stats/:branchId", (req, res) => {
  const branchId = req.params.branchId;
  const hours = Math.min(24, Math.max(1, parseInt(req.query.hours as string) || 8));
  const stats = getHourlyStats(branchId, hours);
  res.json(stats);
});

// ---------- Feedback ----------

app.post("/api/feedback", (req, res) => {
  const { tokenId, rating, comment } = req.body ?? {};
  if (!tokenId || !rating || rating < 1 || rating > 3) {
    res.status(400).json({ error: "tokenId and rating (1-3) are required" });
    return;
  }
  try {
    const id = `fb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    insertFeedback(id, tokenId, Number(rating), comment ?? null);
    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/api/admin/feedback-stats/:branchId", (req, res) => {
  const branchId = req.params.branchId;
  const stats = getFeedbackStats(branchId);
  res.json(stats);
});

// ---------- Admin auth endpoints ----------

app.post("/api/admin/login", (req, res) => {
  const { username, pin } = req.body ?? {};
  if (!username || pin === undefined) {
    res.status(400).json({ error: "username and pin are required" });
    return;
  }
  const admin = getAdminByUsername(String(username).toLowerCase());
  if (!admin || !admin.active) {
    res.status(404).json({ ok: false, error: "Admin not found" });
    return;
  }
  if (admin.pin !== String(pin)) {
    res.status(401).json({ ok: false, error: "Invalid PIN" });
    return;
  }
  const token = createAdminSession({ id: admin.id, username: admin.username });
  res.json({ ok: true, token, admin: { id: admin.id, username: admin.username } });
});

app.post("/api/admin/logout", (req, res) => {
  const token = (req.headers["x-admin-token"] as string | undefined) ?? (req.query.adminToken as string | undefined);
  destroyAdminSession(token);
  res.json({ ok: true });
});

app.get("/api/admin/me", requireAdmin, (req, res) => {
  const session = (req as express.Request & { adminSession?: AdminSession }).adminSession!;
  res.json({ ok: true, admin: { id: session.adminId, username: session.username } });
});

// ETA accuracy analytics (admin-only)
app.get("/api/admin/eta-accuracy/:branchId", requireAdmin, (req, res) => {
  const stats = getEtaAccuracy(req.params.branchId);
  res.json(stats);
});

// ---------- Public ETA confidence endpoint ----------

app.get("/api/eta-confidence/:branchId", (req, res) => {
  const stats = getEtaAccuracy(req.params.branchId);
  const { sampleSize, within60sPct, mape } = stats;
  let confidence: "high" | "medium" | "low" = "low";
  if (within60sPct >= 60 && mape <= 0.3) confidence = "high";
  else if (within60sPct >= 30) confidence = "medium";
  res.json({ sampleSize, within60sPct, mape, confidence });
});

// ---------- Admin CRUD (all routes below require admin auth) ----------

app.use("/api/admin/", requireAdmin);

// ---------- Admin CRUD ----------

// Branches
app.post("/api/admin/branch", (req, res) => {
  const { id, name, location, dailyResetEnabled } = req.body ?? {};
  if (!id || !name || !location) {
    res.status(400).json({ error: "id, name, and location are required" });
    return;
  }
  if (getBranchById(id)) {
    res.status(409).json({ error: "Branch with this ID already exists" });
    return;
  }
  const branch = createBranch(id, name, location, Boolean(dailyResetEnabled));
  res.status(201).json({ ok: true, branch });
});

app.patch("/api/admin/branch/:id", (req, res) => {
  const id = req.params.id;
  const { name, location, active, dailyResetEnabled } = req.body ?? {};
  const existing = getBranchById(id);
  if (!existing) {
    res.status(404).json({ error: "Branch not found" });
    return;
  }
  const branch = updateBranch(id, {
    name,
    location,
    active: active === undefined ? undefined : Boolean(active),
    dailyResetEnabled: dailyResetEnabled === undefined ? undefined : Boolean(dailyResetEnabled),
  });
  res.json({ ok: true, branch });
});

// Service Types
app.post("/api/admin/service-type", (req, res) => {
  const { id, name, estimatedSec } = req.body ?? {};
  if (!id || !name || estimatedSec === undefined) {
    res.status(400).json({ error: "id, name, and estimatedSec are required" });
    return;
  }
  if (getServiceTypeById(id)) {
    res.status(409).json({ error: "Service type with this ID already exists" });
    return;
  }
  const st = createServiceType(id, name, Number(estimatedSec));
  res.status(201).json({ ok: true, serviceType: st });
});

app.patch("/api/admin/service-type/:id", (req, res) => {
  const id = req.params.id;
  const { name, estimatedSec, active } = req.body ?? {};
  const existing = getServiceTypeById(id);
  if (!existing) {
    res.status(404).json({ error: "Service type not found" });
    return;
  }
  const st = updateServiceType(id, { name, estimatedSec: estimatedSec !== undefined ? Number(estimatedSec) : undefined, active });
  res.json({ ok: true, serviceType: st });
});

// Tellers
app.post("/api/admin/teller", (req, res) => {
  const { id, name, branchId, pin } = req.body ?? {};
  if (!id || !name || !branchId) {
    res.status(400).json({ error: "id, name, and branchId are required" });
    return;
  }
  if (getTellerById(id)) {
    res.status(409).json({ error: "Teller with this ID already exists" });
    return;
  }
  const teller = createTeller(id, name, branchId, pin ?? "0000");
  // Pin is not returned in the response for security
  const { pin: _, ...safeTeller } = teller;
  res.status(201).json({ ok: true, teller: safeTeller });
});

app.patch("/api/admin/teller/:id", (req, res) => {
  const id = req.params.id;
  const { name, branchId, pin, active } = req.body ?? {};
  const existing = getTellerById(id);
  if (!existing) {
    res.status(404).json({ error: "Teller not found" });
    return;
  }
  const teller = updateTeller(id, { name, branchId, pin, active });
  // Pin is not returned in the response for security
  const { pin: _, ...safeTeller } = teller!;
  res.json({ ok: true, teller: safeTeller });
});

// ---------- Admin PIN Change ----------

app.post("/api/admin/change-pin", (req, res) => {
  const session = (req as express.Request & { adminSession?: AdminSession }).adminSession!;
  const { currentPin, newPin } = req.body ?? {};
  if (!currentPin || !newPin) {
    res.status(400).json({ error: "currentPin and newPin are required" });
    return;
  }
  if (!/^\d{4,}$/.test(String(newPin))) {
    res.status(400).json({ error: "New PIN must be at least 4 digits" });
    return;
  }
  const admin = getAdminById(session.adminId);
  if (!admin) {
    res.status(404).json({ error: "Admin not found" });
    return;
  }
  if (admin.pin !== String(currentPin)) {
    res.status(401).json({ error: "Current PIN is incorrect" });
    return;
  }
  updateAdminPin(admin.id, String(newPin));
  res.json({ ok: true });
});

// ---------------- Socket.IO (port 3003, path "/") ----------------
const wsServer = createServer();
const io = new Server(wsServer, {
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

function roomFor(branchId: string): string {
  return `branch:${branchId}`;
}

/** Broadcast the latest queue snapshot to every WS client watching a branch. */
function broadcast(branchId: string): QueueState {
  const state = buildQueueState(branchId);
  io.to(roomFor(branchId)).emit("queue_updated", state);
  return state;
}

io.on("connection", (socket) => {
  console.log(`[WS] connected: ${socket.id}`);

  socket.on("subscribe", (data: { branchId?: string }) => {
    const branchId = data?.branchId;
    if (!branchId) return;
    socket.join(roomFor(branchId));
    socket.data.branchId = branchId;
    socket.emit("queue_updated", buildQueueState(branchId));
    console.log(`[WS] ${socket.id} subscribed to ${branchId}`);
  });

  socket.on("unsubscribe", (data: { branchId?: string }) => {
    const branchId = data?.branchId;
    if (!branchId) return;
    socket.leave(roomFor(branchId));
  });

  socket.on("disconnect", () => {
    console.log(`[WS] disconnected: ${socket.id}`);
  });

  socket.on("error", (err) => {
    console.error(`[WS] error (${socket.id}):`, err);
  });
});

wsServer.listen(WS_PORT, () => {
  console.log(`Q-Smart WebSocket server on port ${WS_PORT} (path "/")`);
});

const restServer = createServer(app);
restServer.listen(REST_PORT, () => {
  console.log(`Q-Smart REST server on port ${REST_PORT}`);
  console.log(`  WS:   io("/?XTransformPort=${WS_PORT}")`);
  console.log(`  REST: /api/...?XTransformPort=${REST_PORT}`);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down...");
  wsServer.close();
  restServer.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down...");
  wsServer.close();
  restServer.close(() => process.exit(0));
});
