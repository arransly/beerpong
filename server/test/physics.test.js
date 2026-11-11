import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBall, placeBall, stepBall, computeShot } from '../src/physics.js';
import { TABLE, HALF_L, HALF_W, GLASS, glassPosition } from '@bptt/shared/constants.js';
import { CUE } from '@bptt/shared/protocol.js';

const DT = 1 / 60;

function simulate(ball, glasses, maxTime = 3, stopOn = () => false) {
  const all = [];
  for (let t = 0; t < maxTime; t += DT) {
    const cues = [];
    stepBall(ball, DT, glasses, cues);
    all.push(...cues);
    if (cues.some((c) => c.t === CUE.GLASS || c.t === CUE.IN) || stopOn(cues)) break;
  }
  return all;
}

test('a medium forward swing clears the net and first bounces on the opponents half', () => {
  for (let i = 0; i < 50; i++) {
    const ball = createBall();
    placeBall(ball, { x: -0.3, y: TABLE.height + 0.2, z: -HALF_L - 0.2 });
    const shot = computeShot(ball.p, { x: 0.3, y: 0, z: 2.0 }, -1);
    Object.assign(ball.v, shot.v);
    ball.curve = shot.curve;
    const cues = simulate(ball, [], 3, (c) => c.some((x) => x.t === CUE.BOUNCE));
    const bounce = cues.find((c) => c.t === CUE.BOUNCE);
    assert.ok(!cues.some((c) => c.t === CUE.NET), 'should not hit the net');
    assert.ok(bounce, 'should bounce on the table');
    assert.equal(bounce.side, 1);
    assert.ok(Math.abs(bounce.x) <= HALF_W);
  }
});

test('a huge swing goes long', () => {
  const ball = createBall();
  placeBall(ball, { x: 0, y: TABLE.height + 0.2, z: -HALF_L - 0.2 });
  const shot = computeShot(ball.p, { x: 0, y: 0, z: 6 }, -1);
  Object.assign(ball.v, shot.v);
  const cues = simulate(ball, []);
  assert.ok(!cues.some((c) => c.t === CUE.BOUNCE), 'should not land on the table');
});

test('a ball dropping into a glass is reported as IN', () => {
  const g = { slot: 2, active: true, ...glassPosition(2) };
  const ball = createBall();
  placeBall(ball, { x: g.x, y: TABLE.height + 0.5, z: g.z });
  const cues = simulate(ball, [g]);
  assert.equal(cues.at(-1).t, CUE.IN);
  assert.equal(cues.at(-1).slot, 2);
});

test('a ball hitting the side of a glass is reported as a GLASS hit', () => {
  const g = { slot: 3, active: true, ...glassPosition(3) };
  const ball = createBall();
  placeBall(ball, { x: g.x, y: TABLE.height + GLASS.height * 0.5, z: g.z - 0.5 });
  ball.v.z = 4;
  ball.v.y = 1;
  const cues = simulate(ball, [g]);
  assert.equal(cues.at(-1).t, CUE.GLASS);
  assert.equal(cues.at(-1).slot, 3);
});

test('a low flat ball hits the net', () => {
  const ball = createBall();
  placeBall(ball, { x: 0, y: TABLE.height + 0.06, z: -0.5 });
  ball.v.z = 5;
  ball.v.y = 0;
  const cues = simulate(ball, [], 0.3);
  assert.ok(cues.some((c) => c.t === CUE.NET));
});
