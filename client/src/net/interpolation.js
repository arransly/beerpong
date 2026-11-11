const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Buffers server snapshots and plays them back ~100 ms in the past so other
 * players' paddles and the ball move smoothly between 30 Hz updates.
 */
export class SnapshotBuffer {
  constructor(delayMs = 100) {
    this.delayMs = delayMs;
    this.snapshots = [];
    this.offset = null;
    this.cueCursor = 0;
    this.onCue = null;
  }

  push(snap) {
    const sample = snap.t - Date.now();
    // Track the best-case (lowest latency) clock offset, drifting slowly if it changes.
    if (this.offset === null || sample > this.offset) this.offset = sample;
    else this.offset += (sample - this.offset) * 0.002;

    this.snapshots.push(snap);
    if (this.snapshots.length > 60) this.snapshots.shift();
  }

  get latest() {
    return this.snapshots[this.snapshots.length - 1] || null;
  }

  sample() {
    const list = this.snapshots;
    if (!list.length) return null;
    const renderT = Date.now() + this.offset - this.delayMs;

    for (const snap of list) {
      if (snap.t > this.cueCursor && snap.t <= renderT) {
        this.cueCursor = snap.t;
        if (snap.c && this.onCue) for (const cue of snap.c) this.onCue(cue, snap);
      }
    }

    let a = list[0];
    let b = list[0];
    for (let i = 0; i < list.length - 1; i++) {
      if (list[i].t <= renderT && list[i + 1].t >= renderT) {
        a = list[i];
        b = list[i + 1];
        break;
      }
      if (list[i + 1].t < renderT) a = b = list[i + 1];
    }
    if (renderT < list[0].t) a = b = list[0];

    const span = b.t - a.t;
    const t = span > 0 ? Math.min(1, Math.max(0, (renderT - a.t) / span)) : 1;
    // A new rally teleports the ball: don't slide it across the table.
    const jump = a.rs !== b.rs || a.ph !== b.ph;
    const from = jump ? b : a;

    return {
      phase: b.ph,
      serverSlot: b.sv,
      timerMs: b.tm,
      ball: {
        x: lerp(from.b[0], b.b[0], t),
        y: lerp(from.b[1], b.b[1], t),
        z: lerp(from.b[2], b.b[2], t),
      },
      paddles: b.p.map((pb, i) => {
        const pa = from.p[i];
        if (!pb) return null;
        if (!pa) return { x: pb[0], y: pb[1], z: pb[2] };
        return { x: lerp(pa[0], pb[0], t), y: lerp(pa[1], pb[1], t), z: lerp(pa[2], pb[2], t), vx: (pb[0] - pa[0]) / (span / 1000 || 1) };
      }),
    };
  }
}
