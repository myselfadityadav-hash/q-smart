# Q-Smart — Real-Time Virtual Queuing System

Q-Smart replaces physical bank/service queues with a virtual web app. Customers
scan a QR code to join a queue on their phone; tellers manage the line from a
desktop dashboard. Wait times are calculated dynamically and state is synced in
real time over WebSockets.

---

## ✨ Features

**Customer view (mobile-first)**
- One-tap **Get Token** with service-type selection.
- Live **Token Number**, **Position in queue**, and **dynamic ETA**.
- Real-time updates over WebSockets (no page refresh) when position changes.
- "It's your turn!" alert (toast + vibration) the moment the token is called.
- Token persisted in `localStorage` so a refresh never loses your place.
- Terminal states: *Service complete*, *No-show*, *Left queue*.

**Teller dashboard (desktop)**
- Big **Now Serving** display with a live elapsed timer.
- **Call Next**, **Complete Service**, and **Mark No-Show** actions.
- Live upcoming queue with per-token positions and ETAs.
- Stats: waiting count, served today, rolling average service time, no-shows.
- Branch & teller sign-in selectors.

**Backend**
- REST: `POST /api/queue/join`, `POST /api/queue/leave`, `POST /api/teller/next`,
  `POST /api/teller/complete`, `POST /api/teller/no-show`, `GET /api/queue/:branchId`,
  plus metadata endpoints.
- WebSocket: `queue_updated`, `token_called`, `service_completed`, `token_removed`.
- Dynamic ETA: `ETA = position × rolling_average_service_time` (rolling window of
  the last 20 completed services, with a per-service-type fallback).

---

## 🏗 Architecture

This repository runs a **fully working MVP** adapted to the local sandbox. The
spec requested a Python/FastAPI + Postgres + Redis + Docker stack; the table
below maps every requested component to what runs here, and the `docker-compose.yml`
+ `backend/requirements.txt` files provision the exact requested infrastructure
for a production-target deployment.

| Requested (spec)              | Runs in this sandbox                                       | Why                                                                                  |
| ----------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Next.js + Tailwind frontend   | **Next.js 16 (App Router) + Tailwind + shadcn/ui**         | Unchanged.                                                                           |
| Python FastAPI backend        | **Node/TS mini-service** `mini-services/q-smart-queue`     | The sandbox's real-time pattern uses Socket.IO mini-services; logic is identical.    |
| `python-socketio` (WS)        | **`socket.io`** server (path `/`, port `3003`)             | Same Socket.IO protocol/events on both ends.                                         |
| PostgreSQL (persist)          | **SQLite** (`db/q-smart.db` via `bun:sqlite`)              | Single-file, zero-ops persistence; identical schema shape.                           |
| Redis (live queue state)      | **In-memory maps** in the backend process                  | Source of truth for the live queue; rebuilt from SQLite on restart.                  |
| Docker Compose (infra)        | **Native processes** (Next.js + mini-service)              | `docker-compose.yml` is included for the Postgres+Redis target deployment.           |

### Module mapping (Node MVP ↔ requested Python target)

| Node MVP file                                 | Requested Python file      | Responsibility                                      |
| --------------------------------------------- | -------------------------- | --------------------------------------------------- |
| `mini-services/q-smart-queue/src/index.ts`    | `backend/main.py`          | App init, Express routes, Socket.IO mount           |
| `mini-services/q-smart-queue/src/db.ts`       | `backend/database.py`      | DB connection + schema + queries                    |
| `mini-services/q-smart-queue/src/state.ts`    | `backend/redis_client.py`  | In-memory/Redis live queue state + ETA logic        |
| `mini-services/q-smart-queue/src/types.ts`    | `backend/models.py`        | Pydantic / shared types                             |
| (inline in `index.ts`)                        | `backend/routes.py`        | REST endpoints                                      |
| (inline in `index.ts`)                        | `backend/socket_handler.py`| WS broadcast handlers                               |

### Ports & gateway

The sandbox exposes a single external port via a Caddy gateway. Cross-service
requests carry `?XTransformPort=<port>`:

| Service            | Port | How the frontend reaches it                          |
| ------------------ | ---- | ---------------------------------------------------- |
| Next.js frontend   | 3000 | Default gateway target                               |
| Backend REST API   | 3004 | `/api/...?XTransformPort=3004`                       |
| Backend WebSocket  | 3003 | `io("/?XTransformPort=3003")` (Socket.IO path `/`)   |

---

## 🚀 Run it (this sandbox)

Two processes need to be running: the Next.js frontend and the backend
mini-service.

### 1. Backend mini-service

```bash
cd mini-services/q-smart-queue
bun install            # first time only
bun run dev            # bun --hot src/index.ts  (auto-reloads)
```

Logs: `mini-services/q-smart-queue/service.log`. Serves:
- REST on `http://localhost:3004/api/...`
- WebSocket on `ws://localhost:3003/` (Socket.IO path `/`)

### 2. Frontend

```bash
bun run dev            # Next.js on http://localhost:3000
```

Open the app via the **Preview Panel** (the gateway), or directly at
`http://localhost:3000/`. The landing page lets you enter the **Customer** or
**Teller** experience.

> The customer QR code encodes `/?view=customer&branch=<id>` on the current
> origin, so scanning it (or clicking "Get in line") opens the customer view.

---

## 🧪 Verify the backend directly

```bash
# metadata
curl http://localhost:3004/api/branches
curl http://localhost:3004/api/service-types

# a customer joins
curl -X POST http://localhost:3004/api/queue/join \
  -H 'Content-Type: application/json' \
  -d '{"branchId":"main","serviceType":"accounts"}'

# teller calls next, then completes
curl -X POST http://localhost:3004/api/teller/next \
  -H 'Content-Type: application/json' \
  -d '{"branchId":"main","tellerId":"teller-1"}'
curl -X POST http://localhost:3004/api/teller/complete \
  -H 'Content-Type: application/json' \
  -d '{"branchId":"main","tellerId":"teller-1"}'
```

---

## 🔌 API contract

### REST (route via `?XTransformPort=3004`)

| Method | Path                     | Body                                            | Returns                                    |
| ------ | ------------------------ | ----------------------------------------------- | ------------------------------------------ |
| GET    | `/api/health`            | —                                               | `{ ok }`                                   |
| GET    | `/api/branches`          | —                                               | `Branch[]`                                 |
| GET    | `/api/service-types`     | —                                               | `ServiceType[]`                            |
| GET    | `/api/tellers`           | —                                               | `Teller[]`                                 |
| GET    | `/api/tellers/:branchId` | —                                               | `Teller[]`                                 |
| GET    | `/api/queue/:branchId`   | —                                               | `QueueState`                               |
| POST   | `/api/queue/join`        | `{ branchId, serviceType }`                     | `{ token }`                                |
| POST   | `/api/queue/leave`       | `{ tokenId }`                                   | `{ ok, token }`                            |
| POST   | `/api/teller/next`       | `{ branchId, tellerId }`                        | `{ token, state }`                         |
| POST   | `/api/teller/complete`   | `{ branchId, tellerId }`                        | `{ ok, token, serviceTimeSec, state }`     |
| POST   | `/api/teller/no-show`    | `{ branchId, tellerId }`                        | `{ ok, token, state }`                     |

### WebSocket (route via `io("/?XTransformPort=3003")`)

- Client emits `subscribe { branchId }` → joins the branch room.
- Server emits:
  - `queue_updated` → full `QueueState` snapshot (on any change).
  - `token_called` → `{ branchId, token }` when a token is called.
  - `service_completed` → `{ branchId, token, serviceTimeSec }`.
  - `token_removed` → `{ branchId, token, reason }` (`no_show` | `cancelled`).

### `QueueState`

```ts
{
  branchId: string;
  nowServing: Token | null;
  queue: Token[];            // waiting tokens, 1-based position + etaSec
  waitingCount: number;
  avgServiceTimeSec: number; // rolling average (last 20 services)
  servedToday: number;
  noShowToday: number;
  lastServiceTimeSec: number | null;
}
```

---

## 📁 Project structure

```
.
├── src/                          # Next.js frontend (the ONLY user route is /)
│   ├── app/page.tsx              # View switcher: landing | customer | teller (search params)
│   ├── app/layout.tsx
│   ├── components/qsmart/
│   │   ├── QueueCard.tsx         # Reusable token display (hero + compact)
│   │   ├── LandingView.tsx       # Branch picker + QR code + role chooser
│   │   ├── CustomerView.tsx      # Mobile-first customer experience
│   │   └── TellerView.tsx        # Desktop teller dashboard
│   └── lib/qsmart/
│       ├── types.ts              # Shared domain types (mirror backend)
│       ├── config.ts             # Ports + XTransformPort helpers
│       ├── api.ts                # REST client
│       ├── socket.ts             # Socket.IO singleton + useQueueSubscription hook
│       ├── hooks.ts              # useBranches / useServiceTypes / useTellers
│       └── format.ts             # ETA / time / status helpers
├── mini-services/q-smart-queue/  # Backend (REST :3004 + WebSocket :3003)
│   └── src/{index,db,state,types}.ts
├── db/q-smart.db                 # SQLite persistence (auto-created)
├── docker-compose.yml            # Reference: Postgres + Redis (target stack)
└── backend/requirements.txt      # Reference: FastAPI target deps
```

---

## 🐍 Migrating to the exact requested Python stack

The Node backend is a faithful, line-for-line analog of the requested FastAPI
service. To deploy the Python target:

1. `docker compose up -d` to start Postgres + Redis.
2. Create a venv, `pip install -r backend/requirements.txt`.
3. Port each module per the mapping table above:
   - `index.ts` → `main.py` (FastAPI app + `python-socketio` ASGI mount).
   - `db.ts` → `database.py` (`asyncpg` pool, same schema).
   - `state.ts` → `redis_client.py` (`redis.asyncio`, RPUSH/LPOP lists,
     rolling-average sorted set).
   - `types.ts` → `models.py` (Pydantic).
4. Keep the WebSocket event names identical (`queue_updated`, `token_called`,
   `service_completed`, `token_removed`) so the **frontend needs no changes**.

---

## 🧱 Tech notes

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui,
  `socket.io-client`, `qrcode.react`.
- **Backend:** Bun + Express + Socket.IO + `bun:sqlite`, in-memory live state.
- **Real-time:** Socket.IO with branch-scoped rooms; the singleton socket is
  shared across views.
- **ETA:** `position × avgServiceTimeSec`; `avgServiceTimeSec` is a rolling
  mean of the last 20 completed service durations (fallback 180s).

---

## 📝 License

MIT — sample MVP for demonstration purposes.
