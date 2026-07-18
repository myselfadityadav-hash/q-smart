// Socket.IO client for the Q-Smart real-time channel.
//
// Connects through the gateway to the backend WebSocket server (port 3003,
// path "/"). Exposes a singleton socket plus a React hook that subscribes to
// a branch and tracks the live QueueState + connection status.

"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { SOCKET_URL } from "./config";
import type { QueueState } from "./types";

let socket: Socket | null = null;

/** Lazily create (and cache) the singleton socket connection. */
export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(SOCKET_URL, {
    path: "/",
    transports: ["websocket", "polling"],
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });
  return socket;
}


interface QueueSubscription {
  state: QueueState | null;
  connected: boolean;
  /** Called (once) whenever a `token_called` event fires for this branch. */
  onTokenCalled?: (tokenId: string) => void;
}

/**
 * Subscribe to a branch's live queue updates. Re-subscribes whenever branchId
 * changes. Returns the latest state + connection flag.
 */
export function useQueueSubscription(
  branchId: string | null | undefined,
  onTokenCalled?: (tokenId: string) => void
): { state: QueueState | null; connected: boolean } {
  const [state, setState] = useState<QueueState | null>(null);
  const [connected, setConnected] = useState(false);
  const cbRef = useRef(onTokenCalled);
  useEffect(() => {
    cbRef.current = onTokenCalled;
  }, [onTokenCalled]);

  useEffect(() => {
    if (!branchId) return;
    const s = getSocket();

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);
    const handleQueueUpdated = (next: QueueState) => {
      if (next.branchId === branchId) setState(next);
    };
    const handleTokenCalled = (payload: { branchId: string; token: { id: string } }) => {
      if (payload.branchId === branchId) cbRef.current?.(payload.token.id);
    };

    s.on("connect", handleConnect);
    s.on("disconnect", handleDisconnect);
    s.on("queue_updated", handleQueueUpdated);
    s.on("token_called", handleTokenCalled);

    // Sync initial connection state for an already-connected singleton socket.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (s.connected) setConnected(true);
    s.emit("subscribe", { branchId });

    return () => {
      s.off("connect", handleConnect);
      s.off("disconnect", handleDisconnect);
      s.off("queue_updated", handleQueueUpdated);
      s.off("token_called", handleTokenCalled);
      s.emit("unsubscribe", { branchId });
    };
  }, [branchId]);

  return { state, connected };
}

/** Fetch the initial state once (used to seed before the socket delivers). */
export { };
