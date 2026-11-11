import * as THREE from 'three';
import { TABLE, HALF_L, HALF_W, SLOTS } from '@bptt/shared/constants.js';

export const CAMERA_MODES = {
  PLAYER: 'player',
  BROADCAST: 'broadcast',
  FOLLOW: 'follow',
  POV: 'pov',
};

function playerPose(slot) {
  const s = SLOTS[slot];
  return {
    pos: new THREE.Vector3(s.xSign * 0.3, TABLE.height + 0.95, s.side * (HALF_L + 1.6)),
    look: new THREE.Vector3(s.xSign * 0.05, TABLE.height - 0.05, -s.side * 0.4),
    hfov: 74,
  };
}

const broadcastPose = () => ({
  pos: new THREE.Vector3(HALF_W + 2.5, TABLE.height + 1.45, 0),
  look: new THREE.Vector3(-0.4, TABLE.height, 0),
  hfov: 80,
});

/**
 * Drives the one scene camera: a player's own corner view, or one of the
 * spectator presets (broadcast, follow the ball, any player's point of view).
 */
export class SpectatorCamera {
  constructor(camera) {
    this.camera = camera;
    this.mode = CAMERA_MODES.BROADCAST;
    this.slot = 0;
    this.pos = camera.position.clone();
    this.look = new THREE.Vector3(0, TABLE.height, 0);
    this.hfov = 80;
    this.snapNext = true;
  }

  setMode(mode, slot = this.slot) {
    if (mode === this.mode && slot === this.slot) return;
    this.mode = mode;
    this.slot = slot;
  }

  targetPose(ballPos) {
    switch (this.mode) {
      case CAMERA_MODES.PLAYER:
      case CAMERA_MODES.POV:
        return playerPose(this.slot);
      case CAMERA_MODES.FOLLOW: {
        const b = ballPos && ballPos.y > 0 ? ballPos : { x: 0, y: TABLE.height, z: 0 };
        return {
          pos: new THREE.Vector3(b.x * 0.5 + 1.9, TABLE.height + 0.75, b.z * 0.85),
          look: new THREE.Vector3(b.x, Math.max(TABLE.height, b.y), b.z),
          hfov: 70,
        };
      }
      default:
        return broadcastPose();
    }
  }

  update(dt, ballPos) {
    const pose = this.targetPose(ballPos);
    const k = this.snapNext ? 1 : 1 - Math.exp(-dt * (this.mode === CAMERA_MODES.FOLLOW ? 5 : 3.5));
    this.snapNext = false;
    this.pos.lerp(pose.pos, k);
    this.look.lerp(pose.look, k);
    this.hfov += (pose.hfov - this.hfov) * k;

    const cam = this.camera;
    const vfov = THREE.MathUtils.radToDeg(
      2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.hfov) / 2) / cam.aspect),
    );
    const fov = THREE.MathUtils.clamp(vfov, 42, 92);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.position.copy(this.pos);
    cam.lookAt(this.look);
  }
}
