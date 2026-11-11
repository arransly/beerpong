import './env.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { ROOM, PHYSICS } from '@bptt/shared/constants.js';
import { C2S, S2C } from '@bptt/shared/protocol.js';
import { Room } from './Room.js';
import { livekitTokenHandler, livekitConfigured } from './livekitToken.js';

const PORT = Number(process.env.PORT) || 3001;
const ORIGINS = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const rooms = new Map();
const app = express();
app.use(express.json({ limit: '4kb' }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (ORIGINS.length === 0 || ORIGINS.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health', (req, res) => {
  res.json({ ok: true, rooms: rooms.size, video: livekitConfigured() });
});
app.post('/livekit-token', livekitTokenHandler(rooms));

const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ORIGINS.length ? ORIGINS : true },
});

function newCode() {
  let code;
  do {
    code = Array.from({ length: ROOM.codeLength }, () =>
      CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

const cleanName = (name) =>
  String(name || '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, ROOM.maxNameLength) || 'Player';
const validId = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(id);

io.on('connection', (socket) => {
  let room = null;
  let memberId = null;

  const reply = (ack, payload) => typeof ack === 'function' && ack(payload);

  function enter(target, data, ack) {
    if (!validId(data?.playerId)) return reply(ack, { ok: false, error: 'Invalid player id.' });
    if (room && room !== target) room.leave(memberId);
    const result = target.join({ id: data.playerId, name: cleanName(data.name), socket });
    if (!result.ok) return reply(ack, result);
    room = target;
    memberId = data.playerId;
    reply(ack, { ok: true, code: room.code, memberId, socketId: socket.id });
    socket.emit(S2C.STATE, room.serialize());
  }

  socket.on(C2S.CREATE, (data, ack) => {
    const code = newCode();
    const created = new Room(code, io);
    rooms.set(code, created);
    enter(created, data, ack);
  });

  socket.on(C2S.JOIN, (data, ack) => {
    const code = String(data?.code || '').toUpperCase().trim();
    const target = rooms.get(code);
    if (!target) return reply(ack, { ok: false, error: `No room with code ${code || '?'}.` });
    enter(target, data, ack);
  });

  socket.on(C2S.LEAVE, () => {
    if (!room) return;
    room.leave(memberId);
    room = null;
    memberId = null;
  });

  socket.on(C2S.INPUT, (input) => {
    if (!room || !input) return;
    const slot = room.slotOf(memberId);
    if (slot >= 0) room.match.setInput(slot, input);
  });

  socket.on(C2S.SERVE, () => {
    if (!room) return;
    const slot = room.slotOf(memberId);
    if (slot >= 0) room.match.serve(slot);
  });

  const hostOnly = (fn) => (...args) => {
    if (room && room.hostId === memberId) fn(...args);
  };
  socket.on(C2S.START, hostOnly(() => room.start()));
  socket.on(C2S.RESTART, hostOnly(() => room.restart()));
  socket.on(C2S.ADD_BOT, hostOnly(() => room.addBot()));
  socket.on(C2S.REMOVE_BOT, hostOnly((slot) => room.removeBot(Number(slot))));

  socket.on(C2S.CAMERA, (on) => room?.setCamera(memberId, on));

  socket.on('disconnect', () => {
    if (room && room.members.get(memberId)?.socketId === socket.id) room.disconnect(memberId);
  });
});

const TICK_MS = 1000 / PHYSICS.tickRate;
const DT = 1 / PHYSICS.tickRate;
let last = performance.now();
let acc = 0;
setInterval(() => {
  const now = performance.now();
  acc = Math.min(acc + (now - last), TICK_MS * 5);
  last = now;
  while (acc >= TICK_MS) {
    acc -= TICK_MS;
    for (const room of rooms.values()) room.tick(DT);
  }
}, TICK_MS / 2);

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.isAbandoned(now)) {
      room.destroy();
      rooms.delete(code);
    }
  }
}, 10000);

server.listen(PORT, () => {
  console.log(`Beer Pong Table Tennis server on :${PORT} (face video ${livekitConfigured() ? 'on' : 'off'})`);
});
