// src/ClipPlaneManager.js
import * as THREE from 'three';

export class ClipPlaneManager {
  constructor(sceneManager, modelManager) {
    this.sceneManager = sceneManager;
    this.modelManager = modelManager;
    this.enabled = false;
    this.height = 100;
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 100);
    this.helper = null;
  }

  enable() {
    this.enabled = true;
    this.#applyToModel();
    this.#showHelper();
  }

  disable() {
    this.enabled = false;
    this.#applyToModel();
    this.#hideHelper();
  }

  toggle() {
    this.enabled ? this.disable() : this.enable();
    return this.enabled;
  }

  setHeight(val) {
    this.height = val;
    this.clipPlane.constant = val;
    if (this.helper) this.helper.position.y = val;
  }

  updateRange() {
    const model = this.modelManager.getCurrentModel();
    if (!model) return { min: 0, max: 100 };
    const box = new THREE.Box3().setFromObject(model);
    const margin = (box.max.y - box.min.y) * 0.05;
    return { min: box.min.y, max: box.max.y + margin };
  }

  #applyToModel() {
    const model = this.modelManager.getCurrentModel();
    if (!model) return;
    model.traverse(child => {
      if (child.isMesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(m => {
          m.clippingPlanes = this.enabled ? [this.clipPlane] : [];
          m.clipShadows = this.enabled;
          m.needsUpdate = true;
        });
      }
    });
  }

  #showHelper() {
    if (!this.helper) this.#createHelper();
    this.helper.visible = true;
  }

  #hideHelper() {
    if (this.helper) this.helper.visible = false;
  }

  #createHelper() {
    if (this.helper) this.sceneManager.getScene().remove(this.helper);
    const group = new THREE.Group();
    group.name = 'clipPlaneHelper';

    const gw = this.sceneManager.groundWidth || 60;
    const gh = this.sceneManager.groundHeight || 60;
    const s = Math.max(gw, gh) * 1.2;

    const planeGeo = new THREE.PlaneGeometry(s, s);
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0xff4444, transparent: true, opacity: 0.06,
      side: THREE.DoubleSide, depthWrite: false
    });
    const mesh = new THREE.Mesh(planeGeo, planeMat);
    mesh.rotation.x = -Math.PI / 2;
    group.add(mesh);

    const ringGeo = new THREE.RingGeometry(s * 0.48, s * 0.5, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff4444, transparent: true, opacity: 0.2,
      side: THREE.DoubleSide, depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    const half = s * 0.4;
    const lineMat = new THREE.LineBasicMaterial({ color: 0xff6666, transparent: true, opacity: 0.1 });
    for (let i = 0; i <= 12; i++) {
      const t = (i / 12) * 2 - 1;
      group.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(t * half, 0, -half), new THREE.Vector3(t * half, 0, half)]),
        lineMat
      ));
      group.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-half, 0, t * half), new THREE.Vector3(half, 0, t * half)]),
        lineMat
      ));
    }

    group.position.y = this.height;
    group.visible = this.enabled;
    this.sceneManager.getScene().add(group);
    this.helper = group;
  }
}
