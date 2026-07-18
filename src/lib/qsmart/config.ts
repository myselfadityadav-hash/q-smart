// Central configuration for the Q-Smart frontend.
//
// Local development: the backend mini-service runs on localhost:3004 (REST)
// and localhost:3003 (WebSocket / Socket.IO path "/").

export const WS_PORT = 3003;
export const REST_PORT = 3004;

const BACKEND_HOST =
  typeof window !== "undefined"
    ? window.location.hostname  // use same host in browser
    : "localhost";

/** Build a full REST URL pointing directly at the backend on port 3004. */
export function restUrl(path: string): string {
  return `http://${BACKEND_HOST}:${REST_PORT}${path}`;
}

/** Socket.IO connection URL (direct to backend WS port). */
export const SOCKET_URL = `http://${BACKEND_HOST}:${WS_PORT}`;
