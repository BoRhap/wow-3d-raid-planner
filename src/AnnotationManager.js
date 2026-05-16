// src/AnnotationManager.js
import * as THREE from 'three';

export class AnnotationManager {
  constructor(sceneManager, dataStore, unitManager) {
    this.sceneManager = sceneManager;
    this.dataStore = dataStore;
    this.unitManager = unitManager;
    this.meshes = [];
  }

  createArrowAnnotation(start, end, color) {
    const group = new THREE.Group(); group.name = `arrow_${Date.now()}`;
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    if (len < 0.01) return group; // points too close
    dir.normalize();

    const s = 0.2; // scale factor
    const arrowColor = color || 0xfbbf24;

    // Scaled dimensions
    const shaftRadius = 0.2 * s * 0.5;  // 0.04 * 0.5 = 0.02
    const headRadius = 0.8 * s * 0.5;   // 0.16 * 0.5 = 0.08
    const headHeight = 1.5 * s;    // 0.3

    // Shaft: from start to (end - dir * headHeight), if there's room
    const shaftEndWorld = new THREE.Vector3().copy(end).addScaledVector(dir, -headHeight);
    const shaftLen = Math.max(0, shaftEndWorld.distanceTo(start));

    if (shaftLen > 0.05) {
      // Shaft center is midpoint between start and shaftEndWorld
      const shaftMidWorld = new THREE.Vector3().addVectors(start, shaftEndWorld).multiplyScalar(0.5);
      const shaftGeo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLen, 12);
      const shaftMat = new THREE.MeshBasicMaterial({ color: arrowColor, transparent: true, opacity: 0.9 });
      const shaft = new THREE.Mesh(shaftGeo, shaftMat);
      shaft.position.copy(shaftMidWorld);
      const shaftQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      shaft.quaternion.copy(shaftQuat);
      group.add(shaft);
    }

    // Head: tip at end, base faces start
    // ConeGeometry: tip at +Y, base at -Y
    // After rotation with (0,1,0)->dir: tip at +dir, base at -dir
    // We want tip at end, so position head at end - dir * headHeight/2
    const headGeo = new THREE.ConeGeometry(headRadius, headHeight, 12);
    const headMat = new THREE.MeshBasicMaterial({ color: arrowColor });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.copy(end).addScaledVector(dir, -headHeight / 2);
    const headQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    head.quaternion.copy(headQuat);
    group.add(head);

    group.userData = { isAnnotation: true, annotationType: 'arrow', start: start.clone(), end: end.clone(), color: arrowColor };
    group.position.y -= 0.2;  // Y轴高度下降0.2
    this.sceneManager.getScene().add(group); this.meshes.push(group); return group;
  }

  createZoneAnnotation(center, radius, color, label) {
    const group = new THREE.Group(); group.name = `zone_${Date.now()}`;
    const c = color || 0xef4444;
    const circGeo = new THREE.CircleGeometry(radius * 0.2, 48);
    const circMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
    const circ = new THREE.Mesh(circGeo, circMat); circ.rotation.x = -Math.PI / 2; circ.position.set(center.x, center.y + 0.08, center.z); group.add(circ);
    const ringGeo = new THREE.RingGeometry(radius * 0.2 - 0.02, radius * 0.2, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat); ring.rotation.x = -Math.PI / 2; ring.position.set(center.x, center.y + 0.1, center.z); group.add(ring);
    const pulseGeo = new THREE.RingGeometry(radius * 0.2, radius * 0.2 + 0.03, 48);
    const pulseMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const pulse = new THREE.Mesh(pulseGeo, pulseMat); pulse.rotation.x = -Math.PI / 2; pulse.position.set(center.x, center.y + 0.09, center.z); pulse.userData.pulse = true; group.add(pulse);
    if (label) { const sprite = this.unitManager.createTextSprite(label, c); sprite.position.set(center.x, center.y + 0.3, center.z); sprite.scale.set(0.6, 0.15, 1); group.add(sprite); }
    group.userData = { isAnnotation: true, annotationType: 'zone', center: center.clone(), radius, color: c, label };
    this.sceneManager.getScene().add(group); this.meshes.push(group); return group;
  }

  createLabelAnnotation(position, text) {
    const group = new THREE.Group(); group.name = `label_${Date.now()}`;
    const sprite = this.unitManager.createTextSprite('📌 ' + text, '#ffffff');
    sprite.position.set(position.x, position.y + 0.3, position.z); sprite.scale.set(0.9, 0.22, 1); group.add(sprite);
    const pinH = position.y + 0.01;
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, pinH, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }));
    pin.position.set(position.x, pinH / 2, position.z); group.add(pin);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
    dot.position.set(position.x, position.y + 0.01, position.z); group.add(dot);
    group.userData = { isAnnotation: true, annotationType: 'label', text, pos: position.clone() };
    this.sceneManager.getScene().add(group); this.meshes.push(group); return group;
  }

  selectAnnotation(mesh) {
    this.dataStore.selectedAnnotation = mesh;
  }

  deselectAnnotation() {
    this.dataStore.selectedAnnotation = null;
  }

  deleteAnnotation(mesh) {
    const idx = this.meshes.indexOf(mesh);
    if (idx >= 0) {
      this.sceneManager.getScene().remove(mesh);
      this.meshes.splice(idx, 1);
    }
    if (this.dataStore.selectedAnnotation === mesh) this.deselectAnnotation();
  }

  clearAll() {
    this.meshes.forEach(m => this.sceneManager.getScene().remove(m));
    this.meshes.length = 0;
  }
}
