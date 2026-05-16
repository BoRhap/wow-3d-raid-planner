// src/SceneManager.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class SceneManager {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.clock = null;
    this.groundPlane = null;
    this.gridHelper = null;
    this.borderLines = null;
    this.groundWidth = 60;
    this.groundHeight = 60;
    this.brightness = 1.2;

    // Free roam state
    this.freeRoamMode = false;
    this.freeRoamSpeed = 5;
    this.freeRoamEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.isPointerLocked = false;
    this.keys = { w: false, a: false, s: false, d: false, q: false, e: false, shift: false };
  }

  init() {
    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e17);
    this.scene.fog = new THREE.FogExp2(0x0a0e17, 0.001);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.camera.position.set(0, 80, 60);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.LinearToneMapping;
    this.renderer.toneMappingExposure = this.brightness;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.localClippingEnabled = true;
    const root = document.getElementById('root') ?? document.body;
    root.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2.05;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 500;
    this.controls.target.set(0, 0, 0);

    // Pointer lock for free roam
    this.renderer.domElement.addEventListener('click', () => {
      if (this.freeRoamMode && !this.isPointerLocked) {
        this.renderer.domElement.requestPointerLock();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.renderer.domElement;
    });

    this.createLighting();
    this.createGround(this.groundWidth, this.groundHeight);
    this.createRuneParticles();
  }

  // --- Getters ---
  getCamera() { return this.camera; }
  getScene() { return this.scene; }
  getRenderer() { return this.renderer; }
  getControls() { return this.controls; }
  getClock() { return this.clock; }

  // --- Lighting ---
  createLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 2.0);
    ambient.name = 'ambientLight';
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xfff5e6, 3.0);
    dirLight.name = 'dirLight';
    dirLight.position.set(40, 80, 40);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.left = -80; dirLight.shadow.camera.right = 80;
    dirLight.shadow.camera.top = 80; dirLight.shadow.camera.bottom = -80;
    dirLight.shadow.camera.near = 1; dirLight.shadow.camera.far = 300;
    dirLight.shadow.bias = -0.0005;
    dirLight.shadow.normalBias = 0.04;
    this.scene.add(dirLight);

    const d2 = new THREE.DirectionalLight(0xaaccff, 1.5);
    d2.name = 'dirLight2'; d2.position.set(-30, 50, -30);
    this.scene.add(d2);

    const d3 = new THREE.DirectionalLight(0x8899bb, 0.8);
    d3.name = 'dirLight3'; d3.position.set(0, -20, 0);
    this.scene.add(d3);

    const hemi = new THREE.HemisphereLight(0xddeeff, 0x667788, 1.8);
    hemi.name = 'hemiLight';
    this.scene.add(hemi);

    const pointLights = [
      [-40, 25, -40, 0xccaaff], [40, 25, 40, 0xaaccff],
      [40, 25, -40, 0xffeedd], [-40, 25, 40, 0xddffee]
    ];
    pointLights.forEach(([x, y, z, c], i) => {
      const pl = new THREE.PointLight(c, 1.1, 200);
      pl.name = `fillLight${i + 1}`;
      pl.position.set(x, y, z);
      this.scene.add(pl);
    });
  }

  // --- Ground ---
  // PUBLIC because loadModelIntoScene() calls it
  createGround(w, h) {
    if (this.groundPlane) this.scene.remove(this.groundPlane);
    if (this.gridHelper) this.scene.remove(this.gridHelper);
    if (this.borderLines) this.scene.remove(this.borderLines);
    this.groundWidth = w;
    this.groundHeight = h;

    const geo = new THREE.PlaneGeometry(w, h, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3a4060, roughness: 0.8, metalness: 0,
      transparent: true, opacity: 0.08
    });
    this.groundPlane = new THREE.Mesh(geo, mat);
    this.groundPlane.name = 'groundPlane';
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.receiveShadow = true;
    this.scene.add(this.groundPlane);

    const gridDiv = Math.max(Math.round(Math.max(w, h) / 2), 10);
    const gridSize = Math.max(w, h);
    this.gridHelper = new THREE.GridHelper(gridSize, gridDiv, 0x4a5080, 0x2a3050);
    this.gridHelper.name = 'gridHelper';
    this.gridHelper.position.y = 0.02;
    this.gridHelper.material.opacity = 0.2;
    this.gridHelper.material.transparent = true;
    this.scene.add(this.gridHelper);

    const bGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, h));
    const bMat = new THREE.LineBasicMaterial({ color: 0x6633cc, transparent: true, opacity: 0.4 });
    this.borderLines = new THREE.LineSegments(bGeo, bMat);
    this.borderLines.name = 'borderLines';
    this.borderLines.rotation.x = -Math.PI / 2;
    this.borderLines.position.y = 0.04;
    this.scene.add(this.borderLines);
  }

  // --- Rune Particles ---
  createRuneParticles() {
    const count = 150;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 80;
      positions[i * 3 + 1] = Math.random() * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xa855f7, size: 0.3, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const particles = new THREE.Points(geo, mat);
    particles.name = 'runeParticles';
    this.scene.add(particles);
  }

  // --- Brightness ---
  setBrightness(val) {
    this.brightness = val;
    this.renderer.toneMappingExposure = val;
    const amb = this.scene.getObjectByName('ambientLight');
    if (amb) amb.intensity = 2 * val;
    const d = this.scene.getObjectByName('dirLight');
    if (d) d.intensity = 3 * val;
    const d2 = this.scene.getObjectByName('dirLight2');
    if (d2) d2.intensity = 1.5 * val;
    const d3 = this.scene.getObjectByName('dirLight3');
    if (d3) d3.intensity = 0.8 * val;
    const h = this.scene.getObjectByName('hemiLight');
    if (h) h.intensity = 1.8 * val;
    for (let i = 1; i <= 4; i++) {
      const l = this.scene.getObjectByName(`fillLight${i}`);
      if (l) l.intensity = 1.1 * val;
    }
  }

  // --- Free Roam ---
  toggleFreeRoam() {
    this.freeRoamMode = !this.freeRoamMode;
    this.controls.enabled = !this.freeRoamMode;
    if (!this.freeRoamMode) {
      document.exitPointerLock();
      this.isPointerLocked = false;
    }
    return this.freeRoamMode;
  }

  updateFreeRoamMovement(delta) {
    if (!this.freeRoamMode || !this.isPointerLocked) return;
    const speed = this.freeRoamSpeed * delta;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    if (this.keys.w) this.camera.position.addScaledVector(forward, speed);
    if (this.keys.s) this.camera.position.addScaledVector(forward, -speed);
    if (this.keys.a) this.camera.position.addScaledVector(right, -speed);
    if (this.keys.d) this.camera.position.addScaledVector(right, speed);
    if (this.keys.q) this.camera.position.y -= speed;
    if (this.keys.e) this.camera.position.y += speed;
    if (this.keys.shift) this.camera.position.addScaledVector(forward, speed * 2);
  }

  handleMouseMoveForFreeRoam(e) {
    if (!this.freeRoamMode || !this.isPointerLocked) return;
    const sensitivity = 0.002;
    this.freeRoamEuler.setFromQuaternion(this.camera.quaternion);
    this.freeRoamEuler.y -= e.movementX * sensitivity;
    this.freeRoamEuler.x -= e.movementY * sensitivity;
    this.freeRoamEuler.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.freeRoamEuler.x));
    this.camera.quaternion.setFromEuler(this.freeRoamEuler);
  }

  // --- Window resize handler ---
  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // --- Animate ---
  animate(unitMeshes, annotationMeshes, selectedUnit) {
    const delta = this.clock.getDelta();
    const t = this.clock.getElapsedTime();
    this.updateFreeRoamMovement(delta);

    unitMeshes.forEach((u, i) => {
      if (u !== selectedUnit) {
        const bob = Math.sin(t * 2 + i * 0.7) * 0.03;
        u.children.forEach(c => { if (c.isMesh || c.isGroup) c.position.y += bob * 0.1; });
      }
      if (u === selectedUnit) {
        const pulse = 1 + Math.sin(t * 3) * 0.03;
        const base = u.userData.unitScale || 0.1;
        u.scale.set(base * pulse, base * pulse, base * pulse);
      }
    });

    annotationMeshes.forEach(a => a.traverse(c => {
      if (c.userData?.pulse && c.material) {
        c.material.opacity = 0.15 + Math.sin(t * 3) * 0.15;
      }
    }));

    const particles = this.scene.getObjectByName('runeParticles');
    if (particles) {
      particles.rotation.y = t * 0.015;
      const pos = particles.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.array[i * 3 + 1] += Math.sin(t + i) * 0.001;
      }
      pos.needsUpdate = true;
    }

    unitMeshes.forEach(u => {
      const ring = u.getObjectByName('selectionRing');
      if (ring) ring.rotation.z = t * 2;
    });

    if (!this.freeRoamMode) this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
