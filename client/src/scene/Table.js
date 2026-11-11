import * as THREE from 'three';
import { TABLE, HALF_L, HALF_W, NET } from '@bptt/shared/constants.js';
import { canvasTexture } from './textures.js';

export function createTable() {
  const group = new THREE.Group();

  const top = new THREE.Mesh(
    new THREE.BoxGeometry(TABLE.width, TABLE.thickness, TABLE.length),
    new THREE.MeshStandardMaterial({ color: '#17457e', roughness: 0.55 }),
  );
  top.position.y = TABLE.height - TABLE.thickness / 2;
  top.receiveShadow = true;
  top.castShadow = true;
  group.add(top);

  const lineMat = new THREE.MeshBasicMaterial({ color: '#f4f4f4' });
  const lineY = TABLE.height + 0.0006;
  const addLine = (w, l, x, z) => {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(w, l), lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, lineY, z);
    line.receiveShadow = true;
    group.add(line);
  };
  const edge = 0.02;
  addLine(edge, TABLE.length, -HALF_W + edge / 2, 0);
  addLine(edge, TABLE.length, HALF_W - edge / 2, 0);
  addLine(TABLE.width, edge, 0, -HALF_L + edge / 2);
  addLine(TABLE.width, edge, 0, HALF_L - edge / 2);
  addLine(0.003, TABLE.length, 0, 0);

  const legMat = new THREE.MeshStandardMaterial({ color: '#1b1b1f', metalness: 0.6, roughness: 0.4 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, TABLE.height - TABLE.thickness, 0.05), legMat);
      leg.position.set(sx * (HALF_W - 0.12), (TABLE.height - TABLE.thickness) / 2, sz * (HALF_L - 0.25));
      leg.castShadow = true;
      group.add(leg);
    }
  }

  const netTex = canvasTexture(256, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 6) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += 6) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  });
  netTex.wrapS = THREE.RepeatWrapping;
  netTex.repeat.x = 6;
  const netWidth = TABLE.width + NET.overhang * 2;
  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(netWidth, NET.height),
    new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
  );
  net.position.set(0, TABLE.height + NET.height / 2, 0);
  group.add(net);

  const tape = new THREE.Mesh(
    new THREE.BoxGeometry(netWidth, 0.012, 0.006),
    new THREE.MeshStandardMaterial({ color: '#ffffff' }),
  );
  tape.position.set(0, TABLE.height + NET.height - 0.006, 0);
  group.add(tape);

  const postMat = new THREE.MeshStandardMaterial({ color: '#202024', metalness: 0.7, roughness: 0.3 });
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, NET.height + 0.02, 8), postMat);
    post.position.set(sx * (netWidth / 2), TABLE.height + NET.height / 2, 0);
    group.add(post);
  }

  return group;
}
