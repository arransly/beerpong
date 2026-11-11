// Tiny synthesised sound effects, so there are no audio assets to load.
let ctx = null;
let master = null;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone(freq, duration, { type = 'sine', gain = 0.2, slideTo, delay = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

function noise(duration, { gain = 0.3, freq = 2000, q = 1, delay = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const length = Math.ceil(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  hit() {
    noise(0.04, { gain: 0.6, freq: 2600, q: 2 });
    tone(820, 0.05, { type: 'triangle', gain: 0.18 });
  },
  bounce() {
    tone(1500, 0.035, { gain: 0.14 });
  },
  net() {
    noise(0.09, { gain: 0.25, freq: 500 });
  },
  glass() {
    tone(2350, 0.6, { gain: 0.14 });
    tone(3520, 0.4, { gain: 0.07 });
    tone(4700, 0.25, { gain: 0.04 });
  },
  splash() {
    noise(0.55, { gain: 0.45, freq: 900, q: 0.6 });
    tone(2350, 0.4, { gain: 0.1 });
  },
  gulp() {
    for (let i = 0; i < 3; i++) tone(230, 0.16, { gain: 0.22, slideTo: 120, delay: i * 0.26 });
  },
  tick() {
    tone(660, 0.1, { type: 'square', gain: 0.06 });
  },
  go() {
    tone(990, 0.28, { type: 'square', gain: 0.07 });
  },
  fanfare() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, { type: 'triangle', gain: 0.12, delay: i * 0.12 }));
  },
};
