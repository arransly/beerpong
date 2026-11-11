import * as THREE from 'three';
import gsap from 'gsap';
import { GLASS, SIPS_PER_GLASS, glassPosition } from '@bptt/shared/constants.js';

const INNER = 0.9;

export class GlassMesh {
  constructor(slot) {
    this.slot = slot;
    this.group = new THREE.Group();
    const pos = glassPosition(slot);
    this.group.position.set(pos.x, pos.y, pos.z);

    const profile = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(GLASS.radiusBottom, 0),
      new THREE.Vector2(GLASS.radiusBottom + 0.001, 0.012),
      new THREE.Vector2(GLASS.radiusTop * 0.97, GLASS.height * 0.8),
      new THREE.Vector2(GLASS.radiusTop, GLASS.height),
    ];
    this.shell = new THREE.Mesh(
      new THREE.LatheGeometry(profile, 32),
      new THREE.MeshPhysicalMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.22,
        roughness: 0.05,
        metalness: 0,
        clearcoat: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.shell.castShadow = true;

    this.beerHeight = GLASS.height * 0.86;
    const beerGeo = new THREE.CylinderGeometry(GLASS.radiusTop * INNER, GLASS.radiusBottom * INNER, this.beerHeight, 28);
    beerGeo.translate(0, this.beerHeight / 2, 0);
    this.beer = new THREE.Mesh(
      beerGeo,
      new THREE.MeshStandardMaterial({
        color: '#f0a020',
        emissive: '#8a4a00',
        emissiveIntensity: 0.35,
        transparent: true,
        opacity: 0.92,
        roughness: 0.2,
      }),
    );
    this.beer.position.y = 0.004;

    this.foam = new THREE.Mesh(
      new THREE.CylinderGeometry(GLASS.radiusTop * INNER, GLASS.radiusTop * INNER * 0.98, 0.016, 28),
      new THREE.MeshStandardMaterial({ color: '#fff8e8', roughness: 0.9 }),
    );

    this.group.add(this.beer, this.foam, this.shell);
    this.level = 1;
    this.applyLevel();
    this.group.visible = false;
  }

  applyLevel() {
    const level = Math.max(0.0001, this.level);
    this.beer.scale.y = level;
    this.beer.visible = this.level > 0.01;
    this.foam.visible = this.level > 0.01;
    this.foam.position.y = 0.004 + this.beerHeight * level + 0.006;
    const r = (GLASS.radiusBottom + (GLASS.radiusTop - GLASS.radiusBottom) * level) / GLASS.radiusTop;
    this.foam.scale.set(r, 1, r);
  }

  setState({ sips, active }, animate = true) {
    const target = sips / SIPS_PER_GLASS;
    if (animate && Math.abs(target - this.level) > 0.001) {
      gsap.to(this, { level: target, duration: 0.9, ease: 'power2.inOut', onUpdate: () => this.applyLevel() });
    } else {
      this.level = target;
      this.applyLevel();
    }
    if (active && (!this.group.visible || this.hiding)) {
      gsap.killTweensOf(this.group.scale);
      this.hiding = false;
      this.group.visible = true;
      gsap.fromTo(this.group.scale, { x: 0.01, y: 0.01, z: 0.01 }, { x: 1, y: 1, z: 1, duration: 0.6, ease: 'back.out(2)' });
    } else if (!active && this.group.visible && !this.hiding) {
      this.hiding = true;
      gsap.to(this.group.scale, {
        x: 0.01, y: 0.01, z: 0.01, duration: 0.5, delay: animate ? 1.4 : 0, ease: 'back.in(2)',
        onComplete: () => {
          this.hiding = false;
          this.group.visible = false;
          this.group.scale.set(1, 1, 1);
        },
      });
    }
  }

  wobble() {
    gsap.fromTo(this.group.rotation, { z: 0.12 }, { z: 0, duration: 0.7, ease: 'elastic.out(1.2, 0.3)' });
  }
}
