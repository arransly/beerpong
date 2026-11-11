import * as THREE from 'three';
import { TABLE, paddleZone, clampToZone, restPaddlePosition } from '@bptt/shared/constants.js';

const PLANE_HEIGHT = TABLE.height + 0.15;
const VELOCITY_WINDOW_MS = 90;

/**
 * Maps the mouse / finger onto the player's zone of the table. Moving fast
 * toward the net is the swing; sideways speed aims.
 */
export class PaddleInput {
  constructor(element, camera) {
    this.element = element;
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PLANE_HEIGHT);
    this.ndc = new THREE.Vector2();
    this.hit = new THREE.Vector3();
    this.slot = -1;
    this.zone = null;
    this.pos = { x: 0, z: 0 };
    this.history = [];
    this.hasPointer = false;
    this.onTap = null;

    const move = (e) => {
      const rect = element.getBoundingClientRect();
      this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.hasPointer = true;
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerdown', (e) => {
      move(e);
      if (this.slot >= 0) this.onTap?.(e.pointerType);
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && this.slot >= 0 && document.activeElement === document.body) {
        e.preventDefault();
        this.onTap?.('keyboard');
      }
    });
  }

  setSlot(slot, partnerActive) {
    if (slot !== this.slot) {
      this.slot = slot;
      this.history = [];
      if (slot >= 0) {
        const rest = restPaddlePosition(slot);
        this.pos = { x: rest.x, z: rest.z };
      }
    }
    this.zone = slot >= 0 ? paddleZone(slot, partnerActive) : null;
  }

  update() {
    if (this.slot < 0) return null;
    if (this.hasPointer) {
      this.raycaster.setFromCamera(this.ndc, this.camera);
      if (this.raycaster.ray.intersectPlane(this.plane, this.hit)) {
        this.pos = clampToZone(this.hit.x, this.hit.z, this.zone);
      }
    }
    const now = performance.now();
    this.history.push({ t: now, x: this.pos.x, z: this.pos.z });
    while (this.history.length > 2 && now - this.history[0].t > VELOCITY_WINDOW_MS) this.history.shift();
    const first = this.history[0];
    const dt = (now - first.t) / 1000;
    const vx = dt > 0.01 ? (this.pos.x - first.x) / dt : 0;
    const vz = dt > 0.01 ? (this.pos.z - first.z) / dt : 0;
    return { x: this.pos.x, z: this.pos.z, vx, vz };
  }
}
