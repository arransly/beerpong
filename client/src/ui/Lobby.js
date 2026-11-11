import { ROOM } from '@bptt/shared/constants.js';
import { el } from './dom.js';

/** Landing screen: pick a name, then create a room or join one by code. */
export class Lobby {
  constructor(root, { onCreate, onJoin }) {
    this.root = el(`
      <div class="landing">
        <form class="landing-card" novalidate>
          <h1 class="logo">Beer Pong<span>Table Tennis</span></h1>
          <p class="tagline">2v2 table tennis with a pint in every corner.</p>
          <div class="field">
            <label for="name">Your name</label>
            <input id="name" name="name" maxlength="${ROOM.maxNameLength}" autocomplete="nickname" placeholder="e.g. Arran" />
          </div>
          <button class="primary" type="button" data-create>Create a room</button>
          <div class="divider">or join with a code</div>
          <div class="row">
            <input name="code" maxlength="${ROOM.codeLength}" placeholder="CODE" autocapitalize="characters" autocomplete="off" />
            <button type="submit" data-join>Join</button>
          </div>
          <p class="error" role="alert"></p>
          <ul class="rules">
            <li><b>Hit a glass</b> and its owner takes a sip (you score).</li>
            <li><b>Land it in</b> and they down it. They're out.</li>
            <li><b>5 sips</b> and the pint is empty. Also out.</li>
            <li>The next player in the queue takes their corner.</li>
          </ul>
        </form>
      </div>
    `);
    root.appendChild(this.root);
    this.form = this.root.querySelector('form');
    this.nameInput = this.root.querySelector('[name=name]');
    this.codeInput = this.root.querySelector('[name=code]');
    this.error = this.root.querySelector('.error');
    this.buttons = this.root.querySelectorAll('button');

    this.root.querySelector('[data-create]').addEventListener('click', () => {
      const name = this.readName();
      if (name) onCreate(name);
    });
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = this.readName();
      const code = this.codeInput.value.trim().toUpperCase();
      if (!name) return;
      if (code.length !== ROOM.codeLength) {
        this.setError(`Room codes are ${ROOM.codeLength} characters.`);
        this.codeInput.focus();
        return;
      }
      onJoin(name, code);
    });
  }

  readName() {
    const name = this.nameInput.value.trim();
    if (!name) {
      this.setError('Pick a name first.');
      this.nameInput.focus();
      return null;
    }
    return name;
  }

  show({ name = '', code = '' } = {}) {
    this.root.classList.remove('hidden');
    if (name) this.nameInput.value = name;
    if (code) this.codeInput.value = code;
    this.setBusy(false);
    (name ? this.codeInput : this.nameInput).focus();
  }

  hide() {
    this.root.classList.add('hidden');
  }

  setBusy(busy) {
    this.buttons.forEach((b) => { b.disabled = busy; });
  }

  setError(message) {
    this.error.textContent = message || '';
  }
}
