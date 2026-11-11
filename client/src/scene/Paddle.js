import * as THREE from 'three';
import { PADDLE, SLOTS, TEAMS } from '@bptt/shared/constants.js';

export class PaddleMesh {
  constructor(slot) {
    const s = SLOTS[slot];
    this.slot = slot;
    this.group = new THREE.Group();
    this.tilt = new THREE.Group();
    this.group.add(this.tilt);

    const rubber = new THREE.MeshStandardMaterial({ color: TEAMS[s.team].color, roughness: 0.65 });
    const wood = new THREE.MeshStandardMaterial({ color: '#c89a62', roughness: 0.7 });

    const blade = new THREE.Mesh(new THREE.CylinderGeometry(PADDLE.radius, PADDLE.radius, 0.012, 32), [wood, rubber, rubber]);
    blade.rotation.x = Math.PI / 2;
    blade.castShadow = true;

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.1, 0.022), wood);
    handle.position.set(0, -PADDLE.radius - 0.045, 0);
    handle.castShadow = true;

    this.tilt.add(blade, handle);
    this.tilt.rotation.x = -0.35;
    this.group.rotation.y = s.side < 0 ? 0 : Math.PI;
    this.group.visible = false;

    this.lean = 0;
    this.materials = [rubber, wood];
  }

  // Your own paddle is see-through so it never hides the ball or your pint.
  setGhost(ghost) {
    if (this.ghost === ghost) return;
    this.ghost = ghost;
    for (const m of this.materials) {
      m.transparent = ghost;
      m.opacity = ghost ? 0.55 : 1;
      m.depthWrite = !ghost;
      m.needsUpdate = true;
    }
  }

  setPosition(x, y, z, vx = 0) {
    this.group.position.set(x, y, z);
    const s = SLOTS[this.slot];
    const targetLean = Math.max(-0.6, Math.min(0.6, -vx * 0.15 * -s.side));
    this.lean += (targetLean - this.lean) * 0.2;
    this.tilt.rotation.z = this.lean;
  }
}
