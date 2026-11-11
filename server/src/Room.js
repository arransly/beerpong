import { ROOM, SEAT_ORDER, SLOTS, PHYSICS } from '@bptt/shared/constants.js';
import { S2C } from '@bptt/shared/protocol.js';
import { Match } from './rules.js';
import { createBotBrain, updateBot } from './bot.js';

const BOT_NAMES = ['Chugbot', 'Pintsize', 'Foamy', 'Hopper', 'Lagerbot', 'Stoutie', 'Malty', 'Fizz'];
const SNAPSHOT_EVERY = Math.round(PHYSICS.tickRate / PHYSICS.snapshotRate);

export class Room {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.members = new Map();
    this.slots = SLOTS.map(() => null);
    this.queue = [];
    this.hostId = null;
    this.match = new Match(this);
    this.dirty = true;
    this.tickCount = 0;
    this.emptySince = Date.now();
  }

  get channel() {
    return `room:${this.code}`;
  }

  humans() {
    return [...this.members.values()].filter((m) => !m.isBot);
  }

  connectedHumans() {
    return this.humans().filter((m) => m.connected);
  }

  slotOf(memberId) {
    return this.slots.indexOf(memberId);
  }

  memberInSlot(slot) {
    const id = this.slots[slot];
    return id ? this.members.get(id) : null;
  }

  markDirty() {
    this.dirty = true;
  }

  emitEvent(event) {
    this.io.to(this.channel).emit(S2C.EVENT, event);
  }

  join({ id, name, socket }) {
    const existing = this.members.get(id);
    if (existing && !existing.isBot) {
      if (existing.socketId && existing.socketId !== socket.id) {
        this.io.sockets.sockets.get(existing.socketId)?.leave(this.channel);
      }
      clearTimeout(existing.leaveTimer);
      existing.leaveTimer = null;
      existing.socketId = socket.id;
      existing.connected = true;
      existing.name = name || existing.name;
      socket.join(this.channel);
      this.markDirty();
      return { ok: true, member: existing };
    }

    const seatsOpen = !this.match.inMatch;
    const freeSlot = seatsOpen ? SEAT_ORDER.find((s) => this.slots[s] === null) : undefined;
    const spectatorCount = this.queue.filter((id) => !this.members.get(id)?.isBot).length;
    if (freeSlot === undefined && spectatorCount >= ROOM.maxSpectators) {
      return { ok: false, error: 'This room is full (4 players + 8 spectators).' };
    }

    const member = {
      id,
      name,
      socketId: socket.id,
      connected: true,
      isBot: false,
      camera: false,
      leaveTimer: null,
    };
    this.members.set(id, member);
    if (freeSlot !== undefined) this.slots[freeSlot] = id;
    else {
      this.queue.push(id);
      this.match.requestFill();
    }
    if (!this.hostId || !this.members.get(this.hostId)?.connected) this.hostId = id;
    socket.join(this.channel);
    if (freeSlot !== undefined && !this.match.inMatch) this.match.glasses[freeSlot].active = true;
    this.markDirty();
    return { ok: true, member };
  }

  disconnect(memberId) {
    const member = this.members.get(memberId);
    if (!member || member.isBot) return;
    member.connected = false;
    member.socketId = null;
    this.markDirty();
    clearTimeout(member.leaveTimer);
    member.leaveTimer = setTimeout(() => this.leave(memberId), ROOM.disconnectGraceMs);
    if (this.hostId === memberId) this.pickHost();
  }

  leave(memberId) {
    const member = this.members.get(memberId);
    if (!member) return;
    clearTimeout(member.leaveTimer);
    if (member.socketId) this.io.sockets.sockets.get(member.socketId)?.leave(this.channel);
    this.members.delete(memberId);
    this.queue = this.queue.filter((id) => id !== memberId);
    const slot = this.slotOf(memberId);
    if (slot >= 0) {
      this.slots[slot] = null;
      if (this.match.inMatch) {
        this.match.onVacancy(slot);
      } else {
        this.fillSlots([slot]);
        this.match.glasses[slot].active = this.slots[slot] !== null;
      }
    }
    if (this.hostId === memberId) this.pickHost();
    if (this.connectedHumans().length === 0) this.emptySince = Date.now();
    this.markDirty();
  }

  pickHost() {
    const next = this.connectedHumans()[0];
    this.hostId = next ? next.id : null;
    this.markDirty();
  }

  unseat(memberId) {
    const slot = this.slotOf(memberId);
    if (slot >= 0) this.slots[slot] = null;
  }

  // Eliminated players go to the back of the queue; bots just leave.
  requeue(memberId) {
    const member = this.members.get(memberId);
    if (!member) return;
    if (member.isBot) {
      this.members.delete(memberId);
      return;
    }
    if (this.slotOf(memberId) < 0 && !this.queue.includes(memberId)) this.queue.push(memberId);
    this.markDirty();
  }

  fillSlots(slots) {
    const filled = [];
    for (const slot of slots) {
      if (this.slots[slot] !== null) continue;
      const idx = this.queue.findIndex((id) => this.members.get(id)?.connected);
      if (idx < 0) break;
      const [memberId] = this.queue.splice(idx, 1);
      this.slots[slot] = memberId;
      filled.push(slot);
    }
    if (filled.length) this.markDirty();
    return filled;
  }

  addBot() {
    if (this.match.inMatch) return;
    const slot = SEAT_ORDER.find((s) => this.slots[s] === null);
    if (slot === undefined) return;
    const used = new Set([...this.members.values()].map((m) => m.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) || `Bot ${slot + 1}`;
    const id = `bot-${Math.random().toString(36).slice(2, 8)}`;
    this.members.set(id, { id, name, isBot: true, connected: true, camera: false, brain: createBotBrain() });
    this.slots[slot] = id;
    this.match.glasses[slot].active = true;
    this.markDirty();
  }

  removeBot(slot) {
    if (this.match.inMatch) return;
    const member = this.memberInSlot(slot);
    if (!member?.isBot) return;
    this.members.delete(member.id);
    this.slots[slot] = null;
    this.fillSlots([slot]);
    this.match.glasses[slot].active = this.slots[slot] !== null;
    this.markDirty();
  }

  canStart() {
    return [0, 1].every((team) => this.match.occupiedSlots(team).length > 0);
  }

  start() {
    if (this.match.inMatch || !this.canStart()) return false;
    this.match.start();
    this.markDirty();
    return true;
  }

  restart() {
    if (this.match.inMatch) return;
    this.fillSlots(SEAT_ORDER);
    this.match.toLobby();
    this.markDirty();
  }

  setCamera(memberId, on) {
    const member = this.members.get(memberId);
    if (!member) return;
    member.camera = !!on;
    this.markDirty();
  }

  tick(dt) {
    for (let slot = 0; slot < this.slots.length; slot++) {
      const member = this.memberInSlot(slot);
      if (member?.isBot) updateBot(member.brain, this.match, slot, dt, this);
    }
    this.match.tick(dt);
    this.tickCount++;
    if (this.tickCount % SNAPSHOT_EVERY === 0) {
      this.io.to(this.channel).volatile.emit(S2C.SNAPSHOT, this.match.snapshot());
    }
    if (this.dirty) {
      this.dirty = false;
      this.io.to(this.channel).emit(S2C.STATE, this.serialize());
    }
  }

  serialize() {
    const members = {};
    for (const m of this.members.values()) {
      members[m.id] = { id: m.id, name: m.name, isBot: m.isBot, connected: m.connected, camera: m.camera };
    }
    return {
      code: this.code,
      hostId: this.hostId,
      slots: this.slots,
      queue: this.queue,
      members,
      canStart: this.canStart(),
      ...this.match.serialize(),
    };
  }

  isAbandoned(now) {
    return this.connectedHumans().length === 0 && now - this.emptySince > 60000;
  }

  destroy() {
    for (const m of this.members.values()) clearTimeout(m.leaveTimer);
  }
}
