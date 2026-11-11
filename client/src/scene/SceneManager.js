import * as THREE from 'three';
import { TABLE } from '@bptt/shared/constants.js';
import { canvasTexture } from './textures.js';

export class SceneManager {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#140c0d');
    this.scene.fog = new THREE.Fog('#140c0d', 7, 16);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 40);
    this.camera.position.set(3, 2.2, 0);
    this.camera.lookAt(0, TABLE.height, 0);

    this.clock = new THREE.Clock();
    this.frameHandlers = [];

    this.buildLights();
    this.buildRoom();

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight('#ffd9a8', '#2a1414', 0.7));

    const lamp = new THREE.SpotLight('#fff1dc', 40, 8, Math.PI / 4.2, 0.45, 1.6);
    lamp.position.set(0, TABLE.height + 2.3, 0);
    lamp.target.position.set(0, TABLE.height, 0);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(1024, 1024);
    lamp.shadow.bias = -0.0005;
    this.scene.add(lamp, lamp.target);

    const warmA = new THREE.PointLight('#ff8a3d', 6, 9);
    warmA.position.set(-3, 2.4, -2.5);
    const warmB = new THREE.PointLight('#ffb347', 6, 9);
    warmB.position.set(3, 2.4, 2.5);
    this.scene.add(warmA, warmB);

    // Pendant shade over the table.
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.22, 24, 1, true),
      new THREE.MeshStandardMaterial({ color: '#1c3b2a', side: THREE.DoubleSide, metalness: 0.4, roughness: 0.5 }),
    );
    shade.position.set(0, TABLE.height + 2.35, 0);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 12, 12),
      new THREE.MeshBasicMaterial({ color: '#fff4d6' }),
    );
    bulb.position.set(0, TABLE.height + 2.28, 0);
    this.scene.add(shade, bulb);
  }

  buildRoom() {
    const floorTex = canvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#3a2418';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? '#43291b' : '#352015';
        ctx.fillRect(0, (i * h) / 8, w, h / 8 - 3);
      }
    });
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(6, 6);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: '#2a1517', roughness: 0.95 });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(24, 6), wallMat);
    wall.position.set(-5.5, 3, 0);
    wall.rotation.y = Math.PI / 2;
    this.scene.add(wall);

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.8),
      new THREE.MeshBasicMaterial({
        transparent: true,
        map: canvasTexture(1024, 256, (ctx, w, h) => {
          ctx.font = '96px "Bowlby One", Impact, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = '#ff7a2f';
          ctx.shadowBlur = 36;
          ctx.fillStyle = '#ffd36b';
          ctx.fillText('BEER PONG', w / 2, h / 2);
        }),
      }),
    );
    sign.position.set(-5.45, 2.6, 0);
    sign.rotation.y = Math.PI / 2;
    this.scene.add(sign);
  }

  onFrame(fn) {
    this.frameHandlers.push(fn);
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.1);
      for (const fn of this.frameHandlers) fn(dt);
      this.renderer.render(this.scene, this.camera);
    });
  }
}
