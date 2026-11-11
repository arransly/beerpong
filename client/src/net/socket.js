import { io } from 'socket.io-client';

export const SERVER_URL = (import.meta.env.VITE_SERVER_URL || '').replace(/\/$/, '');

export function createConnection() {
  const socket = io(SERVER_URL || undefined, {
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 3000,
  });

  const request = (event, data) =>
    new Promise((resolve) => {
      socket.timeout(8000).emit(event, data, (err, response) => {
        resolve(err ? { ok: false, error: 'The game server did not respond. Try again.' } : response);
      });
    });

  return { socket, request };
}

export async function fetchLivekitToken({ code, playerId, socketId }) {
  const res = await fetch(`${SERVER_URL}/livekit-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, playerId, socketId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body.error || `Token request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}
