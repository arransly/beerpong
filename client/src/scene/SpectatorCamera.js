import * as THREE from 'three';
import { TABLE, HALF_L, HALF_W, SLOTS } from '@bptt/shared/constants.js';

export const CAMERA_MODES = {
  PLAYER: 'player',
  BROADCAST: 'broadcast',
  FOLLOW: 'follow',
  POV: 'pov',
};

export const isPortraitAspect = (aspect) => aspect < 0.85;

// Landscape poses give a horizontal field of view (hfov); portrait poses give a
// vertical one (vfov) and sit higher so the whole table runs up the screen.
function playerPose(slot, portrait) {
  const s = SLOTS[slot];
  if (portrait) {
    return {
      pos: new THREE.Vector3(s.xSign * 0.1, TABLE.height + 2.3, s.side * (HALF_L + 1.45)),
      look: new THREE.Vector3(0, TABLE.height, -s.side * 0.3),
      vfov: 80,
    };
  }
  return {
    pos: new THREE.Vector3(s.xSign * 0.3, TABLE.height + 0.95, s.side * (HALF_L + 1.6)),
    look: new THREE.Vector3(s.xSign * 0.05, TABLE.height - 0.05, -s.side * 0.4),
    hfov: 74,
  };
}

function broadcastPose(portrait) {
  if (portrait) {
    return {
      pos: new THREE.Vector3(0, TABLE.height + 4.2, -(HALF_L + 1.7)),
      look: new THREE.Vector3(0, TABLE.height, -0.45),
      vfov: 70,
    };
  }
  return {
    pos: new THREE.Vector3(HALF_W + 2.5, TABLE.height + 1.45, 0),
    look: new THREE.Vector3(-0.4, TABLE.height, 0),
    hfov: 80,
  };
}

function followPose(ballPos, portrait) {
  const b = ballPos && ballPos.y > 0 ? ballPos : { x: 0, y: TABLE.height, z: 0 };
  const look = new THREE.Vector3(b.x, Math.max(TABLE.height, b.y), b.z);
  if (portrait) {
    return { pos: new THREE.Vector3(b.x * 0.4, TABLE.height + 1.9, b.z * 0.5 - 2.4), look, vfov: 72 };
  }
  return { pos: new THREE.Vector3(b.x * 0.5 + 1.9, TABLE.height + 0.75, b.z * 0.85), look, hfov: 70 };
}

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
    this.fov = camera.fov;
    this.snapNext = true;
  }

  setMode(mode, slot = this.slot) {
    if (mode === this.mode && slot === this.slot) return;
    this.mode = mode;
    this.slot = slot;
  }

  targetPose(ballPos) {
    const portrait = isPortraitAspect(this.camera.aspect);
    switch (this.mode) {
      case CAMERA_MODES.PLAYER:
      case CAMERA_MODES.POV:
        return playerPose(this.slot, portrait);
      case CAMERA_MODES.FOLLOW:
        return followPose(ballPos, portrait);
      default:
        return broadcastPose(portrait);
    }
  }

  update(dt, ballPos) {
    const cam = this.camera;
    const pose = this.targetPose(ballPos);
    const k = this.snapNext ? 1 : 1 - Math.exp(-dt * (this.mode === CAMERA_MODES.FOLLOW ? 5 : 3.5));
    this.snapNext = false;
    this.pos.lerp(pose.pos, k);
    this.look.lerp(pose.look, k);

    const targetFov = pose.vfov ?? THREE.MathUtils.clamp(
      THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(pose.hfov) / 2) / cam.aspect)),
      42,
      92,
    );
    this.fov += (targetFov - this.fov) * k;
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    cam.position.copy(this.pos);
    cam.lookAt(this.look);
  }
}
