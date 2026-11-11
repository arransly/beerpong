import * as THREE from 'three';
import { BALL, TABLE, HALF_L, HALF_W } from '@bptt/shared/constants.js';

export class BallMesh {
  constructor() {
    this.group = new THREE.Group();
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL.radius, 20, 16),
      new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ff9d3c', emissiveIntensity: 0.25, roughness: 0.4 }),
    );
    this.mesh.castShadow = true;

    // A crisp contact shadow on the table makes height readable from any angle.
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(BALL.radius * 1.3, 20),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;

    this.group.add(this.mesh, this.shadow);
    this.group.visible = false;
  }

  setPosition(x, y, z) {
    this.mesh.position.set(x, y, z);
    const overTable = Math.abs(x) <= HALF_W && Math.abs(z) <= HALF_L && y >= TABLE.height;
    this.shadow.visible = overTable;
    if (overTable) {
      const h = y - TABLE.height;
      const s = 1 + h * 2.5;
      this.shadow.position.set(x, TABLE.height + 0.001, z);
      this.shadow.scale.set(s, s, s);
      this.shadow.material.opacity = Math.max(0.12, 0.5 - h * 0.8);
    }
  }
}
