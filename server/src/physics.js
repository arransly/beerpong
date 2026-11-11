import {
  TABLE,
  HALF_L,
  HALF_W,
  NET,
  BALL,
  GLASS,
  PADDLE,
  PHYSICS,
} from '@bptt/shared/constants.js';
import { CUE } from '@bptt/shared/protocol.js';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function createBall() {
  return {
    p: { x: 0, y: TABLE.height + 0.3, z: 0 },
    v: { x: 0, y: 0, z: 0 },
    curve: 0,
  };
}

export function placeBall(ball, p) {
  ball.p.x = p.x;
  ball.p.y = p.y;
  ball.p.z = p.z;
  ball.v.x = 0;
  ball.v.y = 0;
  ball.v.z = 0;
  ball.curve = 0;
}

const rimY = TABLE.height + GLASS.height;
const netTop = TABLE.height + NET.height;

/**
 * Advances the ball by dt using sub-steps and pushes cues into `cues`.
 * Glass contacts are reported as { t: CUE.GLASS | CUE.IN, slot } and stop the step,
 * since either one ends the rally.
 */
export function stepBall(ball, dt, glasses, cues) {
  const steps = PHYSICS.substeps;
  const h = dt / steps;
  const r = BALL.radius;
  const { p, v } = ball;

  for (let i = 0; i < steps; i++) {
    const px = p.x;
    const py = p.y;
    const pz = p.z;

    v.y += PHYSICS.gravity * h;
    const dragK = 1 - PHYSICS.drag * h;
    v.x = v.x * dragK + ball.curve * h;
    v.y *= dragK;
    v.z *= dragK;
    ball.curve *= 1 - PHYSICS.curveDecay * h;

    p.x += v.x * h;
    p.y += v.y * h;
    p.z += v.z * h;

    // Table top.
    if (
      v.y < 0 &&
      p.y - r <= TABLE.height &&
      py - r >= TABLE.height - 0.01 &&
      Math.abs(p.x) <= HALF_W &&
      Math.abs(p.z) <= HALF_L
    ) {
      p.y = TABLE.height + r;
      v.y = -v.y * PHYSICS.tableRestitution;
      v.x *= PHYSICS.tableFriction;
      v.z *= PHYSICS.tableFriction;
      cues.push({ t: CUE.BOUNCE, side: p.z < 0 ? -1 : 1, x: p.x, z: p.z });
    }

    // Net: a thin vertical wall on z = 0.
    const crossed = Math.sign(pz) !== Math.sign(p.z) && pz !== 0;
    if (crossed && Math.abs(p.x) <= HALF_W + NET.overhang) {
      const f = pz / (pz - p.z);
      const yc = py + (p.y - py) * f;
      if (yc - r < netTop && yc + r > TABLE.height) {
        const fromSide = Math.sign(pz);
        p.z = fromSide * (r + NET.thickness / 2);
        if (yc > netTop - r * 0.5) {
          // Clipped the tape: pops up and dribbles on.
          v.y = Math.abs(v.y) * 0.4 + 0.4;
          v.z *= 0.35;
          p.z = -fromSide * (r + NET.thickness / 2);
        } else {
          v.z = -v.z * PHYSICS.netRestitution;
          v.x *= 0.5;
        }
        cues.push({ t: CUE.NET });
      }
    }

    // Glasses.
    for (const g of glasses) {
      if (!g.active) continue;
      const dx = p.x - g.x;
      const dz = p.z - g.z;
      const d = Math.hypot(dx, dz);

      if (v.y < 0 && py >= rimY && p.y < rimY) {
        const f = (py - rimY) / (py - p.y);
        const cx = px + (p.x - px) * f - g.x;
        const cz = pz + (p.z - pz) * f - g.z;
        const dc = Math.hypot(cx, cz);
        if (dc < GLASS.radiusTop - r * 0.4) {
          p.x = g.x;
          p.z = g.z;
          p.y = TABLE.height + GLASS.height * 0.55;
          v.x = v.y = v.z = 0;
          ball.curve = 0;
          cues.push({ t: CUE.IN, slot: g.slot });
          return;
        }
      }

      const glassR = GLASS.radiusBottom + (GLASS.radiusTop - GLASS.radiusBottom) *
        clamp((p.y - TABLE.height) / GLASS.height, 0, 1);
      if (p.y - r < rimY && p.y + r > TABLE.height && d < glassR + r && d > 1e-6) {
        const nx = dx / d;
        const nz = dz / d;
        const vn = v.x * nx + v.z * nz;
        if (vn < 0) {
          v.x -= (1 + PHYSICS.glassRestitution) * vn * nx;
          v.z -= (1 + PHYSICS.glassRestitution) * vn * nz;
        }
        p.x = g.x + nx * (glassR + r + 0.001);
        p.z = g.z + nz * (glassR + r + 0.001);
        cues.push({ t: CUE.GLASS, slot: g.slot });
        return;
      }
    }
  }
}

export function isBallOut(ball) {
  const { p } = ball;
  return p.y < 0.05 || Math.abs(p.x) > 4 || Math.abs(p.z) > HALF_L + 3.5;
}

export function paddleTouchesBall(paddle, ball) {
  const dx = ball.p.x - paddle.x;
  const dy = ball.p.y - paddle.y;
  const dz = ball.p.z - paddle.z;
  return dx * dx + dy * dy * 0.5 + dz * dz < PADDLE.hitRadius * PADDLE.hitRadius;
}

/**
 * Assisted shot: turns the paddle's swing into a trajectory that lands on the
 * opponents' half. Forward speed sets depth (too much goes long), sideways speed
 * sets direction (too much goes wide). The arc is raised until it clears the net.
 */
export function computeShot(ballPos, paddleVel, hitterSide, { serve = false, accuracy = 1 } = {}) {
  const dir = -hitterSide;
  const fwd = Math.max(0, paddleVel.z * dir);
  let power = clamp(fwd / 3.2, 0, 1.25);
  if (serve) power = clamp(power, 0.4, 0.95);

  const spread = (0.5 + power) * 0.07 / accuracy;
  let depth = 0.25 + power * 1.05 + (Math.random() - 0.5) * spread;
  let tx = ballPos.x * 0.25 + paddleVel.x * 0.32 + (Math.random() - 0.5) * spread;
  tx = clamp(tx, -1.15, 1.15);
  depth = Math.max(0.15, depth);

  const target = { x: tx, y: TABLE.height + BALL.radius, z: dir * depth };
  const dist = Math.hypot(target.x - ballPos.x, target.z - ballPos.z);
  const speedH = 3.2 + power * 4.5;
  let T = Math.max(0.25, dist / speedH);
  const g = PHYSICS.gravity;

  let vx = 0;
  let vy = 0;
  let vz = 0;
  for (let iter = 0; iter < 16; iter++) {
    vx = (target.x - ballPos.x) / T;
    vz = (target.z - ballPos.z) / T;
    vy = (target.y - ballPos.y - 0.5 * g * T * T) / T;
    const tn = -ballPos.z / vz;
    if (tn > 0 && tn < T) {
      const yn = ballPos.y + vy * tn + 0.5 * g * tn * tn;
      if (yn - BALL.radius < netTop + 0.04) {
        T *= 1.1;
        continue;
      }
    }
    break;
  }

  // Compensate for drag so shots land roughly where aimed.
  const dragComp = 1 + PHYSICS.drag * T * 0.5;
  return {
    v: { x: vx * dragComp, y: vy * dragComp, z: vz * dragComp },
    curve: clamp(paddleVel.x * 0.15, -0.6, 0.6),
    power,
  };
}
