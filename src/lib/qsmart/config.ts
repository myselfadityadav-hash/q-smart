// Central configuration for the Q-Smart frontend.
//
// The Q-Smart backend is a separate mini-service. The gateway (Caddy) routes
// browser requests to it when the URL carries ?XTransformPort=<port>.
//   * REST API  -> port 3004
//   * WebSocket -> port 3003 (Socket.IO path MUST be "/")
//
// All requests use relative paths only (never absolute URLs / localhost).

export const WS_PORT = 3003;
export const REST_PORT = 3004;

/** Query-string fragment to route a REST call to the backend. */
export const REST_TRANSFORM = `XTransformPort=${REST_PORT}`;

/** Build a relative REST URL with the gateway transform query appended. */
export function restUrl(path: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${REST_TRANSFORM}`;
}

/** Relative URL + query the socket.io client must connect to. */
export const SOCKET_URL = `/?XTransformPort=${WS_PORT}`;
