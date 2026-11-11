import { el } from './dom.js';

/** Asks whether to turn on the front camera. Resolves true/false. */
export function askForCamera(root) {
  return new Promise((resolve) => {
    const modal = el(`
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="cam-title">
        <div class="modal-card">
          <div class="cam-icon" aria-hidden="true">🍺📷</div>
          <h2 id="cam-title">Show your face?</h2>
          <p>Your front camera puts your face in your corner of the table, or in the stands while you wait your turn. Video only, no sound.</p>
          <div class="actions">
            <button data-yes>Turn on camera</button>
            <button class="ghost" data-no>Not now</button>
          </div>
        </div>
      </div>
    `);
    const done = (value) => {
      modal.remove();
      resolve(value);
    };
    modal.querySelector('[data-yes]').addEventListener('click', () => done(true));
    modal.querySelector('[data-no]').addEventListener('click', () => done(false));
    root.appendChild(modal);
  });
}
