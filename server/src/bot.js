import {
  SLOTS,
  HALF_L,
  paddleZone,
  clampToZone,
  partnerSlot,
  restPaddlePosition,
} from '@bptt/shared/constants.js';
import { PHASE } from '@bptt/shared/protocol.js';

const MOVE_SPEED = 3.2;

export function createBotBrain() {
  return {
    serveDelay: 0,
    skill: 0.75 + Math.random() * 0.2,
    aimSlot: null,
    swingFwd: 2.4,
    swingSide: 0,
    rallySeq: -1,
    rally: null,
  };
}

function pickAim(brain, match, slot) {
  const team = SLOTS[slot].team;
  const targets = match.glasses.filter((g) => g.active && SLOTS[g.slot].team !== team);
  const g = targets[Math.floor(Math.random() * targets.length)];
  const wobble = () => (Math.random() - 0.5) * (1.4 - brain.skill);
  if (!g) {
    brain.swingFwd = 2.2 + wobble();
    brain.swingSide = wobble();
    return;
  }
  // Aim to land just short of the glass so the bounce carries into it.
  const depth = Math.abs(g.z) - 0.18;
  const power = (depth - 0.25) / 1.05;
  brain.swingFwd = power * 3.2 + wobble() * 1.5;
  brain.swingSide = (g.x - match.ball.p.x * 0.25) / 0.32 + wobble() * 2;
}

export function updateBot(brain, match, slot, dt, room) {
  const s = SLOTS[slot];
  const paddle = match.paddles[slot];
  const ball = match.ball;
  const home = restPaddlePosition(slot);
  const zone = paddleZone(slot, room.slots[partnerSlot(slot)] !== null);
  const towardNet = -s.side;

  let tx = home.x;
  let tz = home.z;
  let swinging = false;

  if (match.phase === PHASE.PLAY && match.rally && match.rally.hitterTeam !== s.team && ball.v.z * s.side > 0) {
    const zHit = s.side * (HALF_L + 0.15);
    const t = (zHit - ball.p.z) / ball.v.z;
    tx = ball.p.x + ball.v.x * Math.max(0, t);
    tz = zHit;
    if (match.rally !== brain.rally) {
      brain.rally = match.rally;
      pickAim(brain, match, slot);
    }
    swinging = Math.abs(ball.p.z - paddle.z) < 0.6;
  } else if (match.phase === PHASE.SERVE && match.serverSlot === slot) {
    if (brain.rallySeq !== match.rallySeq) {
      brain.rallySeq = match.rallySeq;
      brain.serveDelay = 0.9 + Math.random() * 0.8;
      pickAim(brain, match, slot);
    }
    brain.serveDelay -= dt;
    swinging = brain.serveDelay < 0.15;
  }

  const target = clampToZone(tx, tz, zone);
  const dx = target.x - paddle.x;
  const dz = target.z - paddle.z;
  const dist = Math.hypot(dx, dz);
  const step = Math.min(dist, MOVE_SPEED * brain.skill * dt);
  const nx = dist > 1e-6 ? paddle.x + (dx / dist) * step : paddle.x;
  const nz = dist > 1e-6 ? paddle.z + (dz / dist) * step : paddle.z;

  const vx = swinging ? brain.swingSide : (nx - paddle.x) / dt;
  const vz = swinging ? towardNet * brain.swingFwd : (nz - paddle.z) / dt;
  match.setInput(slot, { x: nx, z: nz, vx, vz });

  if (match.phase === PHASE.SERVE && match.serverSlot === slot && brain.serveDelay <= 0) {
    match.serve(slot);
  }
}
