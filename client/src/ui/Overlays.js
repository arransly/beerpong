import gsap from 'gsap';
import { el, esc } from './dom.js';

/** Big centre-screen GSAP callouts: SIP!, DOWN IT!, countdowns. */
export class Overlays {
  constructor(root) {
    this.layer = el('<div class="overlay-layer"></div>');
    root.appendChild(this.layer);
  }

  big(text, { color = '#ffd36b', sub = '', hold = 1.1 } = {}) {
    const node = el(`
      <div class="big-text">
        <div class="main" style="color:${esc(color)}">${esc(text)}</div>
        ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
      </div>
    `);
    this.layer.appendChild(node);
    const main = node.querySelector('.main');
    gsap.timeline({ onComplete: () => node.remove() })
      .fromTo(main, { scale: 0.2, rotation: -12, opacity: 0 }, { scale: 1, rotation: -4, opacity: 1, duration: 0.45, ease: 'back.out(2.5)' })
      .fromTo(node.querySelector('.sub'), { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3 }, '-=0.2')
      .to(node, { opacity: 0, y: -40, duration: 0.4, delay: hold });
    return node;
  }

  countdown(seconds, label, onTick) {
    const tl = gsap.timeline();
    for (let i = seconds; i >= 1; i--) {
      tl.call(() => {
        onTick?.(i);
        this.big(String(i), { sub: label, hold: 0.35 });
      }, null, (seconds - i) * 1);
    }
    tl.call(() => {
      onTick?.(0);
      this.big('GO!', { color: '#7dffb0', hold: 0.4 });
    }, null, seconds);
    return tl;
  }
}
