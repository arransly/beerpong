import * as THREE from 'three';
import gsap from 'gsap';
import { ROOM, TABLE, HALF_W } from '@bptt/shared/constants.js';
import { FaceSurface } from './FacePanel.js';
import { labelSprite } from './textures.js';

const DISC_R = 0.13;
const SEAT_COLORS = ['#ffcf5a', '#ff7a59', '#7ad1ff', '#b88cff', '#7dffb0', '#ff8fc7', '#ffe08a', '#9fe7ff'];

// Seats sit above and between the far-side face panels so neither hides the other.
const rowX = (row) => -(HALF_W + 1.25 + row * 0.32);
const rowY = (row) => TABLE.height + 0.78 + row * 0.38;

function seatPosition(i) {
  const row = i < 4 ? 0 : 1;
  const col = i % 4;
  return new THREE.Vector3(rowX(row), rowY(row), -0.69 + col * 0.46);
}

/** A row of bleachers along the long side of the table with circular faces for the queue. */
export class SpectatorStands {
  constructor() {
    this.group = new THREE.Group();

    const benchMat = new THREE.MeshStandardMaterial({ color: '#5a3825', roughness: 0.8 });
    for (let row = 0; row < 2; row++) {
      const top = rowY(row) - 0.24;
      const bench = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 2.2), benchMat);
      bench.position.set(rowX(row), top, 0);
      const riser = new THREE.Mesh(new THREE.BoxGeometry(0.34, top, 2.2), benchMat);
      riser.position.set(bench.position.x, top / 2, 0);
      bench.receiveShadow = riser.receiveShadow = true;
      this.group.add(bench, riser);
    }

    this.seats = Array.from({ length: ROOM.maxSpectators }, (_, i) => {
      const seat = new THREE.Group();
      seat.position.copy(seatPosition(i));
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(DISC_R, DISC_R + 0.018, 48),
        new THREE.MeshBasicMaterial({ color: '#d9d2c5' }),
      );
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(DISC_R, 48),
        new THREE.MeshBasicMaterial({ color: '#ffffff' }),
      );
      disc.position.z = 0.001;
      const label = labelSprite('', { width: 0.3 });
      label.position.y = -DISC_R - 0.05;
      const inner = new THREE.Group();
      inner.add(ring, disc, label);
      seat.add(inner);
      seat.visible = false;
      this.group.add(seat);
      return { seat, inner, ring, label, surface: new FaceSurface(disc, 1), text: '', nextUp: false, color: SEAT_COLORS[i] };
    });
  }

  /** entries: [{ member, video, position, isMe }] in queue order. */
  setSpectators(entries) {
    this.seats.forEach((s, i) => {
      const entry = entries[i];
      if (!entry) {
        if (s.seat.visible) s.surface.clear();
        s.seat.visible = false;
        return;
      }
      const wasVisible = s.seat.visible;
      s.seat.visible = true;
      s.surface.set({ name: entry.member.name, color: s.color, video: entry.video });
      const text = `${entry.position} · ${entry.member.name}${entry.isMe ? ' (you)' : ''}`;
      if (text !== s.text) {
        s.text = text;
        s.label.setText(text, { accent: entry.position === 1 ? '#ffd36b' : undefined });
      }
      const nextUp = entry.position === 1;
      if (nextUp !== s.nextUp) {
        s.nextUp = nextUp;
        s.ring.material.color.set(nextUp ? '#ffd36b' : '#d9d2c5');
        gsap.killTweensOf(s.ring.scale);
        s.ring.scale.set(1, 1, 1);
        if (nextUp) gsap.to(s.ring.scale, { x: 1.08, y: 1.08, duration: 0.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      }
      if (!wasVisible) gsap.fromTo(s.inner.scale, { x: 0.01, y: 0.01 }, { x: 1, y: 1, duration: 0.5, ease: 'back.out(2)' });
    });
  }

  billboard(camera) {
    for (const s of this.seats) if (s.seat.visible) s.seat.quaternion.copy(camera.quaternion);
  }
}
