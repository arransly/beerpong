import './styles.css';
import {
  SLOTS,
  TEAMS,
  TABLE,
  PADDLE,
  partnerSlot,
  autoPaddleHeight,
} from '@bptt/shared/constants.js';
import { C2S, S2C, PHASE, EVENT, CUE } from '@bptt/shared/protocol.js';
import { SceneManager } from './scene/SceneManager.js';
import { createTable } from './scene/Table.js';
import { GlassMesh } from './scene/Glass.js';
import { PaddleMesh } from './scene/Paddle.js';
import { BallMesh } from './scene/Ball.js';
import { FacePanel } from './scene/FacePanel.js';
import { SpectatorStands } from './scene/SpectatorStands.js';
import { SpectatorCamera, CAMERA_MODES, isPortraitAspect } from './scene/SpectatorCamera.js';
import { PaddleInput } from './input/PaddleInput.js';
import { SnapshotBuffer } from './net/interpolation.js';
import { createConnection, fetchLivekitToken } from './net/socket.js';
import { VideoManager } from './video/VideoManager.js';
import { Lobby } from './ui/Lobby.js';
import { Hud } from './ui/Hud.js';
import { Overlays } from './ui/Overlays.js';
import { FaceStrip } from './ui/FaceStrip.js';
import { askForCamera } from './ui/CameraPrompt.js';
import { sfx, unlockAudio } from './audio/sfx.js';
import { playerId, savedName, saveName } from './identity.js';

const RALLY_TEXT = {
  out: 'Out!',
  missed: 'Missed it!',
  ownSide: 'Bounced on their own side',
  ownGlass: 'Hit their own glass!',
  playerLeft: 'A player left',
};
const SWIPE_SERVE_SPEED = 1.8;
const INPUT_INTERVAL_MS = 1000 / 60;

// ---------- Scene ----------
const stage = new SceneManager(document.getElementById('stage'));
const { scene, camera } = stage;
scene.add(createTable());
const glasses = SLOTS.map((s) => new GlassMesh(s.id));
const paddles = SLOTS.map((s) => new PaddleMesh(s.id));
const panels = SLOTS.map((s) => new FacePanel(s.id));
const ball = new BallMesh();
const stands = new SpectatorStands();
for (const obj of [...glasses, ...paddles, ...panels]) scene.add(obj.group);
scene.add(ball.group, stands.group);

const director = new SpectatorCamera(camera);
const input = new PaddleInput(stage.renderer.domElement, camera);
const buffer = new SnapshotBuffer(100);

// ---------- UI ----------
const ui = document.getElementById('ui');
const video = new VideoManager(document.getElementById('video-sink'));
const { socket, request } = createConnection();
const myId = playerId();

let state = null;
let session = null;
let spectatorView = { mode: CAMERA_MODES.BROADCAST, slot: 0 };
let lastInputSent = 0;
let lastQueuePos = 0;
let lastSample = null;

const lobby = new Lobby(ui, {
  onCreate: (name) => enter(C2S.CREATE, { name }),
  onJoin: (name, code) => enter(C2S.JOIN, { name, code }),
});
const hud = new Hud(ui, {
  start: () => socket.emit(C2S.START),
  addBot: () => socket.emit(C2S.ADD_BOT),
  removeBot: ({ slot }) => socket.emit(C2S.REMOVE_BOT, slot),
  restart: () => socket.emit(C2S.RESTART),
  leave: () => leaveRoom(),
  copy: () => copyLink(),
  camera: () => (video.cameraOn ? stopCamera() : startCamera()),
  cameraMode: ({ mode, slot }) => {
    spectatorView = { mode, slot: slot ?? spectatorView.slot };
    applyView();
  },
});
const strip = new FaceStrip(ui);
const overlays = new Overlays(ui);

window.addEventListener('pointerdown', unlockAudio, { capture: true });

// ---------- Helpers ----------
const memberName = (id) => (id && state?.members[id]?.name) || 'Someone';
const slotName = (slot) => memberName(state?.slots[slot]);
const mySlot = () => (state ? state.slots.indexOf(myId) : -1);
const queuePos = () => (state ? state.queue.indexOf(myId) + 1 : 0);
const isTouch = window.matchMedia('(pointer: coarse)').matches;
const isPortraitPhone = () => window.innerHeight > window.innerWidth && window.innerWidth < 760;

function roomUrl(code) {
  const url = new URL(window.location.href);
  url.search = code ? `?room=${code}` : '';
  return url.toString();
}

async function copyLink() {
  const link = roomUrl(session.code);
  try {
    await navigator.clipboard.writeText(link);
    hud.toast('Invite link copied. Send it to your mates!');
  } catch {
    window.prompt('Copy this invite link:', link);
  }
}

// ---------- Room lifecycle ----------
async function enter(event, data) {
  lobby.setError('');
  lobby.setBusy(true);
  saveName(data.name);
  const res = await request(event, { ...data, playerId: myId });
  if (!res?.ok) {
    lobby.setBusy(false);
    lobby.setError(res?.error || 'Could not join that room.');
    return;
  }
  session = { code: res.code, name: data.name, socketId: res.socketId };
  history.replaceState(null, '', roomUrl(res.code));
  lobby.hide();
  hud.show();
  director.snapNext = true;

  if (await askForCamera(ui)) await startCamera();
  connectVideo();
}

function connectVideo() {
  if (!session) return;
  const { code } = session;
  video
    .connect(code, () => fetchLivekitToken({ code, playerId: myId, socketId: socket.id }))
    .catch((err) => {
      video.connectingFor = null;
      hud.toast(err.status === 503
        ? 'Face video is off on this server. Everyone shows as initials.'
        : 'Could not connect face video. Faces will show as initials.');
    });
}

async function startCamera() {
  try {
    await video.startCamera();
    socket.emit(C2S.CAMERA, true);
  } catch {
    hud.toast('Camera blocked or unavailable. You\'ll show as your initials.');
  }
  refreshFaces();
}

async function stopCamera() {
  await video.stopCamera();
  socket.emit(C2S.CAMERA, false);
  refreshFaces();
}

function leaveRoom() {
  socket.emit(C2S.LEAVE);
  session = null;
  state = null;
  video.disconnect();
  hud.hide();
  strip.setVisible(false);
  history.replaceState(null, '', roomUrl(null));
  resetScene();
  lobby.show({ name: savedName() });
}

function resetScene() {
  for (const g of glasses) g.group.visible = false;
  for (const p of paddles) p.group.visible = false;
  for (const p of panels) p.setMember(null);
  stands.setSpectators([]);
  ball.group.visible = false;
  input.setSlot(-1, false);
  spectatorView = { mode: CAMERA_MODES.BROADCAST, slot: 0 };
  director.setMode(CAMERA_MODES.BROADCAST);
}

socket.on('connect', async () => {
  if (!session) return;
  // Reclaim the seat after a dropped connection (the server holds it for 15 s).
  const res = await request(C2S.JOIN, { code: session.code, name: session.name, playerId: myId });
  if (!res?.ok) {
    leaveRoom();
    lobby.setError(res?.error || 'You were disconnected from the room.');
    return;
  }
  session.socketId = res.socketId;
  if (video.cameraOn) socket.emit(C2S.CAMERA, true);
});
socket.on('disconnect', () => session && hud.toast('Connection lost. Reconnecting…', 6000));

// ---------- State ----------
socket.on(S2C.STATE, (next) => {
  const prev = state;
  state = next;
  applyState(prev);
});
socket.on(S2C.SNAPSHOT, (snap) => buffer.push(snap));
socket.on(S2C.EVENT, onGameEvent);

function applyState(prev) {
  const slot = mySlot();
  const partnerActive = slot >= 0 && state.slots[partnerSlot(slot)] !== null;
  input.setSlot(slot, partnerActive);
  video.setRole(slot >= 0 ? 'player' : 'spectator');

  state.glasses.forEach((g, i) => glasses[i].setState(g, !!prev));
  SLOTS.forEach((s) => {
    paddles[s.id].group.visible = state.slots[s.id] !== null;
    paddles[s.id].setGhost(s.id === slot);
  });

  const pos = queuePos();
  if (pos === 1 && lastQueuePos !== 1 && state.phase !== PHASE.LOBBY) sfx.tick();
  lastQueuePos = pos;

  applyView();
  refreshFaces();
}

function applyView() {
  if (!state) return;
  const slot = mySlot();
  if (slot >= 0) director.setMode(CAMERA_MODES.PLAYER, slot);
  else director.setMode(spectatorView.mode, spectatorView.slot);
  hud.render(state, {
    myId,
    mySlot: slot,
    queuePos: queuePos(),
    isHost: state.hostId === myId,
    cameraMode: director.mode,
    cameraSlot: director.slot,
  });
}

function faceVideo(memberId) {
  if (memberId === myId) return video.localPreview;
  return video.video(memberId);
}

function refreshFaces() {
  hud.setSelfVideo(video.localPreview, video.cameraOn);
  if (!state) return;

  SLOTS.forEach((s) => {
    const memberId = state.slots[s.id];
    const member = memberId ? state.members[memberId] : null;
    panels[s.id].setMember(member, member ? faceVideo(memberId) : null, {
      isMe: memberId === myId,
      points: state.scores.players[memberId] || 0,
    });
    if (memberId) video.setQuality(memberId, true);
  });

  const queued = state.queue.map((id, i) => ({ id, position: i + 1 })).filter((q) => state.members[q.id]);
  for (const q of queued) video.setQuality(q.id, false);

  const portrait = isPortraitPhone();
  // Seated players look down the table, so the stands are off to the side: show
  // the waiting faces as a strip of circles instead.
  const useStrip = portrait || mySlot() >= 0;
  stands.group.visible = !portrait;
  strip.setVisible(useStrip && queued.length > 0);
  strip.setDocked(!portrait);
  if (useStrip) {
    strip.setEntries(queued.map((q) => ({
      member: state.members[q.id],
      stream: q.id === myId ? video.localTrack?.mediaStream || null : video.stream(q.id),
      position: q.position,
      isMe: q.id === myId,
    })));
  }
  if (portrait) {
    stands.setSpectators([]);
  } else {
    stands.setSpectators(queued.map((q) => ({
      member: state.members[q.id],
      video: faceVideo(q.id),
      position: q.position,
      isMe: q.id === myId,
    })));
  }
}

video.onChange(refreshFaces);
window.addEventListener('resize', () => refreshFaces());

// ---------- Game events ----------
function onGameEvent(e) {
  if (!state) return;
  const me = mySlot();
  switch (e.type) {
    case EVENT.SIP: {
      sfx.glass();
      glasses[e.slot].wobble();
      panels[e.slot].flash('SIP!', '#ffd36b');
      const victim = memberName(e.victimId);
      overlays.big(e.slot === me ? 'TAKE A SIP!' : 'SIP!', {
        sub: `${victim} drinks · +${e.points} ${memberName(e.scorerId)} · ${e.sipsLeft} left`,
      });
      break;
    }
    case EVENT.DOWNED: {
      sfx.splash();
      setTimeout(() => sfx.gulp(), 500);
      glasses[e.slot].wobble();
      panels[e.slot].flash('DOWN IT!', '#ff5a36', 2.2);
      overlays.big('DOWN IT!', {
        color: '#ff5a36',
        sub: `${memberName(e.victimId)} has to down it! +${e.points} ${memberName(e.scorerId)}`,
        hold: 2,
      });
      break;
    }
    case EVENT.FINISHED:
      sfx.gulp();
      panels[e.slot].flash('EMPTY!', '#ff5a36', 1.8);
      overlays.big('EMPTY!', { color: '#ff5a36', sub: `${memberName(e.victimId)} finished their pint`, hold: 1.6 });
      break;
    case EVENT.ELIMINATED:
      if (e.memberId === myId) {
        setTimeout(() => overlays.big("YOU'RE OUT!", {
          color: '#ff8b7a',
          sub: 'Back to the stands. You\'re in the queue for another go.',
          hold: 2.2,
        }), 1800);
      }
      break;
    case EVENT.SWAP:
      if (e.memberId === myId) {
        overlays.countdown(Math.round(e.ms / 1000), "Get ready, you're in!", (n) => (n ? sfx.tick() : sfx.go()));
      } else {
        overlays.big(`${memberName(e.memberId)} is in!`, { color: TEAMS[SLOTS[e.slot].team].color, hold: 1.4 });
      }
      break;
    case EVENT.MATCH_OVER:
      sfx.fanfare();
      overlays.big(e.winner === null ? 'GAME OVER' : `${TEAMS[e.winner].name.toUpperCase()} WINS!`, {
        color: e.winner === null ? '#ffd36b' : TEAMS[e.winner].color,
        sub: 'Last team standing',
        hold: 3,
      });
      break;
    default:
      break;
  }
}

buffer.onCue = (cue) => {
  if (cue.t === CUE.HIT) sfx.hit();
  else if (cue.t === CUE.BOUNCE) sfx.bounce();
  else if (cue.t === CUE.NET) sfx.net();
};

// ---------- Serving ----------
function tryServe() {
  const slot = mySlot();
  if (slot >= 0 && lastSample?.phase === PHASE.SERVE && lastSample.serverSlot === slot) {
    socket.emit(C2S.SERVE);
    lastSample = { ...lastSample, phase: PHASE.PLAY };
  }
}
input.onTap = (pointerType) => {
  if (pointerType !== 'touch') tryServe();
};

// ---------- Status line ----------
function statusText(sample) {
  if (!state) return '';
  const phase = sample?.phase || state.phase;
  const slot = mySlot();
  const isHost = state.hostId === myId;
  switch (phase) {
    case PHASE.LOBBY:
      if (!state.canStart) return 'Need at least one player on each team. Invite mates or add a bot.';
      return isHost ? 'Ready when you are. Hit Start!' : 'Waiting for the host to start…';
    case PHASE.SERVE:
      if (sample?.serverSlot === slot) {
        return isTouch ? 'Your serve! Flick your finger up the screen' : 'Your serve! Flick forward (or click / Space)';
      }
      return `${slotName(sample?.serverSlot)} to serve`;
    case PHASE.PLAY:
      return slot >= 0 ? '' : 'Rally on!';
    case PHASE.POINT: {
      const r = state.lastRally;
      if (!r || r.reason === 'sip' || r.reason === 'downed') return '';
      return `${RALLY_TEXT[r.reason] || 'Point'} · ${TEAMS[r.serveTeam].name} to serve`;
    }
    case PHASE.SWAP:
      return `Fresh pint poured. Next rally in ${Math.ceil((sample?.timerMs ?? 0) / 1000)}…`;
    case PHASE.OVER:
      if (state.winner === null) return 'Game over';
      return `${TEAMS[state.winner].name} wins! ${isHost ? 'Head back to the lobby for another round.' : 'Waiting for the host…'}`;
    default:
      return '';
  }
}

// ---------- Frame loop ----------
let statusTimer = 0;
stage.onFrame((dt) => {
  const sample = buffer.sample();
  lastSample = sample ? { ...sample } : lastSample;
  const slot = mySlot();
  const phase = sample?.phase || state?.phase;

  const ballVisible = !!sample && sample.ball.y > 0 && phase !== PHASE.LOBBY && phase !== PHASE.OVER;
  ball.group.visible = ballVisible;
  if (ballVisible) ball.setPosition(sample.ball.x, sample.ball.y, sample.ball.z);

  const local = slot >= 0 ? input.update() : null;
  if (state) {
    SLOTS.forEach((s) => {
      if (state.slots[s.id] === null) return;
      if (s.id === slot && local) {
        const y = phase === PHASE.PLAY
          ? autoPaddleHeight(sample?.ball, s.side)
          : TABLE.height + PADDLE.restHeight;
        paddles[s.id].setPosition(local.x, y, local.z, local.vx);
      } else if (sample?.paddles[s.id]) {
        const p = sample.paddles[s.id];
        paddles[s.id].setPosition(p.x, p.y, p.z, p.vx || 0);
      }
    });
  }

  if (local && socket.connected) {
    const now = performance.now();
    if (now - lastInputSent >= INPUT_INTERVAL_MS) {
      lastInputSent = now;
      const r = (v) => Math.round(v * 1000) / 1000;
      socket.volatile.emit(C2S.INPUT, { x: r(local.x), z: r(local.z), vx: r(local.vx), vz: r(local.vz) });
    }
    const forward = local.vz * -SLOTS[slot].side;
    if (forward > SWIPE_SERVE_SPEED) tryServe();
  }

  director.update(dt, ballVisible ? sample.ball : null);
  const portrait = isPortraitAspect(camera.aspect);
  for (const p of panels) {
    p.setLayout(portrait);
    if (p.group.visible) p.billboard(camera);
  }
  stands.billboard(camera);

  statusTimer -= dt;
  if (statusTimer <= 0 && session) {
    statusTimer = 0.2;
    hud.setStatus(statusText(sample));
  }
});

stage.start();

// ---------- Boot ----------
const params = new URLSearchParams(window.location.search);
lobby.show({ name: savedName(), code: (params.get('room') || '').toUpperCase() });
