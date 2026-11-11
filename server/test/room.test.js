import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/Room.js';
import { PHYSICS } from '@bptt/shared/constants.js';
import { PHASE, EVENT, S2C } from '@bptt/shared/protocol.js';

function fakeIo() {
  const events = [];
  const channel = {
    emit: (name, payload) => name === S2C.EVENT && events.push(payload),
    volatile: { emit() {} },
  };
  return { events, to: () => channel, sockets: { sockets: new Map() } };
}

const fakeSocket = (id) => ({ id, join() {}, leave() {} });
const DT = 1 / PHYSICS.tickRate;

function run(room, seconds, until = () => false) {
  for (let i = 0; i < seconds * PHYSICS.tickRate; i++) {
    room.tick(DT);
    if (until()) return true;
  }
  return false;
}

test('a bot-only 2v2 match produces rallies, sips and ends with a winner', () => {
  const io = fakeIo();
  const room = new Room('TEST1', io);
  room.join({ id: 'host-player-1', name: 'Host', socket: fakeSocket('s1') });
  room.leave('host-player-1');
  for (let i = 0; i < 4; i++) room.addBot();
  assert.ok(room.start(), 'match should start with 4 bots');

  const finished = run(room, 900, () => room.match.phase === PHASE.OVER);
  const types = io.events.map((e) => e.type);
  const hits = types.filter((t) => t === EVENT.SIP || t === EVENT.DOWNED).length;
  console.log(`rallies=${types.filter((t) => t === EVENT.RALLY).length} glassHits=${hits}`);
  assert.ok(finished, 'match should finish');
  assert.ok(hits > 0, 'bots should hit glasses');
  assert.ok(types.includes(EVENT.ELIMINATED));
  assert.ok(room.match.winner === 0 || room.match.winner === 1);
});

test('queued spectators replace eliminated players after a countdown', () => {
  const io = fakeIo();
  const room = new Room('TEST2', io);
  room.join({ id: 'host-player-1', name: 'Host', socket: fakeSocket('s1') });
  room.addBot();
  room.addBot();
  room.addBot();
  room.start();
  const spec = room.join({ id: 'spectator-1', name: 'Spec', socket: fakeSocket('s2') });
  assert.ok(spec.ok);
  assert.deepEqual(room.queue, ['spectator-1']);

  const swapped = run(room, 900, () => io.events.some((e) => e.type === EVENT.SWAP));
  assert.ok(swapped, 'a swap should happen');
  const swap = io.events.find((e) => e.type === EVENT.SWAP);
  assert.equal(swap.memberId, 'spectator-1');
  assert.equal(room.match.phase, PHASE.SWAP);
  assert.equal(room.match.glasses[swap.slot].sips, 5);
  run(room, 3.2);
  assert.notEqual(room.match.phase, PHASE.SWAP);
});

test('room caps spectators at 8', () => {
  const room = new Room('TEST3', fakeIo());
  for (let i = 0; i < 12; i++) {
    assert.ok(room.join({ id: `player-${i}-xxxx`, name: `P${i}`, socket: fakeSocket(`s${i}`) }).ok);
  }
  const extra = room.join({ id: 'player-extra-x', name: 'X', socket: fakeSocket('sx') });
  assert.equal(extra.ok, false);
  assert.equal(room.queue.length, 8);
});
