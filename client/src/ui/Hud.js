import { SLOTS, TEAMS, SIPS_PER_GLASS, teamSlots } from '@bptt/shared/constants.js';
import { PHASE } from '@bptt/shared/protocol.js';
import { CAMERA_MODES } from '../scene/SpectatorCamera.js';
import { el, esc } from './dom.js';

export class Hud {
  constructor(root, handlers) {
    this.handlers = handlers;
    this.root = el(`
      <div class="hud hidden">
        <div class="hud-top">
          <div class="team red" data-team="0"></div>
          <div class="center">
            <div class="room-chip">Room <b data-code></b>
              <button class="small ghost" data-action="copy">Copy link</button>
              <button class="small ghost" data-action="leave">Leave</button>
            </div>
            <div class="status" data-status></div>
          </div>
          <div class="team blue" data-team="1"></div>
        </div>
        <div class="host-bar" data-host></div>
        <div class="selfview">
          <div class="frame hidden" data-self></div>
          <button class="small ghost" data-action="camera">Turn camera on</button>
        </div>
        <div class="spectator-panel hidden" data-spec></div>
        <div class="banner hidden" data-banner></div>
        <div class="toast hidden" data-toast></div>
      </div>
    `);
    root.appendChild(this.root);
    this.q = (sel) => this.root.querySelector(sel);
    this.teams = [this.q('[data-team="0"]'), this.q('[data-team="1"]')];
    this.status = this.q('[data-status]');
    this.hostBar = this.q('[data-host]');
    this.spec = this.q('[data-spec]');
    this.banner = this.q('[data-banner]');
    this.toastEl = this.q('[data-toast]');
    this.selfFrame = this.q('[data-self]');
    this.cameraButton = this.q('[data-action="camera"]');

    this.root.addEventListener('click', (e) => {
      const button = e.target.closest('[data-action]');
      if (!button || button.disabled) return;
      const { action, slot, mode } = button.dataset;
      this.handlers[action]?.({ slot: slot === undefined ? undefined : Number(slot), mode });
    });
  }

  show() {
    this.root.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
  }

  setStatus(text) {
    if (this.status.textContent !== text) this.status.textContent = text;
  }

  toast(message, ms = 3500) {
    this.toastEl.textContent = message;
    this.toastEl.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.add('hidden'), ms);
  }

  setSelfVideo(video, cameraOn) {
    this.selfFrame.classList.toggle('hidden', !video);
    if (video && video.parentElement !== this.selfFrame) {
      this.selfFrame.innerHTML = '';
      this.selfFrame.appendChild(video);
      video.play?.().catch(() => {});
    }
    if (!video) this.selfFrame.innerHTML = '';
    this.cameraButton.textContent = cameraOn ? 'Camera off' : 'Turn camera on';
  }

  render(state, view) {
    this.q('[data-code]').textContent = state.code;
    const canManage = view.isHost && (state.phase === PHASE.LOBBY || state.phase === PHASE.OVER);

    for (const team of [0, 1]) {
      const rows = teamSlots(team).map((slot) => {
        const memberId = state.slots[slot];
        const member = memberId && state.members[memberId];
        if (!member) return `<div class="player-row empty"><span class="name">Empty corner</span></div>`;
        const glass = state.glasses[slot];
        const pint = Array.from({ length: SIPS_PER_GLASS }, (_, i) =>
          `<i class="${glass.active && i < glass.sips ? 'full' : ''}"></i>`).join('');
        const points = state.scores.players[memberId] || 0;
        const tag = member.isBot ? ' 🤖' : member.connected ? '' : ' (away)';
        const remove = canManage && member.isBot
          ? `<button class="ghost" data-action="removeBot" data-slot="${slot}" title="Remove bot">✕</button>`
          : '';
        return `
          <div class="player-row ${memberId === view.myId ? 'me' : ''}">
            <span class="name">${esc(member.name)}${tag}</span>
            <span class="pint" title="${glass.sips} sips left">${pint}</span>
            <span class="pts">${points}</span>${remove}
          </div>`;
      }).join('');
      this.teams[team].innerHTML = `
        <div class="team-head">
          <span class="team-name">${TEAMS[team].name}</span>
          <span class="team-score">${state.scores.teams[team]}</span>
        </div>${rows}`;
    }

    const hasEmpty = state.slots.some((s) => s === null);
    let hostButtons = '';
    if (canManage && state.phase === PHASE.LOBBY) {
      hostButtons = `
        <button class="big" data-action="start" ${state.canStart ? '' : 'disabled'}>Start match</button>
        ${hasEmpty ? '<button class="ghost" data-action="addBot">Add bot</button>' : ''}`;
    } else if (canManage && state.phase === PHASE.OVER) {
      hostButtons = '<button class="big" data-action="restart">Back to lobby</button>';
    }
    this.hostBar.innerHTML = hostButtons;

    this.renderSpectator(state, view);

    const showBanner = view.mySlot < 0 && view.queuePos === 1 && state.phase !== PHASE.LOBBY && state.phase !== PHASE.OVER;
    this.banner.textContent = "You're up next! Get ready…";
    this.banner.classList.toggle('hidden', !showBanner);
  }

  renderSpectator(state, view) {
    const spectating = view.mySlot < 0;
    this.spec.classList.toggle('hidden', !spectating);
    if (!spectating) return;

    const position = view.queuePos > 0
      ? `You're <span class="queue-pos">#${view.queuePos}</span> in the queue`
      : 'Watching';
    const camButton = (mode, label, slot) => {
      const active = view.cameraMode === mode && (slot === undefined || view.cameraSlot === slot);
      return `<button class="small ghost ${active ? 'active' : ''}" data-action="cameraMode" data-mode="${mode}" ${slot === undefined ? '' : `data-slot="${slot}"`}>${esc(label)}</button>`;
    };
    const povButtons = SLOTS
      .filter((s) => state.slots[s.id])
      .map((s) => camButton(CAMERA_MODES.POV, `${state.members[state.slots[s.id]]?.name || 'Player'}'s view`, s.id))
      .join('');
    const queue = state.queue
      .map((id) => state.members[id])
      .filter(Boolean)
      .map((m) => `<li class="${m.id === view.myId ? 'me' : ''}">${esc(m.name)}${m.connected ? '' : ' (away)'}</li>`)
      .join('');

    this.spec.innerHTML = `
      <h3>Spectating</h3>
      <div>${position}</div>
      <div class="cams">
        ${camButton(CAMERA_MODES.BROADCAST, 'Broadcast')}
        ${camButton(CAMERA_MODES.FOLLOW, 'Follow ball')}
        ${povButtons}
      </div>
      ${queue ? `<ol>${queue}</ol>` : ''}`;
  }
}
