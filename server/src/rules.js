import {
  SLOTS,
  ROOM,
  PADDLE,
  SIPS_PER_GLASS,
  POINTS_PER_SIP,
  POINTS_PER_DOWN,
  glassPosition,
  paddleZone,
  clampToZone,
  partnerSlot,
  teamSlots,
  sideToTeam,
  autoPaddleHeight,
  restPaddlePosition,
} from '@bptt/shared/constants.js';
import { PHASE, EVENT, CUE } from '@bptt/shared/protocol.js';
import {
  createBall,
  placeBall,
  stepBall,
  isBallOut,
  paddleTouchesBall,
  computeShot,
} from './physics.js';

const RALLY_TIME_LIMIT = 15;

export class Match {
  constructor(room) {
    this.room = room;
    this.ball = createBall();
    this.paddles = SLOTS.map((s) => ({ ...restPaddlePosition(s.id), vx: 0, vz: 0 }));
    this.glasses = SLOTS.map((s) => ({
      slot: s.id,
      ...glassPosition(s.id),
      sips: SIPS_PER_GLASS,
      active: false,
    }));
    this.scores = { teams: [0, 0], players: {} };
    this.phase = PHASE.LOBBY;
    this.timer = 0;
    this.serverSlot = -1;
    this.serveRotation = [0, 0];
    this.nextServeTeam = 0;
    this.rally = null;
    this.rallySeq = 0;
    this.cues = [];
    this.pendingFill = new Set();
    this.eliminated = [];
    this.winner = null;
    this.lastRally = null;
    this.hideBall();
  }

  get inMatch() {
    return this.phase !== PHASE.LOBBY && this.phase !== PHASE.OVER;
  }

  hideBall() {
    placeBall(this.ball, { x: 0, y: -1, z: 0 });
  }

  setInput(slot, input) {
    const paddle = this.paddles[slot];
    const partnerActive = this.room.slots[partnerSlot(slot)] !== null;
    const zone = paddleZone(slot, partnerActive);
    const pos = clampToZone(Number(input.x) || 0, Number(input.z) || 0, zone);
    paddle.x = pos.x;
    paddle.z = pos.z;
    const vx = Number(input.vx) || 0;
    const vz = Number(input.vz) || 0;
    const speed = Math.hypot(vx, vz);
    const k = speed > PADDLE.maxSpeed ? PADDLE.maxSpeed / speed : 1;
    paddle.vx = vx * k;
    paddle.vz = vz * k;
  }

  start() {
    this.scores = { teams: [0, 0], players: {} };
    this.winner = null;
    this.lastRally = null;
    this.pendingFill.clear();
    this.eliminated = [];
    this.serveRotation = [0, 0];
    for (const g of this.glasses) {
      g.sips = SIPS_PER_GLASS;
      g.active = this.room.slots[g.slot] !== null;
    }
    this.beginServe(Math.random() < 0.5 ? 0 : 1);
  }

  occupiedSlots(team) {
    return teamSlots(team).filter((slot) => this.room.slots[slot] !== null);
  }

  beginServe(team) {
    let slots = this.occupiedSlots(team);
    if (slots.length === 0) {
      team = 1 - team;
      slots = this.occupiedSlots(team);
      if (slots.length === 0) return this.endMatch(null);
    }
    this.serverSlot = slots[this.serveRotation[team] % slots.length];
    this.serveRotation[team]++;
    this.nextServeTeam = team;
    this.phase = PHASE.SERVE;
    this.timer = ROOM.autoServeMs / 1000;
    this.rally = null;
    this.rallySeq++;
    this.room.emitEvent({ type: EVENT.SERVE, slot: this.serverSlot });
    this.room.markDirty();
  }

  serve(slot) {
    if (this.phase !== PHASE.SERVE || slot !== this.serverSlot) return;
    this.launchServe();
  }

  launchServe() {
    const slot = this.serverSlot;
    const s = SLOTS[slot];
    const paddle = this.paddles[slot];
    const member = this.room.memberInSlot(slot);
    const shot = computeShot(this.ball.p, { x: paddle.vx, z: paddle.vz }, s.side, {
      serve: true,
      accuracy: member?.isBot ? 0.8 : 1,
    });
    Object.assign(this.ball.v, shot.v);
    this.ball.curve = shot.curve;
    this.rally = { hitterTeam: s.team, hitterSlot: slot, bounces: 0, mayHit: false, time: 0 };
    this.phase = PHASE.PLAY;
    this.cues.push({ t: CUE.HIT, slot });
    this.room.markDirty();
  }

  tick(dt) {
    this.updatePaddleHeights(dt);

    switch (this.phase) {
      case PHASE.SERVE: {
        const s = SLOTS[this.serverSlot];
        const paddle = this.paddles[this.serverSlot];
        this.ball.p.x = paddle.x;
        this.ball.p.y = paddle.y + 0.12;
        this.ball.p.z = paddle.z - s.side * 0.1;
        this.ball.v.x = this.ball.v.y = this.ball.v.z = 0;
        this.timer -= dt;
        if (this.timer <= 0) this.launchServe();
        break;
      }
      case PHASE.PLAY:
        this.tickRally(dt);
        break;
      case PHASE.POINT:
        this.timer -= dt;
        if (this.timer <= 0) this.afterPoint();
        break;
      case PHASE.SWAP:
        this.timer -= dt;
        if (this.timer <= 0) this.beginServe(this.nextServeTeam);
        break;
      default:
        break;
    }
  }

  updatePaddleHeights(dt) {
    const k = Math.min(1, dt * 18);
    for (const s of SLOTS) {
      const paddle = this.paddles[s.id];
      const target = this.phase === PHASE.PLAY
        ? autoPaddleHeight(this.ball.p, s.side)
        : autoPaddleHeight(null, s.side);
      paddle.y += (target - paddle.y) * k;
    }
  }

  tickRally(dt) {
    const rally = this.rally;
    rally.time += dt;
    const cues = [];
    stepBall(this.ball, dt, this.glasses, cues);
    for (const cue of cues) {
      this.cues.push(cue);
      if (this.phase !== PHASE.PLAY) return;
      if (cue.t === CUE.BOUNCE) this.onBounce(cue);
      else if (cue.t === CUE.GLASS) this.onGlass(cue.slot, false);
      else if (cue.t === CUE.IN) this.onGlass(cue.slot, true);
    }
    if (this.phase !== PHASE.PLAY) return;

    if (rally.mayHit) {
      const receiver = 1 - rally.hitterTeam;
      for (const slot of this.occupiedSlots(receiver)) {
        const paddle = this.paddles[slot];
        if (!paddleTouchesBall(paddle, this.ball)) continue;
        const member = this.room.memberInSlot(slot);
        const shot = computeShot(this.ball.p, { x: paddle.vx, z: paddle.vz }, SLOTS[slot].side, {
          accuracy: member?.isBot ? 0.8 : 1,
        });
        Object.assign(this.ball.v, shot.v);
        this.ball.curve = shot.curve;
        this.rally = { hitterTeam: receiver, hitterSlot: slot, bounces: 0, mayHit: false, time: 0 };
        this.cues.push({ t: CUE.HIT, slot });
        return;
      }
    }

    if (isBallOut(this.ball) || rally.time > RALLY_TIME_LIMIT) {
      const receiver = 1 - rally.hitterTeam;
      if (rally.bounces >= 1) this.endRally(rally.hitterTeam, 'missed');
      else this.endRally(receiver, 'out');
    }
  }

  onBounce(cue) {
    const rally = this.rally;
    const team = sideToTeam(cue.side);
    if (team === rally.hitterTeam) {
      this.endRally(1 - rally.hitterTeam, 'ownSide');
      return;
    }
    rally.bounces++;
    if (rally.bounces === 1) rally.mayHit = true;
    else this.endRally(rally.hitterTeam, 'missed');
  }

  onGlass(slot, isIn) {
    const rally = this.rally;
    const glassTeam = SLOTS[slot].team;
    if (glassTeam === rally.hitterTeam) {
      this.endRally(1 - rally.hitterTeam, 'ownGlass', { slot });
      return;
    }

    const g = this.glasses[slot];
    const scorerId = this.room.slots[rally.hitterSlot];
    const victimId = this.room.slots[slot];
    const points = isIn ? POINTS_PER_DOWN : POINTS_PER_SIP;
    g.sips = isIn ? 0 : Math.max(0, g.sips - 1);
    this.scores.teams[rally.hitterTeam] += points;
    if (scorerId) this.scores.players[scorerId] = (this.scores.players[scorerId] || 0) + points;

    this.room.emitEvent({
      type: isIn ? EVENT.DOWNED : EVENT.SIP,
      slot,
      by: rally.hitterSlot,
      scorerId,
      victimId,
      sipsLeft: g.sips,
      points,
    });

    if (g.sips <= 0) {
      if (!isIn) this.room.emitEvent({ type: EVENT.FINISHED, slot, victimId });
      this.eliminate(slot);
    }
    this.endRally(glassTeam, isIn ? 'downed' : 'sip', { slot });
  }

  eliminate(slot) {
    const g = this.glasses[slot];
    g.active = false;
    const memberId = this.room.slots[slot];
    if (memberId) this.eliminated.push(memberId);
    this.pendingFill.add(slot);
    this.room.emitEvent({ type: EVENT.ELIMINATED, slot, memberId });
  }

  endRally(serveTeam, reason, extra = {}) {
    this.phase = PHASE.POINT;
    this.timer = ROOM.pointPauseMs / 1000;
    this.nextServeTeam = serveTeam;
    this.lastRally = { reason, serveTeam, ...extra };
    this.room.emitEvent({ type: EVENT.RALLY, reason, serveTeam, ...extra });
    this.room.markDirty();
  }

  // Called by the room when a seated member leaves for good during a match.
  onVacancy(slot) {
    this.glasses[slot].active = false;
    this.pendingFill.add(slot);
    if (this.phase === PHASE.SERVE || this.phase === PHASE.PLAY) {
      const team = SLOTS[slot].team;
      this.endRally(1 - team, 'playerLeft', { slot });
    }
  }

  // A newcomer is waiting and a seat is free: fill it at the next break.
  requestFill() {
    if (!this.inMatch) return;
    for (let slot = 0; slot < SLOTS.length; slot++) {
      if (this.room.slots[slot] === null) this.pendingFill.add(slot);
    }
  }

  afterPoint() {
    for (const memberId of this.eliminated) this.room.unseat(memberId);

    const filled = this.room.fillSlots([...this.pendingFill]);
    this.pendingFill.clear();
    for (const memberId of this.eliminated) this.room.requeue(memberId);
    this.eliminated = [];

    for (const slot of filled) {
      const g = this.glasses[slot];
      g.sips = SIPS_PER_GLASS;
      g.active = true;
      this.paddles[slot] = { ...restPaddlePosition(slot), vx: 0, vz: 0 };
    }

    for (const team of [0, 1]) {
      if (this.occupiedSlots(team).length === 0) return this.endMatch(1 - team);
    }

    if (filled.length > 0) {
      this.phase = PHASE.SWAP;
      this.timer = ROOM.swapCountdownMs / 1000;
      this.serverSlot = -1;
      this.hideBall();
      for (const slot of filled) {
        this.room.emitEvent({
          type: EVENT.SWAP,
          slot,
          memberId: this.room.slots[slot],
          ms: ROOM.swapCountdownMs,
        });
      }
      this.room.markDirty();
      return;
    }

    this.beginServe(this.nextServeTeam);
  }

  endMatch(winner) {
    this.phase = PHASE.OVER;
    this.winner = winner;
    this.serverSlot = -1;
    this.rally = null;
    this.hideBall();
    this.room.emitEvent({ type: EVENT.MATCH_OVER, winner, scores: this.scores });
    this.room.markDirty();
  }

  toLobby() {
    this.phase = PHASE.LOBBY;
    this.serverSlot = -1;
    this.rally = null;
    this.hideBall();
    for (const g of this.glasses) {
      g.sips = SIPS_PER_GLASS;
      g.active = this.room.slots[g.slot] !== null;
    }
    this.room.markDirty();
  }

  snapshot() {
    const r = (v) => Math.round(v * 1000) / 1000;
    const { p } = this.ball;
    const snap = {
      t: Date.now(),
      ph: this.phase,
      rs: this.rallySeq,
      sv: this.serverSlot,
      b: [r(p.x), r(p.y), r(p.z)],
      p: this.paddles.map((pd, slot) =>
        this.room.slots[slot] === null ? 0 : [r(pd.x), r(pd.y), r(pd.z)]),
      tm: Math.max(0, Math.round(this.timer * 1000)),
    };
    if (this.cues.length) snap.c = this.cues.map((c) => ({ ...c, x: c.x && r(c.x), z: c.z && r(c.z) }));
    this.cues = [];
    return snap;
  }

  serialize() {
    return {
      phase: this.phase,
      serverSlot: this.serverSlot,
      timerMs: Math.max(0, Math.round(this.timer * 1000)),
      glasses: this.glasses.map((g) => ({ sips: g.sips, active: g.active })),
      scores: this.scores,
      winner: this.winner,
      lastRally: this.lastRally,
    };
  }
}
