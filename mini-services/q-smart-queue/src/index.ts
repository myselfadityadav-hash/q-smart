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
import { Server } from "socket.io";
import type { QueueState } from "./types.js";
import {
  getActivityLog,
  getBranches,
  getServiceTypes,
  getTellers,
  getTellersByBranch,
  seedIfEmpty,
} from "./db.js";
import {
  QueueError,
  buildQueueState,
  callNext,
  completeService,
  hydrateFromDb,
  joinQueue,
  leaveQueue,
  markNoShow,
  resetBranch,
} from "./state.js";

const WS_PORT = 3003;
const REST_PORT = 3004;

seedIfEmpty();
hydrateFromDb(getBranches().map((b) => b.id));

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
  const { branchId, serviceType } = req.body ?? {};
  if (!branchId || !serviceType) {
    res.status(400).json({ error: "branchId and serviceType are required" });
    return;
  }
  try {
    const token = joinQueue(branchId, serviceType);
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
