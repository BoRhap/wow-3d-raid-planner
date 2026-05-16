import * as THREE from 'three';
import { UNIT_CATEGORIES } from './Constants.js';

export class InteractionManager {
  constructor(sceneManager, unitManager, annotationManager, modelManager, dataStore, phaseManager, callbacks = {}) {
    this.sceneManager = sceneManager;
    this.unitManager = unitManager;
    this.annotationManager = annotationManager;
    this.modelManager = modelManager;
    this.dataStore = dataStore;
    this.phaseManager = phaseManager;
    this.cb = callbacks;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.isDragging = false;
    this.dragTarget = null;
    this.arrowStart = null;
  }

  // --- Hit Testing ---

  getSceneIntersect(event) {
    const rect = this.sceneManager.getRenderer().domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.sceneManager.getCamera());
    const model = this.modelManager.getCurrentModel();
    if (model) {
      const meshes = []; model.traverse(c => { if (c.isMesh) meshes.push(c); });
      const hits = this.raycaster.intersectObjects(meshes, false);
      if (hits.length > 0) return hits[0].point.clone();
    }
    const planeHits = this.raycaster.intersectObject(this.sceneManager.groundPlane);
    if (planeHits.length > 0) {
      const pt = planeHits[0].point.clone();
      return pt;
    }
    return null;
  }

  getGroundIntersect(event) { return this.getSceneIntersect(event); }

  getUnitIntersect(event) {
    const rect = this.sceneManager.getRenderer().domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.sceneManager.getCamera());
    const hits = this.raycaster.intersectObjects(this.unitManager.meshes, true);
    if (hits.length > 0) {
      let obj = hits[0].object;
      while (obj && obj !== this.sceneManager.getScene() && !obj.userData.isUnit) obj = obj.parent;
      if (obj && obj.userData.isUnit) return obj;
    }
    return null;
  }

  getAnnotationIntersect(event) {
    const rect = this.sceneManager.getRenderer().domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.sceneManager.getCamera());
    const hits = this.raycaster.intersectObjects(this.annotationManager.meshes, true);
    if (hits.length > 0) {
      let obj = hits[0].object;
      while (obj && obj !== this.sceneManager.getScene() && !obj.userData.isAnnotation) obj = obj.parent;
      if (obj && obj.userData.isAnnotation) return obj;
    }
    return null;
  }

  // --- Event Binding ---

  bindEvents(domElement) {
    domElement.addEventListener('click', (e) => this._onCanvasClick(e));
    domElement.addEventListener('mousemove', (e) => this._onCanvasMouseMove(e));
    domElement.addEventListener('mousedown', (e) => this._onMouseDown(e));
    domElement.addEventListener('mouseup', (e) => this._onMouseUp(e));
    domElement.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.dataStore.selectedUnit = null;
      this.dataStore.selectedAnnotation = null;
      this.dataStore.placementMode = null;
      this.arrowStart = null;
      this.cb.updateToolbarSelection();
      this.unitManager.clearSelectionVisuals();
      this.cb.clearAnnotationSelection();
      this.cb.hideAnnotationEditPanel();
    });
    window.addEventListener('resize', () => this._onResize());
    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup', (e) => this._onKeyUp(e));
    document.addEventListener('click', (e) => {
      const panel = document.getElementById('annotationEditPanel');
      if (panel && panel.style.display !== 'none' && !panel.contains(e.target) && !e.target.closest('canvas')) {
        this.cb.hideAnnotationEditPanel();
      }
    });
  }

  // --- Mouse Handlers ---

  _onCanvasClick(e) {
    if (this.phaseManager.animating || this.sceneManager.freeRoamMode) return;
    const point = this.getGroundIntersect(e);
    if (!point) return;
    const halfW = this.sceneManager.groundWidth / 2 - 1, halfH = this.sceneManager.groundHeight / 2 - 1;
    point.x = Math.max(-halfW, Math.min(halfW, point.x));
    point.z = Math.max(-halfH, Math.min(halfH, point.z));

    if (this.dataStore.placementMode) {
      const allUnits = { ...UNIT_CATEGORIES.monsters.units, ...UNIT_CATEGORIES.players_role.units, ...UNIT_CATEGORIES.players_class.units, ...UNIT_CATEGORIES.custom.units };
      if (allUnits[this.dataStore.placementMode]) {
        const labelInput = document.getElementById('unitLabelInput');
        const label = labelInput?.value || '';
        let mesh;
        if (UNIT_CATEGORIES.custom.units[this.dataStore.placementMode]) {
          mesh = this.unitManager.createCustomMesh(this.dataStore.placementMode, point.x, point.z, label || undefined);
        } else {
          mesh = this.unitManager.createUnitMesh(this.dataStore.placementMode, point.x, point.z, label || undefined);
        }
        mesh.position.y = point.y || 0;
        this.unitManager.updateUnitSprite(mesh);
        const def = this.unitManager.getUnitDef(this.dataStore.placementMode);
        this.cb.showToast(`✅ 已放置 ${def.icon} ${def.label}`);
      } else if (this.dataStore.placementMode === 'arrow') {
        if (!this.arrowStart) { this.arrowStart = point.clone(); this.arrowStart.y += 0.3; this.cb.showToast('📍 点击第二个点完成箭头'); }
        else {
          const endPoint = point.clone(); endPoint.y += 0.3;
          this.annotationManager.createArrowAnnotation(this.arrowStart, endPoint); this.arrowStart = null; this.cb.showToast('✅ 箭头已添加');
        }
      } else if (this.dataStore.placementMode === 'zone') {
        const radius = parseFloat(document.getElementById('zoneRadiusInput')?.value) || 4;
        const zoneLabel = document.getElementById('zoneLabelInput')?.value || '危险区域';
        const zoneColor = parseInt(document.getElementById('zoneColorInput')?.value?.replace('#', ''), 16) || 0xef4444;
        this.annotationManager.createZoneAnnotation(point, radius, zoneColor, zoneLabel); this.cb.showToast('✅ 区域标记已添加');
      } else if (this.dataStore.placementMode === 'label') {
        const text = document.getElementById('annotationTextInput')?.value || '标记点';
        this.annotationManager.createLabelAnnotation(point, text); this.cb.showToast('✅ 标签已添加');
      }
      this.cb.updateUnitList(); return;
    }

    const unit = this.getUnitIntersect(e);
    const annotation = this.getAnnotationIntersect(e);
    if (annotation) {
      this.cb.clearAnnotationSelection();
      this.dataStore.selectedAnnotation = annotation;
      this.cb.addAnnotationSelection(annotation);
      window.currentSelectedAnnotation = annotation;
      this.cb.showAnnotationEditPanel(annotation, e.clientX, e.clientY);
    }
    else if (unit) { this.cb.clearAnnotationSelection(); this.dataStore.selectedUnit = unit; this.unitManager.addSelectionVisual(unit); this.cb.updateTransformPanel(); this.cb.hideAnnotationEditPanel(); }
    else { this.cb.clearAnnotationSelection(); this.unitManager.clearSelectionVisuals(); this.dataStore.selectedUnit = null; this.cb.updateTransformPanel(); this.cb.hideAnnotationEditPanel(); }
  }

  _onMouseDown(e) {
    if (this.phaseManager.animating || this.dataStore.placementMode) return;
    const unit = this.getUnitIntersect(e);
    if (unit) { this.isDragging = true; this.dragTarget = unit; this.sceneManager.getControls().enabled = false; }
  }

  _onMouseUp() {
    if (this.isDragging) { this.isDragging = false; this.dragTarget = null; this.sceneManager.getControls().enabled = true; }
  }

  _onCanvasMouseMove(e) {
    if (this.phaseManager.animating) return;
    if (this.isDragging && this.dragTarget) {
      const point = this.getGroundIntersect(e);
      if (point) {
        const halfW = this.sceneManager.groundWidth / 2 - 1, halfH = this.sceneManager.groundHeight / 2 - 1;
        this.dragTarget.position.x = Math.max(-halfW, Math.min(halfW, point.x));
        this.dragTarget.position.z = Math.max(-halfH, Math.min(halfH, point.z));
        const currentY = this.dragTarget.position.y;
        const isInsideModel = currentY > this.modelManager.clipModelMinY && currentY < this.modelManager.clipModelMaxY;
        if (isInsideModel) {
          this.dragTarget.position.y = point.y;
        } else {
          this.dragTarget.position.y = this.modelManager.getModelSurfaceHeight(this.dragTarget.position.x, this.dragTarget.position.z);
        }
        this.unitManager.updateUnitSprite(this.dragTarget);
        if (this.dragTarget === this.dataStore.selectedUnit) {
          document.getElementById('posX').value = this.dragTarget.position.x.toFixed(2);
          document.getElementById('posY').value = this.dragTarget.position.y.toFixed(2);
          document.getElementById('posZ').value = this.dragTarget.position.z.toFixed(2);
        }
      }
      return;
    }
    const unit = this.getUnitIntersect(e);
    const annotation = this.getAnnotationIntersect(e);
    if (unit !== this.dataStore.hoveredUnit) {
      if (this.dataStore.hoveredUnit && this.dataStore.hoveredUnit !== this.dataStore.selectedUnit) {
        this.dataStore.hoveredUnit.traverse(c => { if (c.isMesh && c.material.emissiveIntensity !== undefined) c.material.emissiveIntensity = c.material.userData?.origEmissive || 0.15; });
      }
      this.dataStore.hoveredUnit = unit;
      if (this.dataStore.hoveredUnit) {
        this.dataStore.hoveredUnit.traverse(c => {
          if (c.isMesh && c.material.emissiveIntensity !== undefined) {
            c.material.userData = c.material.userData || {};
            c.material.userData.origEmissive = c.material.emissiveIntensity;
            c.material.emissiveIntensity = 0.6;
          }
        });
        this.sceneManager.getRenderer().domElement.style.cursor = 'grab';
      }
    }
    if (annotation !== this.dataStore.hoveredAnnotation) {
      if (this.dataStore.hoveredAnnotation && this.dataStore.hoveredAnnotation !== this.dataStore.selectedAnnotation) {
        this.dataStore.hoveredAnnotation.traverse(c => { if (c.isMesh && c.material.opacity !== undefined && c.material.userData?.origOpacity !== undefined) c.material.opacity = c.material.userData.origOpacity; });
      }
      this.dataStore.hoveredAnnotation = annotation;
      if (this.dataStore.hoveredAnnotation) {
        this.dataStore.hoveredAnnotation.traverse(c => {
          if (c.isMesh && c.material.opacity !== undefined) {
            c.material.userData = c.material.userData || {};
            c.material.userData.origOpacity = c.material.opacity;
            c.material.opacity = 1;
          }
        });
        this.sceneManager.getRenderer().domElement.style.cursor = 'pointer';
      } else if (!this.dataStore.hoveredUnit) {
        this.sceneManager.getRenderer().domElement.style.cursor = this.dataStore.placementMode ? 'crosshair' : 'default';
      }
    }
  }

  // --- Keyboard Handlers ---

  _onKeyDown(e) {
    if (e.target.closest('input')) return;
    const key = e.key.toLowerCase();
    if (key === 'w' || key === 'arrowup') this.sceneManager.keys.w = true;
    if (key === 's' || key === 'arrowdown') this.sceneManager.keys.s = true;
    if (key === 'a' || key === 'arrowleft') this.sceneManager.keys.a = true;
    if (key === 'd' || key === 'arrowright') this.sceneManager.keys.d = true;
    if (key === 'q') this.sceneManager.keys.q = true;
    if (key === 'e') this.sceneManager.keys.e = true;
    if (key === 'shift') this.sceneManager.keys.shift = true;
    if (key === 'f') this.cb.toggleFreeRoamMode();
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.dataStore.selectedAnnotation && !e.target.closest('input')) {
        this.annotationManager.deleteAnnotation(this.dataStore.selectedAnnotation);
        this.cb.showToast('🗑️ 标注已删除'); this.cb.updateAnnotCount();
      } else if (this.dataStore.selectedUnit && !e.target.closest('input')) {
        this.unitManager.deleteUnit(this.dataStore.selectedUnit);
        this.cb.showToast('🗑️ 单位已删除'); this.cb.updateUnitList(); this.cb.updateTransformPanel();
      }
    }
    if (e.key === 'Escape') {
      if (this.sceneManager.freeRoamMode && this.sceneManager.isPointerLocked) { document.exitPointerLock(); return; }
      this.dataStore.placementMode = null; this.arrowStart = null; this.dataStore.selectedUnit = null; this.dataStore.selectedAnnotation = null;
      this.unitManager.clearSelectionVisuals(); this.cb.clearAnnotationSelection(); this.cb.updateToolbarSelection(); this.cb.updateTransformPanel();
      this.cb.hideAnnotationEditPanel();
    }
  }

  _onKeyUp(e) {
    const key = e.key.toLowerCase();
    if (key === 'w' || key === 'arrowup') this.sceneManager.keys.w = false;
    if (key === 's' || key === 'arrowdown') this.sceneManager.keys.s = false;
    if (key === 'a' || key === 'arrowleft') this.sceneManager.keys.a = false;
    if (key === 'd' || key === 'arrowright') this.sceneManager.keys.d = false;
    if (key === 'q') this.sceneManager.keys.q = false;
    if (key === 'e') this.sceneManager.keys.e = false;
    if (key === 'shift') this.sceneManager.keys.shift = false;
  }

  // --- Resize ---

  _onResize() {
    this.sceneManager.onResize();
  }
}
