import { el, esc } from './dom.js';
import { initials } from '../scene/textures.js';

/** On narrow portrait screens the 3D stands are replaced by this strip of circles. */
export class FaceStrip {
  constructor(root) {
    this.root = el('<div class="face-strip hidden" aria-label="Spectators"></div>');
    root.appendChild(this.root);
    this.items = new Map();
  }

  setVisible(visible) {
    this.root.classList.toggle('hidden', !visible);
  }

  setDocked(docked) {
    this.root.classList.toggle('docked', docked);
  }

  /** entries: [{ member, stream, position, isMe }] */
  setEntries(entries) {
    const seen = new Set();
    entries.forEach((entry, index) => {
      const id = entry.member.id;
      seen.add(id);
      let item = this.items.get(id);
      if (!item) {
        item = { node: el('<div class="face"><div class="circle"></div><div class="label"></div></div>'), stream: undefined };
        this.items.set(id, item);
      }
      const circle = item.node.querySelector('.circle');
      if (item.stream !== entry.stream) {
        item.stream = entry.stream;
        circle.innerHTML = '';
        if (entry.stream) {
          const video = document.createElement('video');
          video.muted = true;
          video.playsInline = true;
          video.autoplay = true;
          video.srcObject = entry.stream;
          if (entry.isMe) video.style.transform = 'scaleX(-1)';
          circle.appendChild(video);
          video.play().catch(() => {});
        } else {
          circle.textContent = initials(entry.member.name);
        }
      }
      item.node.classList.toggle('next', entry.position === 1);
      item.node.querySelector('.label').innerHTML = `${entry.position}. ${esc(entry.member.name)}${entry.isMe ? ' (you)' : ''}`;
      if (this.root.children[index] !== item.node) this.root.insertBefore(item.node, this.root.children[index] || null);
    });
    for (const [id, item] of this.items) {
      if (!seen.has(id)) {
        item.node.remove();
        this.items.delete(id);
      }
    }
  }
}
