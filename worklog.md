# Q-Smart — Project Worklog / Handover

This file is the single source of truth for project progress. Every agent must
read it before working and append (never overwrite) a new `---` section after
finishing a Task ID.

---
Task ID: 1
Agent: Senior Full-Stack Engineer (main)
Task: Build the complete, runnable Q-Smart Real-Time Virtual Queuing MVP.

Work Log:
- Explored the sandbox: Next.js 16 (App Router, single user route `/`), Tailwind 4,
  shadcn/ui, Prisma+SQLite, Caddy gateway requiring `?XTransformPort=<port>` for
  cross-service routing, Socket.IO mini-service pattern (path `/`).
- Decided architecture: Next.js frontend on `/` + a Node/TS backend mini-service
  (`mini-services/q-smart-queue`) providing REST (:3004) + Socket.IO (:3003,
  path `/`) + SQLite persistence + in-memory live queue state. This adapts the
  requested FastAPI/Postgres/Redis/Docker stack 1:1 to the sandbox (mapping
  documented in README.md). Included `docker-compose.yml` + `backend/requirements.txt`
  as the reference target-stack artifacts.
- Built backend (`mini-services/q-smart-queue/src/`):
  - `types.ts` shared domain types.
  - `db.ts` bun:sqlite schema (branches, service_types, tellers, tokens) + seeds
    (3 branches, 4 service types, 4 tellers) + queries; WAL mode.
  - `state.ts` in-memory live state (queue FIFO, nowServing, per-branch counter,
    rolling average of last 20 service durations) + join/callNext/complete/
    noShow/leave logic + hydrate-from-DB on startup.
  - `index.ts` Express REST on :3004 + Socket.IO on :3003 (path `/`) sharing one
    process; REST handlers mutate state then `io.to(branch).emit("queue_updated")`.
  - Resolved a critical gateway issue: Socket.IO `path: "/"` makes engine.io
    intercept ALL HTTP on that port, so REST cannot share :3003. Split into two
    servers (WS :3003 path `/`, REST :3004) in one process sharing the `io` instance.
- Built frontend (`src/`):
  - `lib/qsmart/`: types, config (ports + XTransformPort), REST api client,
    socket singleton + `useQueueSubscription` hook, data hooks, format helpers.
  - `components/qsmart/QueueCard.tsx` (reusable hero + compact variants),
    `LandingView.tsx` (branch picker + live QR code + role chooser + how-it-works),
    `CustomerView.tsx` (mobile-first, localStorage token persistence, real-time
    position/ETA, called/complete/no-show states, vibration + toasts),
    `TellerView.tsx` (desktop, now-serving + elapsed timer, Call Next/Complete/
    No-Show, live upcoming list, stats, branch+teller sign-in).
  - `app/page.tsx` single-route view switcher via `useSearchParams` (`?view=
    landing|customer|teller&branch=<id>`), sticky header + sticky footer
    (`min-h-screen flex flex-col` + `mt-auto`).
- Installed deps: `socket.io-client`, `qrcode.react` (frontend); `express`,
  `socket.io`, `cors` (backend).
- Lint clean (`bun run lint`). Fixed SSR `localStorage is not defined` error
  (TellerView initializer) and a hydration-mismatch risk (CustomerView) by
  moving localStorage reads into effects.

Stage Summary:
- All three services run: Next.js :3000, backend WS :3003, backend REST :3004.
- Verified end-to-end with agent-browser (through the gateway on :81):
  - Landing renders branches + QR + role chooser, no errors.
  - Customer: Get Token → Token #01, Waiting, position #1, ETA 3m, live queue
    highlights "You", connection Live.
  - Teller (new tab): Call Next → customer tab updates in real time to
    "Called" + "It's your turn!" (no refresh). Complete → customer shows
    "Service complete"; teller rolling avg updates (180s→31s), served-today++.
  - No-Show path: Call Next + No-Show → "Marked as no-show", no-shows stat++,
    nowServing cleared, queue positions recomputed.
  - Multi-customer: 3 tokens added via API → teller upcoming list shows all
    with positions + ETAs in real time.
  - Mobile (iPhone 14) layout verified; sticky footer verified on short page
    (gapBelowFooter = 0) and natural push on long page; no overlap.
  - Backend state consistency confirmed via curl (served/noShow/avg/positions).
- DB was reset to a clean state for the user's first impression.

Unresolved issues / risks:
- SQLite single-file DB is fine for the MVP but is not the requested Postgres;
  see README for the 1:1 migration path to the Python target stack.
- The backend is a single in-memory process (no horizontal scaling); acceptable
  for MVP, matches the Redis-equivalent role. State survives restarts via
  SQLite hydration.
- Token numbering is per-branch ever-incrementing (not daily-reset); could be
  made daily if desired.
- No authentication on teller actions (anyone can open the dashboard); add
  NextAuth or a teller PIN for production.

Priority recommendations for the next phase (cron webDevReview):
1. Add a customer "approx. call time" clock and a subtle progress bar toward
   being called; add sound notification toggle.
2. Teller: per-teller "currently serving" multi-counter support (multiple
   tellers serving in parallel), transfer/redirect a token, and a daily
   reset + export CSV of the day's logs.
3. Admin view: branch management (add/disable branches, service types, tellers)
   and a real-time analytics chart (throughput, avg wait, no-show rate).
4. Auth: simple teller login (NextAuth credentials) + branch-scoped permissions.
5. Polish: dark-mode toggle (next-themes provider is available), empty-state
   illustrations, and skeleton loaders during metadata fetch.
