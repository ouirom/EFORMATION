import type { Server as SocketServer } from 'socket.io';

/**
 * Pushes "your session ended" to the sockets of revoked sessions, so a tab
 * signed out by a login elsewhere learns it at once instead of on its next API
 * call (which would fail with 401 anyway). Kept apart from socket/index.ts so
 * services can use it without importing the socket handlers (and, through
 * them, the auth middleware).
 *
 * Every socket joins `session:<sid>` when it connects (see setupSocketIO).
 */
let io: SocketServer | null = null;

export function setSessionEventsServer(server: SocketServer | null): void {
  io = server;
}

export function sessionRoom(sid: string): string {
  return `session:${sid}`;
}

/** Emits `session:revoked` to each session's sockets, then disconnects them. No-op without a socket server. */
export function emitSessionsRevoked(sids: string[], payload: { reason: string }): void {
  if (!io || sids.length === 0) return;
  for (const sid of sids) {
    const room = sessionRoom(sid);
    io.to(room).emit('session:revoked', payload);
    // The client logs out on the event; dropping the socket also stops it from
    // receiving anything else meant for the user.
    io.in(room).disconnectSockets(false);
  }
}
