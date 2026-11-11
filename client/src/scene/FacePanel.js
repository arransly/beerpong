import * as THREE from 'three';
import gsap from 'gsap';
import { SLOTS, TEAMS, TABLE, HALF_L, HALF_W } from '@bptt/shared/constants.js';
import {
  avatarTexture,
  videoTexture,
  fitCover,
  whenVideoSized,
  roundedRectGeometry,
  labelSprite,
  canvasTexture,
} from './textures.js';

const PANEL_W = 0.4;
const PANEL_H = 0.3;

/** Shows either a live video or an initials avatar on a mesh, cropped to fill it. */
export class FaceSurface {
  constructor(mesh, aspect) {
    this.mesh = mesh;
    this.aspect = aspect;
    this.key = null;
    this.texture = null;
    this.unwatch = null;
  }

  set({ name, color, video }) {
    const key = video ? video : `avatar:${name}:${color}`;
    if (key === this.key) return;
    this.key = key;
    this.unwatch?.();
    this.unwatch = null;
    this.texture?.dispose();

    if (video) {
      this.texture = videoTexture(video);
      this.unwatch = whenVideoSized(video, (srcAspect) => fitCover(this.texture, srcAspect, this.aspect));
      video.play?.().catch(() => {});
    } else {
      this.texture = avatarTexture(name, color);
      fitCover(this.texture, 1, this.aspect);
    }
    this.mesh.material.map = this.texture;
    this.mesh.material.needsUpdate = true;
  }

  clear() {
    this.unwatch?.();
    this.texture?.dispose();
    this.texture = null;
    this.key = null;
    this.mesh.material.map = null;
  }
}

function flashTexture(text, color) {
  return canvasTexture(512, 384, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(10,6,8,0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.font = '108px "Bowlby One", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#1a0d08';
    ctx.strokeText(text, w / 2, h / 2, w - 30);
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2, w - 30);
  });
}

/** A player's face floating beside their corner of the table. */
export class FacePanel {
  constructor(slot) {
    const s = SLOTS[slot];
    this.slot = slot;
    this.color = TEAMS[s.team].color;

    this.group = new THREE.Group();
    this.setLayout(false);

    this.frame = new THREE.Mesh(
      roundedRectGeometry(PANEL_W + 0.03, PANEL_H + 0.03, 0.045),
      new THREE.MeshBasicMaterial({ color: this.color }),
    );
    this.face = new THREE.Mesh(
      roundedRectGeometry(PANEL_W, PANEL_H, 0.035),
      new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    );
    this.face.position.z = 0.002;
    this.overlay = new THREE.Mesh(
      roundedRectGeometry(PANEL_W, PANEL_H, 0.035),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    this.overlay.position.z = 0.004;
    this.label = labelSprite('', { width: 0.34, accent: this.color });
    this.label.position.y = -PANEL_H / 2 - 0.055;

    this.inner = new THREE.Group();
    this.inner.add(this.frame, this.face, this.overlay, this.label);
    this.group.add(this.inner);
    this.surface = new FaceSurface(this.face, PANEL_W / PANEL_H);
    this.group.visible = false;
    this.labelText = '';
  }

  // Portrait screens are narrow, so panels tuck in tight to the corners and shrink.
  setLayout(portrait) {
    if (this.portrait === portrait) return;
    this.portrait = portrait;
    const s = SLOTS[this.slot];
    if (portrait) {
      this.group.position.set(s.xSign * (HALF_W + 0.16), TABLE.height + 0.34, s.side * (HALF_L - 0.1));
      this.group.scale.setScalar(0.7);
    } else {
      this.group.position.set(s.xSign * (HALF_W + 0.42), TABLE.height + 0.52, s.side * (HALF_L - 0.3));
      this.group.scale.setScalar(1);
    }
  }

  setMember(member, video, { isMe = false, points = 0 } = {}) {
    if (!member) {
      this.group.visible = false;
      this.surface.clear();
      return;
    }
    this.group.visible = true;
    this.surface.set({ name: member.name, color: this.color, video });
    let text = `${member.name}${isMe ? ' (you)' : ''} · ${points}`;
    if (!member.connected) text = `${member.name} · reconnecting…`;
    if (text !== this.labelText) {
      this.labelText = text;
      this.label.setText(text);
    }
    this.face.material.color.set(member.connected ? '#ffffff' : '#666666');
  }

  billboard(camera) {
    this.group.quaternion.copy(camera.quaternion);
  }

  flash(text, color = '#ffd36b', hold = 0.9) {
    this.overlay.material.map?.dispose();
    this.overlay.material.map = flashTexture(text, color);
    this.overlay.material.needsUpdate = true;
    gsap.killTweensOf(this.overlay.material);
    gsap.timeline()
      .fromTo(this.overlay.material, { opacity: 0 }, { opacity: 1, duration: 0.15 })
      .to(this.overlay.material, { opacity: 0, duration: 0.5, delay: hold });
    gsap.fromTo(this.inner.scale, { x: 1.35, y: 1.35 }, { x: 1, y: 1, duration: 0.8, ease: 'elastic.out(1, 0.4)' });
  }
}
