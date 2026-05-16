// src/PhaseManager.js
import * as THREE from 'three';

export class PhaseManager {
  constructor(dataStore, unitManager, annotationManager, sceneManager, modelManager) {
    this.dataStore = dataStore;
    this.unitManager = unitManager;
    this.annotationManager = annotationManager;
    this.sceneManager = sceneManager;
    this.modelManager = modelManager;
    this.animating = false;
  }

  // ─── Phase switching ───────────────────────────────────────

  switchPhase(newIdx, withAnimation = true, onComplete) {
    const phases = this.dataStore.getPhases();
    if (newIdx === this.dataStore.currentPhase || newIdx < 0 || newIdx >= phases.length || this.animating) return;
    this.dataStore.savePhaseState(this.unitManager.meshes, this.annotationManager.meshes);
    const oldPhase = phases[this.dataStore.currentPhase], newPhase = phases[newIdx];
    if (withAnimation && oldPhase.units?.length > 0 && newPhase.units?.length > 0) {
      this.#animateTransition(oldPhase, newPhase, () => {
        this.dataStore.currentPhase = newIdx;
        this.dataStore.getCurrentSceneData().currentPhase = this.dataStore.currentPhase;
        if (onComplete) onComplete();
      });
    } else {
      this.dataStore.currentPhase = newIdx;
      this.dataStore.getCurrentSceneData().currentPhase = this.dataStore.currentPhase;
      this.loadPhaseState(newPhase);
      if (onComplete) onComplete();
    }
  }

  // ─── Scene object management ───────────────────────────────

  clearSceneObjects() {
    this.unitManager.meshes.forEach(m => this.sceneManager.getScene().remove(m));
    this.unitManager.meshes.length = 0;
    this.unitManager.labelSprites.forEach(s => this.sceneManager.getScene().remove(s));
    this.unitManager.labelSprites.length = 0;
    this.annotationManager.clearAll();
  }

  loadPhaseState(phase) {
    this.clearSceneObjects();
    if (phase.units) phase.units.forEach(u => {
      let mesh;
      if (this.unitManager.customItemsRegistry[u.type]) {
        mesh = this.unitManager.createCustomMesh(u.type, u.x, u.z, u.label, u.unitScale);
      } else {
        mesh = this.unitManager.createUnitMesh(u.type, u.x, u.z, u.label, u.unitScale);
      }
      mesh.name = u.name;
      if (u.y !== undefined && u.y !== 0) mesh.position.y = u.y;
      else mesh.position.y = this.modelManager.getModelSurfaceHeight(u.x, u.z);
      if (u.rx !== undefined) mesh.rotation.x = u.rx;
      if (u.ry !== undefined) mesh.rotation.y = u.ry;
      if (u.rz !== undefined) mesh.rotation.z = u.rz;
      const sprite = this.unitManager.labelSprites.find(s => s.userData.parentUnit === mesh);
      if (sprite) {
        const targetY = Math.max(mesh.position.y + sprite.userData.offsetY, 0.5);
        sprite.position.set(mesh.position.x, targetY, mesh.position.z);
      }
    });
    if (phase.annotations) phase.annotations.forEach(a => {
      if (a.type === 'arrow' && a.start && a.end) this.annotationManager.createArrowAnnotation(new THREE.Vector3(a.start.x, a.start.y || 0, a.start.z), new THREE.Vector3(a.end.x, a.end.y || 0, a.end.z), a.color);
      else if (a.type === 'zone' && a.center) this.annotationManager.createZoneAnnotation(new THREE.Vector3(a.center.x, a.center.y || 0, a.center.z), a.radius, a.color, a.label);
      else if (a.type === 'label' && a.pos) this.annotationManager.createLabelAnnotation(new THREE.Vector3(a.pos.x, a.pos.y || 0, a.pos.z), a.text);
    });
  }

  // ─── Animated transition ───────────────────────────────────

  #animateTransition(oldP, newP, callback) {
    this.animating = true;
    const duration = 1.2;
    let elapsed = 0;
    const pairs = [];
    if (newP.units) newP.units.forEach(nu => {
      const existing = this.unitManager.meshes.find(m => m.name === nu.name);
      if (existing) {
        const toY = nu.y !== undefined ? nu.y : this.modelManager.getModelSurfaceHeight(nu.x, nu.z);
        pairs.push({ mesh: existing, from: { x: existing.position.x, y: existing.position.y, z: existing.position.z }, to: { x: nu.x, y: toY, z: nu.z } });
      }
    });
    const existingNames = this.unitManager.meshes.map(m => m.name);
    const toAdd = (newP.units || []).filter(nu => !existingNames.includes(nu.name));
    const newNames = (newP.units || []).map(nu => nu.name);
    const toRemove = this.unitManager.meshes.filter(m => !newNames.includes(m.name));

    const frame = () => {
      elapsed += this.sceneManager.getClock().getDelta();
      const t = Math.min(elapsed / duration, 1);
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      pairs.forEach(p => {
        p.mesh.position.x = p.from.x + (p.to.x - p.from.x) * ease;
        p.mesh.position.z = p.from.z + (p.to.z - p.from.z) * ease;
        const baseY = p.from.y + (p.to.y - p.from.y) * ease;
        const midY = this.modelManager.getModelSurfaceHeight(p.mesh.position.x, p.mesh.position.z);
        p.mesh.position.y = Math.max(baseY, midY) + Math.sin(ease * Math.PI) * 2.0;
        this.unitManager.updateUnitSprite(p.mesh);
      });
      toRemove.forEach(m => m.scale.setScalar((1 - ease) * (m.userData.unitScale || 0.1)));
      pairs.forEach(p => { if (t > 0.05 && t < 0.95 && Math.random() < 0.3) this.#createTrailParticle(p.mesh.position); });
      this.sceneManager.getControls().update();
      this.sceneManager.getRenderer().render(this.sceneManager.getScene(), this.sceneManager.getCamera());
      if (t >= 1) {
        toRemove.forEach(m => {
          this.sceneManager.getScene().remove(m);
          const idx = this.unitManager.meshes.indexOf(m);
          if (idx > -1) this.unitManager.meshes.splice(idx, 1);
          const spriteIdx = this.unitManager.labelSprites.findIndex(s => s.userData.parentUnit === m);
          if (spriteIdx > -1) {
            this.sceneManager.getScene().remove(this.unitManager.labelSprites[spriteIdx]);
            this.unitManager.labelSprites.splice(spriteIdx, 1);
          }
        });
        toAdd.forEach(nu => {
          const m = this.unitManager.createUnitMesh(nu.type, nu.x, nu.z, nu.label, nu.unitScale);
          m.position.y = nu.y !== undefined ? nu.y : this.modelManager.getModelSurfaceHeight(nu.x, nu.z);
          if (nu.rx !== undefined) m.rotation.x = nu.rx;
          if (nu.ry !== undefined) m.rotation.y = nu.ry;
          if (nu.rz !== undefined) m.rotation.z = nu.rz;
          this.unitManager.updateUnitSprite(m);
        });
        pairs.forEach(p => {
          p.mesh.position.y = p.to.y;
          this.unitManager.updateUnitSprite(p.mesh);
        });
        this.annotationManager.clearAll();
        if (newP.annotations) newP.annotations.forEach(a => {
          if (a.type === 'arrow' && a.start && a.end) this.annotationManager.createArrowAnnotation(new THREE.Vector3(a.start.x, a.start.y || 0, a.start.z), new THREE.Vector3(a.end.x, a.end.y || 0, a.end.z), a.color);
          else if (a.type === 'zone' && a.center) this.annotationManager.createZoneAnnotation(new THREE.Vector3(a.center.x, a.center.y || 0, a.center.z), a.radius, a.color, a.label);
          else if (a.type === 'label' && a.pos) this.annotationManager.createLabelAnnotation(new THREE.Vector3(a.pos.x, a.pos.y || 0, a.pos.z), a.text);
        });
        this.animating = false;
        this.sceneManager.getRenderer().setAnimationLoop(() => this.sceneManager.animate(this.unitManager.meshes, this.annotationManager.meshes, this.dataStore.selectedUnit));
        if (callback) callback();
        return;
      }
      this.sceneManager.getRenderer().setAnimationLoop(frame);
    };
    this.sceneManager.getRenderer().setAnimationLoop(frame);
  }

  #createTrailParticle(pos) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.6 }));
    p.position.copy(pos);
    p.position.x += (Math.random() - 0.5) * 0.3;
    p.position.z += (Math.random() - 0.5) * 0.3;
    this.sceneManager.getScene().add(p);
    setTimeout(() => this.sceneManager.getScene().remove(p), 500);
  }

  // ─── Auto-play / demo ──────────────────────────────────────

  startAutoPlay(onPhaseChange, onStartError, onComplete) {
    const phases = this.dataStore.getPhases();
    if (phases.length < 2) {
      if (onStartError) onStartError();
      return false;
    }
    let idx = 0;
    const play = () => {
      if (idx >= phases.length - 1) {
        if (onComplete) onComplete();
        return;
      }
      this.switchPhase(idx + 1, true, onPhaseChange);
      idx++;
      setTimeout(play, 2000);
    };
    this.switchPhase(0, false, onPhaseChange);
    setTimeout(play, 1000);
    return true;
  }
}
