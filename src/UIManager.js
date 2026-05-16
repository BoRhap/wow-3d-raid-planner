// src/UIManager.js
import * as THREE from 'three';
import { UNIT_CATEGORIES } from './Constants.js';

export class UIManager {
  constructor(deps) {
    this.dataStore = deps.dataStore;
    this.sceneManager = deps.sceneManager;
    this.unitManager = deps.unitManager;
    this.annotationManager = deps.annotationManager;
    this.phaseManager = deps.phaseManager;
    this.viewpointManager = deps.viewpointManager;
    this.modelManager = deps.modelManager;
    this.clipPlaneManager = deps.clipPlaneManager;
    this.interactionManager = deps.interactionManager;

    this.sidebarCollapsed = false;
    this.navSections = {
      scenes: { open: true, active: true },
      view: { open: false, active: false },
      viewpoints: { open: false, active: false },
      units: { open: false, active: false },
      annotate: { open: false, active: false }
    };
    this.toastTimeout = null;
    this.draggedViewpoint = null;
    this.currentActiveTool = null;

    // Expose for inline HTML onclick handlers
    window.applyAnnotationEdit = (type) => this.applyAnnotationEdit(type);
    window.setEditColor = (color, type) => this.setEditColor(color, type);
  }

  // ═══════════════════════════════════════════════════════════════
  //  ANNOTATION EDIT PANEL
  // ═══════════════════════════════════════════════════════════════

  showAnnotationEditPanel(annotation, screenX, screenY) {
    const panel = document.getElementById('annotationEditPanel');
    const content = document.getElementById('editPanelContent');
    if (!panel || !content) return;

    const type = annotation.userData.annotationType;
    let html = '';
    const quickColors = ['#ef4444', '#f97316', '#fbbf24', '#22c55e', '#3b82f6', '#a855f7', '#ffffff', '#6b7280'];
    const quickColorsHtml = quickColors.map(c => `<span class="quick-color-btn" style="background:${c};" data-color="${c}" onclick="setEditColor('${c}', '${type}')"></span>`).join('');

    if (type === 'arrow') {
      const currentColor = '#' + (annotation.userData.color || 0xfbbf24).toString(16).padStart(6, '0');
      html = `<div class="edit-panel-row"><label>颜色</label><input type="color" id="editArrowColor" value="${currentColor}"></div>`;
      html += `<div class="edit-panel-row quick-colors">${quickColorsHtml}</div>`;
      html += `<div class="edit-panel-row"><button class="edit-btn" onclick="applyAnnotationEdit('arrow')">确认</button></div>`;
      annotation.userData.currentEditColor = annotation.userData.color || 0xfbbf24;
    } else if (type === 'zone') {
      const currentColor = '#' + (annotation.userData.color || 0xef4444).toString(16).padStart(6, '0');
      html = `<div class="edit-panel-row"><label>颜色</label><input type="color" id="editZoneColor" value="${currentColor}"></div>`;
      html += `<div class="edit-panel-row quick-colors">${quickColorsHtml}</div>`;
      html += `<div class="edit-panel-row"><button class="edit-btn" onclick="applyAnnotationEdit('zone')">确认</button></div>`;
      annotation.userData.currentEditColor = annotation.userData.color || 0xef4444;
    } else if (type === 'label') {
      const currentText = annotation.userData.text || '';
      html = `<div class="edit-panel-row"><label>文字</label><input type="text" id="editLabelText" value="${currentText}"></div>`;
      html += `<div class="edit-panel-row"><button class="edit-btn" onclick="applyAnnotationEdit('label')">确认</button></div>`;
    }

    content.innerHTML = html;
    panel.style.display = 'block';
    panel.style.left = (screenX + 10) + 'px';
    panel.style.top = (screenY + 10) + 'px';
  }

  hideAnnotationEditPanel() {
    const panel = document.getElementById('annotationEditPanel');
    if (panel) panel.style.display = 'none';
  }

  applyAnnotationEdit(type) {
    const annotation = window.currentSelectedAnnotation;
    if (!annotation) return;

    if (type === 'arrow') {
      const colorInput = document.getElementById('editArrowColor');
      if (colorInput) {
        const newColor = parseInt(colorInput.value.replace('#', ''), 16);
        annotation.userData.color = newColor;
        annotation.children.forEach(child => {
          if (child.material && child.material.color !== undefined) {
            if (child.material.color) child.material.color.setHex(newColor);
          }
        });
      }
    } else if (type === 'zone') {
      const colorInput = document.getElementById('editZoneColor');
      if (colorInput) {
        const newColor = parseInt(colorInput.value.replace('#', ''), 16);
        annotation.userData.color = newColor;
        annotation.children.forEach(child => {
          if (child.material && child.material.color !== undefined) {
            if (child.material.color) child.material.color.setHex(newColor);
          }
        });
        // Update label sprite color if exists
        const sprite = annotation.children.find(c => c.isSprite);
        if (sprite && sprite.material && sprite.material.map) {
          annotation.remove(sprite);
          const newSprite = this.unitManager.createTextSprite(annotation.userData.label || '', newColor);
          newSprite.position.set(annotation.userData.center.x, annotation.userData.center.y + 0.3, annotation.userData.center.z);
          newSprite.scale.set(0.6, 0.15, 1);
          annotation.add(newSprite);
        }
      }
    } else if (type === 'label') {
      const textInput = document.getElementById('editLabelText');
      if (textInput) {
        const newText = textInput.value;
        annotation.userData.text = newText;
        // Remove old sprite and create new one
        const oldSprite = annotation.children.find(c => c.isSprite);
        if (oldSprite) annotation.remove(oldSprite);
        const newSprite = this.unitManager.createTextSprite('📌 ' + newText, '#ffffff');
        newSprite.position.set(annotation.userData.pos.x, annotation.userData.pos.y + 0.3, annotation.userData.pos.z);
        newSprite.scale.set(0.9, 0.22, 1);
        annotation.add(newSprite);
      }
    }

    this.hideAnnotationEditPanel();
  }

  setEditColor(color, type) {
    if (type === 'arrow') {
      const input = document.getElementById('editArrowColor');
      if (input) input.value = color;
    } else if (type === 'zone') {
      const input = document.getElementById('editZoneColor');
      if (input) input.value = color;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  SAVE / LOAD
  // ═══════════════════════════════════════════════════════════════

  saveCurrentState() {
    this.dataStore.savePhaseState(this.unitManager.meshes, this.annotationManager.meshes);
  }

  clearSceneObjects() {
    this.phaseManager.clearSceneObjects();
  }

  loadPhaseState(phase) {
    this.phaseManager.loadPhaseState(phase);
  }

  // ═══════════════════════════════════════════════════════════════
  //  SCENE IMPORT / EXPORT
  // ═══════════════════════════════════════════════════════════════

  saveSceneToJson(sceneId) {
    this.saveCurrentState();
    const jsonData = this.dataStore.exportSceneJSON(sceneId);
    if (!jsonData) { this.showToast('❌ 场景不存在'); return; }
    const sd = this.dataStore.sceneDataStore[sceneId];
    const sceneName = sd.name || '未命名场景';
    const date = new Date().toLocaleDateString('zh-CN').replace(/\//g, '-');
    const filename = `场景_${sceneName}_${date}.json`;
    this.downloadJson(jsonData, filename);
    this.showToast(`✅ 已导出场景: ${sceneName}`);
  }

  loadSceneFromJson(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data || !data.phases || !Array.isArray(data.phases)) {
          this.showToast('❌ 无效的场景文件'); return;
        }
        const existingScene = this.dataStore.sceneDataStore[this.dataStore.currentSceneId];
        const mode = existingScene && existingScene.phases[0]?.units?.length > 0
          ? confirm('当前场景已有数据。\n确定要覆盖吗？')
          : true;
        if (!mode) return;
        this.importSceneData(this.dataStore.currentSceneId, data);
        this.showToast(`✅ 已导入场景: ${data.name || '未命名'}`);
      } catch (err) {
        console.error('Load error:', err); this.showToast('❌ 场景文件加载失败');
      }
    };
    reader.readAsText(file);
  }

  importSceneData(sceneId, data) {
    const existingModel = this.dataStore.sceneDataStore[sceneId]?.model;
    this.dataStore.importSceneJSON(JSON.stringify(data), sceneId, existingModel);
    const sd = this.dataStore.sceneDataStore[sceneId];
    sd.name = data.name || '导入场景';
    sd.phases = data.phases.map((p, i) => ({
      name: p.name || `P${i + 1}`,
      units: p.units || [],
      annotations: p.annotations || []
    }));
    sd.currentPhase = data.currentPhase || 0;
    sd.modelBounds = data.modelBounds || null;
    sd.viewpointGroups = data.viewpointGroups || [{ id: 'vp_default', name: '📌 常用视角', collapsed: false, viewpoints: [] }];
    if (this.dataStore.sceneGroups.every(g => g.id !== 'imported')) {
      const hasScene = this.dataStore.sceneGroups.some(g => g.scenes.some(s => s.id === sceneId));
      if (!hasScene) {
        const group = this.dataStore.sceneGroups.find(g => g.id === 'raid1') || this.dataStore.sceneGroups[0];
        group.scenes.push({ id: sceneId, name: data.name || '导入场景' });
      }
    }
    this.renderSceneSelector();
    this.renderViewpointSelector();
    if (sceneId === this.dataStore.currentSceneId) {
      this.dataStore.currentPhase = this.dataStore.sceneDataStore[sceneId].currentPhase || 0;
      this.applySceneModel(this.dataStore.sceneDataStore[sceneId], () => {
        this.loadPhaseState(this.dataStore.sceneDataStore[sceneId].phases[this.dataStore.currentPhase]);
        this.renderPhaseBar();
        this.updateUnitList();
      });
    }
  }

  applySceneModel(sd, onReady) {
    const currentModel = this.modelManager.getCurrentModel();
    if (currentModel) { this.sceneManager.getScene().remove(currentModel); }
    if (sd.model) {
      this.modelManager.loadModelIntoScene(sd.model, () => {
        this.clipPlaneManager.setHeight(this.modelManager.clipModelMaxY + 1);
        this.updateClipSliderRange();
        if (onReady) onReady();
      });
    } else {
      this.sceneManager.createGround(60, 60);
      this.sceneManager.getCamera().position.set(0, 80, 60);
      this.sceneManager.getCamera().lookAt(0, 0, 0);
      this.sceneManager.getControls().target.set(0, 0, 0);
      this.sceneManager.getControls().update();
      if (onReady) onReady();
    }
  }

  switchScene(sceneId) {
    if (sceneId === this.dataStore.currentSceneId || this.phaseManager.animating) return;
    this.saveCurrentState();
    this.dataStore.currentSceneId = sceneId;
    const sd = this.dataStore.getCurrentSceneData();
    if (!sd) return;
    this.dataStore.currentPhase = sd.currentPhase || 0;
    this.applySceneModel(sd, () => {
      this.loadPhaseState(sd.phases[this.dataStore.currentPhase]);
      this.renderPhaseBar();
      this.renderSceneSelector();
      this.renderViewpointSelector();
      this.updateUnitList();
      this.showToast(`🗺️ 已切换到: ${sd.name}`);
    });
  }

  switchPhase(newIdx, withAnimation = true) {
    this.phaseManager.switchPhase(newIdx, withAnimation, () => {
      this.renderPhaseBar();
      this.updateUnitList();
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  MODEL UPLOAD
  // ═══════════════════════════════════════════════════════════════

  async handleModelUpload(files, targetGroupId) {
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!['fbx', 'glb', 'gltf'].includes(ext)) { this.showToast(`⚠️ 不支持的格式: .${ext}`); continue; }
      const dataUrl = await new Promise(r => { const rd = new FileReader(); rd.onload = e => r(e.target.result); rd.readAsDataURL(file); });
      const sceneId = `scene_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const sceneName = file.name.replace(/\.[^.]+$/, '');
      const type = (ext === 'glb' || ext === 'gltf') ? 'glb' : 'fbx';
      this.dataStore.initSceneData(sceneId, sceneName, { dataUrl, fileName: file.name, type });
      let group = this.dataStore.sceneGroups.find(g => g.id === targetGroupId) || this.dataStore.sceneGroups[0];
      group.scenes.push({ id: sceneId, name: sceneName }); group.collapsed = false;
      this.renderSceneSelector(); this.showToast(`✅ 已添加模型场景: ${sceneName}`);
    }
  }

  async handleSingleModelUpload(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['fbx', 'glb', 'gltf'].includes(ext)) { this.showToast(`⚠️ 不支持的格式: .${ext}`); return; }
    const dataUrl = await new Promise(r => { const rd = new FileReader(); rd.onload = e => r(e.target.result); rd.readAsDataURL(file); });
    const type = (ext === 'glb' || ext === 'gltf') ? 'glb' : 'fbx';
    const sd = this.dataStore.getCurrentSceneData();
    sd.model = { dataUrl, fileName: file.name, type };
    this.applySceneModel(sd, () => {
      this.renderSceneSelector();
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  CLIP PLANE
  // ═══════════════════════════════════════════════════════════════

  updateClipSliderRange() {
    const range = this.clipPlaneManager.updateRange();
    const slider = document.getElementById('clipHeightSlider'); if (!slider) return;
    slider.min = range.min; slider.max = range.max;
    slider.step = ((range.max - range.min) / 200).toFixed(3); slider.value = this.clipPlaneManager.height;
    const valEl = document.getElementById('clipHeightValue'); if (valEl) valEl.textContent = this.clipPlaneManager.height.toFixed(1);
    const rangeEl = document.getElementById('clipRangeInfo'); if (rangeEl) rangeEl.textContent = `${this.modelManager.clipModelMinY.toFixed(1)} ~ ${this.modelManager.clipModelMaxY.toFixed(1)}`;
  }

  setBrightness(val) {
    this.sceneManager.setBrightness(val);
    const el = document.getElementById('brightnessValue'); if (el) el.textContent = Math.round(val * 100) + '%';
  }

  toggleFreeRoamMode() {
    const activated = this.sceneManager.toggleFreeRoam();
    if (activated) {
      this.showToast('🎮 漫游模式 — WS前后·AD左右 / QE升降 / Shift加速');
      this.sceneManager.getRenderer().domElement.requestPointerLock(); this.setActiveTool('roam');
    } else {
      const dir = new THREE.Vector3(); this.sceneManager.getCamera().getWorldDirection(dir);
      this.sceneManager.getControls().target.copy(this.sceneManager.getCamera().position).add(dir.multiplyScalar(20));
      this.sceneManager.getControls().update(); this.showToast('🖱️ 轨道视角模式'); this.setActiveTool(null);
    }
    const btn = document.getElementById('freeRoamBtn');
    if (btn) btn.classList.toggle('active', this.sceneManager.freeRoamMode);
  }

  addAnnotationSelection(annotation) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.5, 32),
      new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; ring.name = 'annotSelectionRing'; annotation.add(ring);
  }

  clearAnnotationSelection() {
    this.annotationManager.meshes.forEach(a => { const ring = a.getObjectByName('annotSelectionRing'); if (ring) a.remove(ring); });
  }

  setActiveTool(toolId) {
    this.currentActiveTool = toolId;
    document.querySelectorAll('.nav-tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === toolId);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  BUILD UI
  // ═══════════════════════════════════════════════════════════════

  buildUI() {
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { overflow: hidden; font-family: 'Inter', sans-serif; }

      #sidebar { position: fixed; left: 0; top: 0; bottom: 0; z-index: 200; display: flex; transition: width 0.3s cubic-bezier(.4,0,.2,1); }
      #sidebar.collapsed { width: 52px !important; }
      #sidebar.collapsed #sidebar-content { width: 0; opacity: 0; overflow: hidden; pointer-events: none; }

      #sidebar-rail {
        width: 52px; min-width: 52px; background: rgba(6,8,14,0.97);
        border-right: 1px solid rgba(168,85,247,0.12);
        display: flex; flex-direction: column; align-items: center;
        padding: 8px 0; gap: 2px; z-index: 2;
      }
      .rail-logo {
        width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
        font-size: 20px; margin-bottom: 8px; cursor: pointer;
        border-radius: 10px; background: rgba(168,85,247,0.12);
        border: 1px solid rgba(168,85,247,0.2); transition: all 0.2s;
      }
      .rail-logo:hover { background: rgba(168,85,247,0.25); transform: scale(1.05); }
      .rail-divider { width: 28px; height: 1px; background: rgba(168,85,247,0.1); margin: 4px 0; }
      .rail-icon {
        width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
        font-size: 18px; border-radius: 10px; cursor: pointer; transition: all 0.15s;
        position: relative; color: #64748b; border: 1px solid transparent;
      }
      .rail-icon:hover { background: rgba(168,85,247,0.1); color: #c4b5fd; }
      .rail-icon.active { background: rgba(168,85,247,0.18); color: #a855f7; border-color: rgba(168,85,247,0.3); }
      .rail-tooltip {
        position: absolute; left: 54px; top: 50%; transform: translateY(-50%);
        background: rgba(15,18,28,0.96); color: #e2e8f0; font-size: 11px; font-weight: 600;
        padding: 5px 10px; border-radius: 6px; white-space: nowrap; pointer-events: none;
        opacity: 0; transition: opacity 0.15s; z-index: 300; border: 1px solid rgba(168,85,247,0.2);
      }
      .rail-icon:hover .rail-tooltip { opacity: 1; }

      #sidebar-content {
        width: 280px; background: rgba(10,14,23,0.95);
        border-right: 1px solid rgba(168,85,247,0.12);
        display: flex; flex-direction: column;
        transition: width 0.3s cubic-bezier(.4,0,.2,1), opacity 0.2s;
        overflow: hidden; backdrop-filter: blur(20px);
      }
      .sidebar-header {
        padding: 14px 16px 10px; display: flex; align-items: center; justify-content: space-between;
        border-bottom: 1px solid rgba(168,85,247,0.1);
      }
      .sidebar-header-title {
        font-size: 13px; font-weight: 700; color: #e2e8f0;
        display: flex; align-items: center; gap: 8px;
      }
      .sidebar-header-title .icon { font-size: 16px; }
      .sidebar-body {
        flex: 1; overflow-y: auto; padding: 6px 0;
        scrollbar-width: thin; scrollbar-color: rgba(168,85,247,0.2) transparent;
      }
      .sidebar-body::-webkit-scrollbar { width: 4px; }
      .sidebar-body::-webkit-scrollbar-thumb { background: rgba(168,85,247,0.2); border-radius: 4px; }

      .nav-section { margin-bottom: 2px; }
      .nav-section-header {
        display: flex; align-items: center; gap: 8px;
        padding: 9px 14px; cursor: pointer; user-select: none;
        transition: background 0.15s; border-left: 3px solid transparent;
      }
      .nav-section-header:hover { background: rgba(168,85,247,0.05); }
      .nav-section-header.active { border-left-color: #a855f7; background: rgba(168,85,247,0.06); }
      .nav-section-header .sec-icon { width: 28px; height: 28px; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-size: 14px; background: rgba(100,116,139,0.1); transition: all 0.2s; flex-shrink: 0; }
      .nav-section-header.active .sec-icon { background: rgba(168,85,247,0.15); }
      .nav-section-header .sec-label { flex: 1; font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; transition: color 0.15s; }
      .nav-section-header.active .sec-label { color: #c4b5fd; }
      .nav-section-header .sec-chevron { font-size: 9px; color: #475569; transition: transform 0.25s cubic-bezier(.4,0,.2,1); flex-shrink: 0; }
      .nav-section-header.open .sec-chevron { transform: rotate(90deg); }
      .nav-section-header .sec-count { font-size: 9px; color: #475569; background: rgba(100,116,139,0.12); padding: 1px 6px; border-radius: 8px; font-weight: 600; flex-shrink: 0; }

      .nav-section-body { max-height: 0; overflow: hidden; transition: max-height 0.3s cubic-bezier(.4,0,.2,1), padding 0.2s; padding: 0 10px; }
      .nav-section-body.open { max-height: 3000px; padding: 6px 10px 10px; }

      .nav-tool-btn {
        display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 10px; margin-bottom: 2px;
        background: transparent; border: 1px solid transparent; border-radius: 7px;
        color: #94a3b8; font-size: 12px; font-weight: 500;
        font-family: 'Inter', sans-serif; cursor: pointer; transition: all 0.15s; position: relative;
      }
      .nav-tool-btn:hover { background: rgba(168,85,247,0.08); border-color: rgba(168,85,247,0.12); color: #e2e8f0; }
      .nav-tool-btn.active {
        background: rgba(168,85,247,0.15); border-color: rgba(168,85,247,0.3); color: #e2e8f0; font-weight: 600;
      }
      .nav-tool-btn.active::before {
        content: ''; position: absolute; left: -2px; top: 50%; transform: translateY(-50%);
        width: 3px; height: 16px; border-radius: 2px; background: #a855f7;
      }
      .nav-tool-btn .t-icon { font-size: 15px; width: 22px; text-align: center; flex-shrink: 0; }
      .nav-tool-btn .t-label { flex: 1; text-align: left; }
      .nav-tool-btn .t-badge {
        font-size: 9px; padding: 1px 6px; border-radius: 6px;
        background: rgba(168,85,247,0.12); color: #a78bfa; font-weight: 600;
      }
      .nav-tool-btn .t-status { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; transition: background 0.2s; }
      .nav-tool-btn.active .t-status { background: #22c55e !important; }

      .nav-control-group {
        padding: 6px 8px; margin: 4px 0; border-radius: 8px;
        background: rgba(30,36,51,0.4); border: 1px solid rgba(100,116,139,0.08);
      }
      .nav-control-label {
        font-size: 10px; font-weight: 600; color: #64748b; text-transform: uppercase;
        letter-spacing: 0.5px; margin-bottom: 5px; display: flex; align-items: center; justify-content: space-between;
      }
      .nav-control-label .val { color: #c4b5fd; font-weight: 700; text-transform: none; letter-spacing: 0; }

      .nav-slider-row { display: flex; align-items: center; gap: 6px; }
      .nav-slider-row .sl { font-size: 10px; color: #475569; flex-shrink: 0; }
      .nav-slider-row input[type=range] { flex: 1; -webkit-appearance: none; height: 3px; border-radius: 2px; background: rgba(168,85,247,0.15); outline: none; }
      .nav-slider-row input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%; background: #a855f7; border: 2px solid rgba(10,14,23,0.8); cursor: pointer; }

      .nav-presets { display: flex; gap: 3px; margin-top: 5px; }
      .nav-preset-btn {
        flex: 1; padding: 4px 2px; border-radius: 5px;
        border: 1px solid rgba(168,85,247,0.15); background: rgba(168,85,247,0.05);
        color: #94a3b8; font-size: 10px; font-weight: 600;
        font-family: 'Inter', sans-serif; cursor: pointer; transition: all 0.12s; text-align: center;
      }
      .nav-preset-btn:hover { background: rgba(168,85,247,0.15); color: #e2e8f0; border-color: rgba(168,85,247,0.3); }

      .nav-input {
        width: 100%; padding: 5px 8px;
        background: rgba(20,24,36,0.8); border: 1px solid rgba(100,116,139,0.15);
        border-radius: 5px; color: #e2e8f0; font-size: 11px;
        font-family: 'Inter', sans-serif; outline: none; transition: border-color 0.15s;
      }
      .nav-input:focus { border-color: rgba(168,85,247,0.4); }

      .nav-upload-zone {
        border: 1.5px dashed rgba(168,85,247,0.2); border-radius: 7px;
        padding: 8px; text-align: center; cursor: pointer; transition: all 0.2s; margin: 4px 0;
      }
      .nav-upload-zone:hover { border-color: rgba(168,85,247,0.4); background: rgba(168,85,247,0.03); }
      .nav-upload-zone.dragover { border-color: #a855f7; background: rgba(168,85,247,0.08); }

      .nav-action-row { display: flex; gap: 4px; margin-top: 6px; }
      .nav-action-btn {
        flex: 1; padding: 5px 8px; border-radius: 5px;
        border: 1px solid rgba(168,85,247,0.2); background: rgba(168,85,247,0.08);
        color: #a78bfa; font-size: 11px; font-weight: 600;
        font-family: 'Inter', sans-serif; cursor: pointer; transition: all 0.12s; text-align: center;
      }
      .nav-action-btn:hover { background: rgba(168,85,247,0.2); color: #fff; }
      .nav-action-btn.danger { border-color: rgba(239,68,68,0.2); background: rgba(239,68,68,0.08); color: #fca5a5; }
      .nav-action-btn.danger:hover { background: rgba(239,68,68,0.2); color: #fff; }

      .nav-sep { height: 1px; background: rgba(100,116,139,0.08); margin: 4px 0; }

      /* ─── UNIT GROUP TABS ─── */
      .unit-group-tabs {
        display: flex; gap: 2px; margin-bottom: 6px; background: rgba(20,24,36,0.5);
        border-radius: 6px; padding: 2px; border: 1px solid rgba(100,116,139,0.08);
      }
      .unit-group-tab {
        flex: 1; padding: 5px 4px; border-radius: 5px; border: none;
        background: transparent; color: #64748b; font-size: 10px; font-weight: 600;
        font-family: 'Inter', sans-serif; cursor: pointer; transition: all 0.15s; text-align: center;
      }
      .unit-group-tab:hover { color: #94a3b8; }
      .unit-group-tab.active { background: rgba(168,85,247,0.2); color: #c4b5fd; }

      .unit-sub-tabs {
        display: flex; gap: 2px; margin-bottom: 4px; margin-top: 2px;
      }
      .unit-sub-tab {
        flex: 1; padding: 3px 4px; border-radius: 4px;
        border: 1px solid rgba(100,116,139,0.1); background: transparent;
        color: #64748b; font-size: 9px; font-weight: 600;
        font-family: 'Inter', sans-serif; cursor: pointer; transition: all 0.12s;
        text-align: center; white-space: nowrap;
      }
      .unit-sub-tab:hover { color: #94a3b8; border-color: rgba(168,85,247,0.15); }
      .unit-sub-tab.active { background: rgba(168,85,247,0.12); color: #a78bfa; border-color: rgba(168,85,247,0.25); }

      .unit-category-label {
        font-size: 9px; font-weight: 700; color: #475569; text-transform: uppercase;
        letter-spacing: 0.6px; padding: 4px 4px 2px; display: flex; align-items: center; gap: 4px;
      }
      .unit-category-label .cat-dot {
        width: 5px; height: 5px; border-radius: 50%;
      }

      .unit-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 3px; margin-bottom: 4px;
      }
      .unit-card {
        display: flex; align-items: center; gap: 5px;
        padding: 5px 6px; border-radius: 6px;
        border: 1px solid rgba(100,116,139,0.08); background: rgba(20,24,36,0.3);
        cursor: pointer; transition: all 0.15s; position: relative;
      }
      .unit-card:hover { background: rgba(168,85,247,0.08); border-color: rgba(168,85,247,0.15); }
      .unit-card.active { background: rgba(168,85,247,0.18); border-color: rgba(168,85,247,0.35); }
      .unit-card.active::after {
        content: ''; position: absolute; top: 3px; right: 3px;
        width: 5px; height: 5px; border-radius: 50%; background: #a855f7;
      }
      .unit-card .uc-icon { font-size: 16px; flex-shrink: 0; }
      .unit-card .uc-info { flex: 1; min-width: 0; }
      .unit-card .uc-name { font-size: 10px; font-weight: 600; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .unit-card .uc-desc { font-size: 8px; color: #475569; }
      .unit-card .uc-color {
        width: 4px; height: 18px; border-radius: 2px; flex-shrink: 0; opacity: 0.6;
      }

      .scene-group { margin-bottom: 2px; }
      .scene-group-header {
        display: flex; align-items: center; gap: 4px;
        padding: 5px 6px; cursor: pointer; border-radius: 5px;
        font-size: 11px; font-weight: 700; color: #94a3b8;
        transition: background 0.15s; user-select: none;
      }
      .scene-group-header:hover { background: rgba(168,85,247,0.06); }
      .scene-group-header .chevron { font-size: 9px; transition: transform 0.2s; display: inline-block; width: 12px; text-align: center; color: #475569; }
      .scene-group-header .chevron.open { transform: rotate(90deg); }
      .scene-group-header .grp-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .scene-group-header .count { font-size: 9px; font-weight: 500; color: #475569; background: rgba(100,116,139,0.1); padding: 1px 5px; border-radius: 8px; }
      .scene-group-header .grp-actions { display: flex; gap: 1px; }
      .scene-group-header .grp-actions button {
        width: 18px; height: 18px; border-radius: 4px; border: none;
        background: transparent; color: #475569; font-size: 10px;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        transition: all 0.12s; opacity: 0;
      }
      .scene-group-header:hover .grp-actions button { opacity: 1; }
      .scene-group-header .grp-actions button:hover { background: rgba(168,85,247,0.15); color: #e2e8f0; }

      .scene-group-body { padding-left: 4px; }
      .scene-group-body.collapsed { display: none; }

      .viewpoint-group { margin-bottom: 2px; }
      .viewpoint-group-header {
        display: flex; align-items: center; gap: 4px;
        padding: 5px 6px; cursor: pointer; border-radius: 5px;
        font-size: 11px; font-weight: 700; color: #94a3b8;
        transition: background 0.15s; user-select: none;
      }
      .viewpoint-group-header:hover { background: rgba(59,130,246,0.06); }
      .viewpoint-group-header .chevron { font-size: 9px; transition: transform 0.2s; display: inline-block; width: 12px; text-align: center; color: #475569; }
      .viewpoint-group-header .chevron.open { transform: rotate(90deg); }
      .viewpoint-group-header .grp-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .viewpoint-group-header .count { font-size: 9px; font-weight: 500; color: #475569; background: rgba(100,116,139,0.1); padding: 1px 5px; border-radius: 8px; }
      .viewpoint-group-header .grp-actions { display: flex; gap: 1px; }
      .viewpoint-group-header .grp-actions button {
        width: 18px; height: 18px; border-radius: 4px; border: none;
        background: transparent; color: #475569; font-size: 10px;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        transition: all 0.12s; opacity: 0;
      }
      .viewpoint-group-header:hover .grp-actions button { opacity: 1; }
      .viewpoint-group-header .grp-actions button:hover { background: rgba(59,130,246,0.15); color: #e2e8f0; }
      .viewpoint-group-body { padding-left: 4px; }
      .viewpoint-group-body.collapsed { display: none; }

      .viewpoint-card {
        display: flex; align-items: center; gap: 5px;
        padding: 4px 5px; border-radius: 6px; cursor: pointer;
        border: 1px solid transparent; transition: all 0.12s; margin-bottom: 1px;
      }
      .viewpoint-card:hover { background: rgba(59,130,246,0.06); border-color: rgba(59,130,246,0.1); }
      .viewpoint-card.active { background: rgba(59,130,246,0.14); border-color: rgba(59,130,246,0.3); }
      .viewpoint-card .vp-icon { font-size: 12px; flex-shrink: 0; }
      .viewpoint-card .vp-info { flex: 1; min-width: 0; }
      .viewpoint-card .vp-name { font-size: 10px; font-weight: 600; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .viewpoint-card .vp-pos { font-size: 8px; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .viewpoint-card .card-actions { display: flex; gap: 1px; flex-shrink: 0; }
      .viewpoint-card .card-actions button {
        width: 18px; height: 18px; border-radius: 3px; border: none;
        background: transparent; color: #475569; font-size: 10px;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        transition: all 0.12s; opacity: 0;
      }
      .viewpoint-card:hover .card-actions button { opacity: 1; }
      .viewpoint-card .card-actions button:hover { background: rgba(59,130,246,0.15); color: #e2e8f0; }
      .viewpoint-card.dragging { opacity: 0.5; background: rgba(59,130,246,0.2); }
      .viewpoint-card.drag-over { border-color: #3b82f6; background: rgba(59,130,246,0.1); }

      .add-viewpoint-btn {
        display: flex; align-items: center; justify-content: center; gap: 3px;
        width: 100%; padding: 3px 6px; border-radius: 5px;
        border: 1px dashed rgba(59,130,246,0.15); background: transparent;
        color: #64748b; font-size: 9px; font-weight: 600; cursor: pointer;
        transition: all 0.12s; font-family: 'Inter', sans-serif;
      }
      .add-viewpoint-btn:hover { border-color: rgba(59,130,246,0.3); color: #60a5fa; background: rgba(59,130,246,0.03); }
      .add-vp-group-btn {
        display: flex; align-items: center; justify-content: center; gap: 4px;
        width: 100%; padding: 5px 6px; border-radius: 5px; margin-top: 4px;
        border: 1px dashed rgba(100,116,139,0.2); background: transparent;
        color: #475569; font-size: 10px; font-weight: 600; cursor: pointer;
        transition: all 0.12s; font-family: 'Inter', sans-serif;
      }
      .add-vp-group-btn:hover { border-color: rgba(59,130,246,0.3); color: #60a5fa; background: rgba(59,130,246,0.03); }

      .scene-card {
        display: flex; align-items: center; gap: 5px;
        padding: 4px 5px; border-radius: 6px; cursor: pointer;
        border: 1px solid transparent; transition: all 0.12s; margin-bottom: 1px;
      }
      .scene-card:hover { background: rgba(168,85,247,0.06); border-color: rgba(168,85,247,0.1); }
      .scene-card.active { background: rgba(168,85,247,0.14); border-color: rgba(168,85,247,0.3); }
      .scene-card .thumb {
        width: 32px; height: 22px; border-radius: 3px; overflow: hidden;
        background: rgba(30,36,51,0.6); display: flex; align-items: center; justify-content: center;
        font-size: 12px; flex-shrink: 0; border: 1px solid rgba(100,116,139,0.12);
      }
      .scene-card .info { flex: 1; min-width: 0; }
      .scene-card .info .name { font-size: 10px; font-weight: 600; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .scene-card .info .meta { font-size: 8px; color: #475569; }
      .scene-card .card-actions { display: flex; gap: 1px; flex-shrink: 0; }
      .scene-card .card-actions button {
        width: 18px; height: 18px; border-radius: 3px; border: none;
        background: transparent; color: #475569; font-size: 10px;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        transition: all 0.12s; opacity: 0;
      }
      .scene-card:hover .card-actions button { opacity: 1; }
      .scene-card .card-actions button:hover { background: rgba(168,85,247,0.15); color: #e2e8f0; }

      .model-badge {
        display: inline-flex; align-items: center; gap: 2px;
        font-size: 7px; color: #22c55e; background: rgba(34,197,94,0.1);
        padding: 0px 4px; border-radius: 3px; border: 1px solid rgba(34,197,94,0.15);
      }
      .model-badge.empty { color: #475569; background: rgba(100,116,139,0.06); border-color: rgba(100,116,139,0.1); }

      .add-scene-btn {
        display: flex; align-items: center; justify-content: center; gap: 3px;
        width: 100%; padding: 3px 6px; border-radius: 5px;
        border: 1px dashed rgba(168,85,247,0.15); background: transparent;
        color: #64748b; font-size: 9px; font-weight: 600; cursor: pointer;
        transition: all 0.12s; font-family: 'Inter', sans-serif;
      }
      .add-scene-btn:hover { border-color: rgba(168,85,247,0.3); color: #a78bfa; background: rgba(168,85,247,0.03); }
      .add-group-btn {
        display: flex; align-items: center; justify-content: center; gap: 4px;
        width: 100%; padding: 5px 6px; border-radius: 5px; margin-top: 4px;
        border: 1px dashed rgba(100,116,139,0.2); background: transparent;
        color: #475569; font-size: 10px; font-weight: 600; cursor: pointer;
        transition: all 0.12s; font-family: 'Inter', sans-serif;
      }
      .add-group-btn:hover { border-color: rgba(168,85,247,0.3); color: #a78bfa; background: rgba(168,85,247,0.03); }

      .phase-btn {
        padding: 7px 16px; border-radius: 8px;
        border: 1px solid rgba(168,85,247,0.2);
        background: rgba(42,48,64,0.8); color: #94a3b8;
        font-size: 12px; font-weight: 600; font-family: 'Inter', sans-serif;
        cursor: pointer; transition: all 0.2s; min-width: 60px; text-align: center;
      }
      .phase-btn:hover { border-color: rgba(168,85,247,0.4); color: #e2e8f0; }
      .phase-btn.active { background: rgba(168,85,247,0.3); border-color: #a855f7; color: #fff; box-shadow: 0 0 12px rgba(168,85,247,0.3); }

      .action-btn {
        padding: 6px 14px; border-radius: 6px;
        border: 1px solid rgba(168,85,247,0.3); background: rgba(168,85,247,0.15);
        color: #c4b5fd; font-size: 12px; font-weight: 600;
        font-family: 'Inter', sans-serif; cursor: pointer; transition: all 0.15s;
      }
      .action-btn:hover { background: rgba(168,85,247,0.3); color: #fff; }

      .ui-panel {
        position: fixed; background: rgba(10,14,23,0.92);
        border: 1px solid rgba(168,85,247,0.25); border-radius: 12px;
        color: #e2e8f0; backdrop-filter: blur(16px); z-index: 100;
      }
      .ui-title {
        font-size: 11px; font-weight: 700; text-transform: uppercase;
        letter-spacing: 1.5px; color: #a78bfa; padding: 12px 16px 8px;
        border-bottom: 1px solid rgba(168,85,247,0.15);
      }
      .toast {
        position: fixed; bottom: 30px; left: 50%;
        transform: translateX(-50%) translateY(20px);
        background: rgba(10,14,23,0.95); border: 1px solid rgba(168,85,247,0.3);
        color: #e2e8f0; padding: 10px 24px; border-radius: 10px;
        font-size: 13px; font-weight: 500; z-index: 1000;
        opacity: 0; transition: all 0.3s; pointer-events: none; backdrop-filter: blur(12px);
      }
      .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
      @keyframes clipPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

      .zone-options, .label-options { display: none; }
      .zone-options.visible, .label-options.visible { display: block; }

      #annotationEditPanel {
        position: fixed; background: rgba(26,26,46,0.98); border: 1px solid rgba(168,85,247,0.4);
        border-radius: 10px; padding: 12px; z-index: 10000; min-width: 140px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5); backdrop-filter: blur(12px);
      }
      #annotationEditPanel .edit-panel-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
      #annotationEditPanel .edit-panel-row:last-child { margin-bottom: 0; }
      #annotationEditPanel label { color: #c4b5fd; font-size: 11px; font-weight: 600; }
      #annotationEditPanel input[type="color"] { width: 40px; height: 28px; border: none; border-radius: 4px; cursor: pointer; background: none; }
      #annotationEditPanel input[type="text"] { background: rgba(255,255,255,0.08); border: 1px solid rgba(168,85,247,0.3); border-radius: 4px; color: #e2e8f0; padding: 4px 8px; font-size: 12px; width: 100px; }
      #annotationEditPanel .edit-btn {
        background: rgba(168,85,247,0.25); border: 1px solid rgba(168,85,247,0.4); border-radius: 4px;
        color: #c4b5fd; font-size: 11px; font-weight: 600; padding: 4px 10px; cursor: pointer; transition: all 0.15s;
      }
      #annotationEditPanel .edit-btn:hover { background: rgba(168,85,247,0.4); }
      #annotationEditPanel .quick-colors { display: flex; gap: 4px; flex-wrap: wrap; }
      #annotationEditPanel .quick-color-btn { width: 20px; height: 20px; border-radius: 4px; cursor: pointer; border: 2px solid transparent; transition: all 0.15s; }
      #annotationEditPanel .quick-color-btn:hover { transform: scale(1.15); border-color: #a855f7; }
    `;
    document.head.appendChild(style);

    // ════ BUILD SIDEBAR ════
    const sidebar = document.createElement('div'); sidebar.id = 'sidebar';
    const rail = document.createElement('div'); rail.id = 'sidebar-rail';
    rail.innerHTML = `
      <div class="rail-logo" id="railToggle" title="收起/展开">⚔️</div>
      <div class="rail-divider"></div>
      <div class="rail-icon ${this.navSections.scenes.open ? 'active' : ''}" data-section="scenes">🗺️<span class="rail-tooltip">战斗场景</span></div>
      <div class="rail-icon" data-section="view">👁️<span class="rail-tooltip">视图工具</span></div>
      <div class="rail-icon" data-section="viewpoints">🎥<span class="rail-tooltip">视角管理</span></div>
      <div class="rail-icon" data-section="units">🎯<span class="rail-tooltip">单位放置</span></div>
      <div class="rail-icon" data-section="annotate">✏️<span class="rail-tooltip">标注工具</span></div>
      <div style="flex:1;"></div>
      <div class="rail-icon" id="railCollapseBtn">◀<span class="rail-tooltip">收起侧栏</span></div>`;
    sidebar.appendChild(rail);

    const content = document.createElement('div'); content.id = 'sidebar-content';
    content.innerHTML = `
      <div class="sidebar-header"><div class="sidebar-header-title"><span class="icon">⚔️</span> 战术规划工具 <span style="font-size:11px; color:#64748b; font-weight:400;">开发 by Fox</span></div></div>
      <div class="sidebar-body" id="sidebarBody">

        <!-- ═══ SECTION 1: SCENES ═══ -->
        <div class="nav-section" data-section="scenes">
          <div class="nav-section-header ${this.navSections.scenes.open ? 'open active' : ''}" data-section="scenes">
            <div class="sec-icon">🗺️</div><span class="sec-label">战斗场景</span>
            <span class="sec-count" id="sceneCount">0</span><span class="sec-chevron">▶</span>
          </div>
          <div class="nav-section-body ${this.navSections.scenes.open ? 'open' : ''}" data-section="scenes">
            <div id="sceneSelector"></div>
            <div style="display:flex; gap:6px; padding:8px 10px;">
              <button id="importSceneBtn" class="action-btn" style="flex:1; font-size:10px;">📥 导入</button>
              <button id="exportSceneBtn" class="action-btn" style="flex:1; font-size:10px;">📤 导出</button>
              <input type="file" id="sceneFileInput" accept=".json" style="display:none;" />
            </div>
            <div class="nav-sep"></div>
            <div class="nav-control-group">
              <div class="nav-control-label">当前场景模型 <span class="val" id="currentModelInfo">—</span></div>
              <div class="nav-upload-zone" id="singleUploadZone">
                <div style="font-size:14px;">🔄</div>
                <div style="font-size:9px; color:#64748b;">替换模型 (.fbx/.glb/.gltf)</div>
                <input type="file" id="singleModelUpload" accept=".fbx,.glb,.gltf" style="display:none;" />
              </div>
            </div>
            <div class="nav-sep"></div>
            <div class="nav-upload-zone" id="batchUploadZone">
              <div style="font-size:14px;">📦</div>
              <div style="font-size:9px; color:#94a3b8;">批量上传模型到此分组</div>
              <input type="file" id="batchModelUpload" accept=".fbx,.glb,.gltf" multiple style="display:none;" />
            </div>
          </div>
        </div>

        <!-- ═══ SECTION 2: VIEW ═══ -->
        <div class="nav-section" data-section="view">
          <div class="nav-section-header" data-section="view">
            <div class="sec-icon">👁️</div><span class="sec-label">视图工具</span><span class="sec-chevron">▶</span>
          </div>
          <div class="nav-section-body" data-section="view">
            <div class="nav-control-group">
              <div class="nav-control-label">场景亮度 <span class="val" id="brightnessValue">${Math.round(this.sceneManager.brightness * 100)}%</span></div>
              <div class="nav-slider-row"><span class="sl">🌙</span><input type="range" id="brightnessSlider" min="0.3" max="3.0" step="0.05" value="${this.sceneManager.brightness}" /><span class="sl">☀️</span></div>
            </div>
            <div class="nav-control-group">
              <div class="nav-control-label">快捷视角</div>
              <div class="nav-presets">
                <button class="nav-preset-btn" data-view="top">俯视</button>
                <button class="nav-preset-btn" data-view="front">正面</button>
                <button class="nav-preset-btn" data-view="side">侧面</button>
                <button class="nav-preset-btn" data-view="angle">45°</button>
              </div>
            </div>
            <button class="nav-tool-btn" id="freeRoamBtn" data-tool="roam">
              <span class="t-icon">🚶</span><span class="t-label">漫游模式</span><span class="t-status" style="background:#475569;"></span>
            </button>
            <div id="roamSpeedControl" class="nav-control-group" style="margin-left:4px;">
              <div class="nav-control-label">移动速度 <span class="val" id="roamSpeedValue">${this.sceneManager.freeRoamSpeed}</span></div>
              <div class="nav-slider-row"><span class="sl">慢</span><input type="range" id="roamSpeedSlider" min="1" max="10" step="1" value="${this.sceneManager.freeRoamSpeed}" /><span class="sl">快</span></div>
            </div>
            <div class="nav-sep"></div>
            <button class="nav-tool-btn" id="clipToggleBtn" data-tool="clip">
              <span class="t-icon">✂️</span><span class="t-label">Z轴剖切</span><span class="t-status" id="clipStatusDot" style="background:#475569;"></span>
            </button>
            <div id="clipControls" class="nav-control-group" style="display:none; margin-left:4px;">
              <div class="nav-control-label">剖切高度 <span class="val" id="clipHeightValue">${this.clipPlaneManager.height.toFixed(1)}</span></div>
              <div class="nav-slider-row"><span class="sl">底</span><input type="range" id="clipHeightSlider" min="${this.modelManager.clipModelMinY}" max="${this.modelManager.clipModelMaxY}" step="0.5" value="${this.clipPlaneManager.height}" /><span class="sl">顶</span></div>
              <div style="display:flex; align-items:center; justify-content:space-between; margin-top:3px;">
                <span style="font-size:8px; color:#3b4050;">范围: <span id="clipRangeInfo">${this.modelManager.clipModelMinY.toFixed(1)} ~ ${this.modelManager.clipModelMaxY.toFixed(1)}</span></span>
              </div>
              <div class="nav-presets">
                <button class="nav-preset-btn" id="clipQuarter">25%</button>
                <button class="nav-preset-btn" id="clipHalf">50%</button>
                <button class="nav-preset-btn" id="clipThreeQuarter">75%</button>
                <button class="nav-preset-btn" id="clipFull">100%</button>
              </div>
            </div>
            <div id="clipHeightIndicator" style="display:none; padding:2px 8px;">
              <div style="font-size:8px; color:#ef4444; display:flex; align-items:center; gap:4px;">
                <span style="width:5px; height:5px; border-radius:50%; background:#ef4444; display:inline-block; animation:clipPulse 1.5s infinite;"></span>
                剖切面已激活
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ SECTION: VIEWPOINTS ═══ -->
        <div class="nav-section" data-section="viewpoints">
          <div class="nav-section-header ${this.navSections.viewpoints.open ? 'open active' : ''}" data-section="viewpoints">
            <div class="sec-icon">🎥</div><span class="sec-label">视角管理</span>
            <span class="sec-count" id="viewpointCount">0</span><span class="sec-chevron">▶</span>
          </div>
          <div class="nav-section-body ${this.navSections.viewpoints.open ? 'open' : ''}" data-section="viewpoints">
            <div style="padding:8px 10px;">
              <button id="saveViewpointBtn" class="action-btn" style="width:100%; font-size:11px;">💾 保存当前视角</button>
            </div>
            <div class="nav-sep"></div>
            <div id="viewpointSelector"></div>
          </div>
        </div>

        <!-- ═══ SECTION 3: UNITS — LAYERED ═══ -->
        <div class="nav-section" data-section="units">
          <div class="nav-section-header" data-section="units">
            <div class="sec-icon">🎯</div><span class="sec-label">单位放置</span>
            <span class="sec-count" id="unitCount">0</span><span class="sec-chevron">▶</span>
          </div>
          <div class="nav-section-body" data-section="units">
            <div class="nav-control-group">
              <div class="nav-control-label">自定义标签</div>
              <input class="nav-input" id="unitLabelInput" placeholder="留空使用默认名称..." />
            </div>
            <div class="unit-group-tabs">
              <button class="unit-group-tab active" data-group="monsters">👹 怪物</button>
              <button class="unit-group-tab" data-group="players">⚔️ 玩家</button>
              <button class="unit-group-tab" data-group="custom">🎒 自定义</button>
            </div>
            <div id="unitGroupMonsters" class="unit-group-content">
              <div class="unit-grid" id="monsterGrid"></div>
            </div>
            <div id="unitGroupPlayers" class="unit-group-content" style="display:none;">
              <div class="unit-sub-tabs" id="playerSubTabs">
                <button class="unit-sub-tab active" data-pmode="role">角色类型</button>
                <button class="unit-sub-tab" data-pmode="class">职业类型</button>
              </div>
              <div id="playerGrid"></div>
            </div>
            <div id="unitGroupCustom" class="unit-group-content" style="display:none;">
              <div class="unit-grid" id="customGrid"></div>
            </div>
            <div class="nav-sep"></div>
            <div id="transformPanel" style="display:none;">
              <div class="nav-control-group">
                <div class="nav-control-label">🎯 变换控制</div>
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px;">
                  <span style="font-size:10px; color:#94a3b8; white-space:nowrap;">名字</span>
                  <input class="nav-input" id="unitNameInput" placeholder="点击编辑名字..." style="flex:1; padding:3px 6px; font-size:11px;" />
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:4px; margin-bottom:6px;">
                  <div style="display:flex; align-items:center; gap:2px;"><span style="font-size:10px; color:#94a3b8; width:12px;">X</span><input class="nav-input" type="number" id="posX" step="0.5" style="width:100%; padding:3px 4px; font-size:11px;" /></div>
                  <div style="display:flex; align-items:center; gap:2px;"><span style="font-size:10px; color:#94a3b8; width:12px;">Y</span><input class="nav-input" type="number" id="posY" step="0.5" style="width:100%; padding:3px 4px; font-size:11px;" /></div>
                  <div style="display:flex; align-items:center; gap:2px;"><span style="font-size:10px; color:#94a3b8; width:12px;">Z</span><input class="nav-input" type="number" id="posZ" step="0.5" style="width:100%; padding:3px 4px; font-size:11px;" /></div>
                </div>
                <div class="nav-control-sublabel" style="font-size:9px; color:#64748b; margin-bottom:4px;">位置</div>
                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:4px; margin-bottom:6px;">
                  <div style="display:flex; align-items:center; gap:2px;"><span style="font-size:10px; color:#94a3b8; width:12px;">X°</span><input class="nav-input" type="number" id="rotX" step="5" style="width:100%; padding:3px 4px; font-size:11px;" /></div>
                  <div style="display:flex; align-items:center; gap:2px;"><span style="font-size:10px; color:#94a3b8; width:12px;">Y°</span><input class="nav-input" type="number" id="rotY" step="5" style="width:100%; padding:3px 4px; font-size:11px;" /></div>
                  <div style="display:flex; align-items:center; gap:2px;"><span style="font-size:10px; color:#94a3b8; width:12px;">Z°</span><input class="nav-input" type="number" id="rotZ" step="5" style="width:100%; padding:3px 4px; font-size:11px;" /></div>
                </div>
                <div class="nav-control-sublabel" style="font-size:9px; color:#64748b; margin-bottom:4px;">旋转</div>
                <div style="display:flex; align-items:center; gap:6px;">
                  <input class="nav-input" type="number" id="scaleInput" step="0.01" min="0.02" max="5" style="width:60px; padding:3px 4px; font-size:11px;" />
                  <div class="nav-slider-row" style="flex:1;"><span class="sl" style="font-size:9px;">小</span><input type="range" id="unitScaleSlider" min="0.02" max="5" step="0.01" value="0.1" /><span class="sl" style="font-size:9px;">大</span></div>
                </div>
                <div class="nav-presets" style="margin-top:4px;">
                  <button class="nav-preset-btn" data-scale="0.05">0.05x</button>
                  <button class="nav-preset-btn" data-scale="0.1">0.1x</button>
                  <button class="nav-preset-btn" data-scale="0.2">0.2x</button>
                  <button class="nav-preset-btn" data-scale="0.5">0.5x</button>
                  <button class="nav-preset-btn" data-scale="1.0">1.0x</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ SECTION 4: ANNOTATE ═══ -->
        <div class="nav-section" data-section="annotate">
          <div class="nav-section-header" data-section="annotate">
            <div class="sec-icon">✏️</div><span class="sec-label">标注工具</span>
            <span class="sec-count" id="annotCount">0</span><span class="sec-chevron">▶</span>
          </div>
          <div class="nav-section-body" data-section="annotate">
            <button class="nav-tool-btn" data-tool="arrow"><span class="t-icon">➡️</span><span class="t-label">方向箭头</span><span class="t-badge">A</span></button>
            <button class="nav-tool-btn" data-tool="zone"><span class="t-icon">🔴</span><span class="t-label">区域标记</span><span class="t-badge">Z</span></button>
            <button class="nav-tool-btn" data-tool="label"><span class="t-icon">📌</span><span class="t-label">文字标签</span><span class="t-badge">L</span></button>
            <div class="nav-sep"></div>
            <div class="zone-options" id="zoneOptions">
              <div class="nav-control-group">
                <div class="nav-control-label">区域设置</div>
                <div style="display:flex; gap:4px; margin-bottom:3px;">
                  <input class="nav-input" id="zoneLabelInput" placeholder="标签文字" value="危险区域" style="flex:1;" />
                  <input type="color" id="zoneColorInput" value="#ef4444" style="width:28px; height:24px; border:none; border-radius:4px; cursor:pointer;" />
                </div>
                <div class="nav-slider-row"><span class="sl" style="font-size:9px;">半径</span><input type="range" id="zoneRadiusInput" min="1" max="20" step="0.5" value="4" /><span class="sl" id="zoneRadiusVal" style="font-size:9px;">4</span></div>
              </div>
            </div>
            <div class="label-options" id="labelOptions">
              <div class="nav-control-group">
                <div class="nav-control-label">标签文字</div>
                <input class="nav-input" id="annotationTextInput" placeholder="输入标签文字..." value="标记点" />
              </div>
            </div>
            <div class="nav-sep"></div>
            <div class="nav-action-row">
              <button class="nav-action-btn danger" id="clearAnnotBtn">🗑️ 清除标注</button>
              <button class="nav-action-btn danger" id="clearUnitsBtn">🗑️ 清除单位</button>
            </div>
          </div>
        </div>
      </div>`;
    sidebar.appendChild(content);
    document.body.appendChild(sidebar);

    // ════ PHASE BAR ════
    const phaseBar = document.createElement('div'); phaseBar.id = 'phaseBar';
    phaseBar.className = 'ui-panel';
    phaseBar.style.cssText = 'bottom:16px; left:50%; transform:translateX(-50%); display:flex; gap:6px; padding:10px 16px; align-items:center;';
    document.body.appendChild(phaseBar);

    // ════ RIGHT PANEL ════
    const rightPanel = document.createElement('div'); rightPanel.id = 'rightPanel';
    rightPanel.className = 'ui-panel';
    rightPanel.style.cssText = 'top:16px; right:16px; width:220px; max-height:calc(100vh - 32px); overflow-y:auto; scrollbar-width:thin; scrollbar-color:rgba(168,85,247,0.2) transparent;';
    rightPanel.innerHTML = `<div class="ui-title">📋 场景单位</div><div id="unitListContainer" style="padding:8px 10px; max-height:500px; overflow-y:auto;"></div>`;
    document.body.appendChild(rightPanel);

    // ════ TOAST ════
    const toast = document.createElement('div'); toast.id = 'toast'; toast.className = 'toast'; document.body.appendChild(toast);

    // ════ ANNOTATION EDIT PANEL ════
    const annotationEditPanel = document.createElement('div'); annotationEditPanel.id = 'annotationEditPanel'; annotationEditPanel.style.display = 'none';
    annotationEditPanel.innerHTML = '<div id="editPanelContent"></div>';
    document.body.appendChild(annotationEditPanel);

    // ════ POPULATE UNIT GRIDS ════
    this.populateUnitGrids();

    // ════ WIRE EVENTS ════
    this.wireUIEvents();

    // ════ INITIAL RENDERS ════
    this.renderSceneSelector();
    this.renderPhaseBar();
    this.updateUnitList();
    this.updateCurrentModelInfo();
  }

  // ═══════════════════════════════════════════════════════════════
  //  UNIT GRID POPULATION
  // ═══════════════════════════════════════════════════════════════

  populateUnitGrids() {
    // Monster grid
    const monsterGrid = document.getElementById('monsterGrid');
    if (monsterGrid) {
      let html = '';
      for (const [key, unit] of Object.entries(UNIT_CATEGORIES.monsters.units)) {
        const colorHex = '#' + unit.color.toString(16).padStart(6, '0');
        html += `<div class="unit-card" data-unit="${key}"><div class="uc-color" style="background:${colorHex};"></div><span class="uc-icon">${unit.icon}</span><div class="uc-info"><div class="uc-name">${unit.label}</div><div class="uc-desc">${unit.desc}</div></div></div>`;
      }
      monsterGrid.innerHTML = html;
    }
    // Player grid
    this.renderPlayerGrid();
  }

  populateCustomGrid() {
    const customGrid = document.getElementById('customGrid');
    if (!customGrid) return;

    UNIT_CATEGORIES.custom.units = { ...this.unitManager.customItemsRegistry };

    let html = '';
    for (const [key, item] of Object.entries(this.unitManager.customItemsRegistry)) {
      const colorHex = '#' + item.color.toString(16).padStart(6, '0');
      html += `<div class="unit-card" data-unit="${key}">
        <div class="uc-color" style="background:${colorHex};"></div>
        <span class="uc-icon">${item.icon}</span>
        <div class="uc-info">
          <div class="uc-name">${item.label}</div>
          <div class="uc-desc">自定义物品</div>
        </div>
      </div>`;
    }
    customGrid.innerHTML = html;

    // 绑定点击事件
    customGrid.querySelectorAll('.unit-card').forEach(card => {
      card.addEventListener('click', () => {
        const unitType = card.dataset.unit;
        const item = this.unitManager.customItemsRegistry[unitType];
        if (this.dataStore.placementMode === unitType) {
          this.dataStore.placementMode = null;
          card.classList.remove('active');
        } else {
          this.dataStore.placementMode = unitType;
          document.querySelectorAll('.unit-card').forEach(c => c.classList.remove('active'));
          document.querySelectorAll('.nav-tool-btn').forEach(b => {
            if (['arrow', 'zone', 'label'].includes(b.dataset.tool)) b.classList.remove('active');
          });
          card.classList.add('active');
          this.showToast(`🎯 放置模式: ${item.icon} ${item.label} — 点击场景放置`);
        }
        document.getElementById('zoneOptions')?.classList.remove('visible');
        document.getElementById('labelOptions')?.classList.remove('visible');
      });
    });
  }

  renderPlayerGrid() {
    const grid = document.getElementById('playerGrid');
    if (!grid) return;
    const source = this.dataStore.playerViewMode === 'role' ? UNIT_CATEGORIES.players_role : UNIT_CATEGORIES.players_class;
    let html = `<div class="unit-category-label"><span class="cat-dot" style="background:#a855f7;"></span>${source.label}</div><div class="unit-grid">`;
    for (const [key, unit] of Object.entries(source.units)) {
      const colorHex = '#' + unit.color.toString(16).padStart(6, '0');
      html += `<div class="unit-card" data-unit="${key}"><div class="uc-color" style="background:${colorHex};"></div><span class="uc-icon">${unit.icon}</span><div class="uc-info"><div class="uc-name">${unit.label}</div><div class="uc-desc">${unit.desc}</div></div></div>`;
    }
    html += '</div>';
    grid.innerHTML = html;
    // re-bind clicks
    grid.querySelectorAll('.unit-card').forEach(card => {
      card.addEventListener('click', () => {
        const unitType = card.dataset.unit;
        if (this.dataStore.placementMode === unitType) { this.dataStore.placementMode = null; card.classList.remove('active'); }
        else {
          this.dataStore.placementMode = unitType; this.interactionManager.arrowStart = null;
          document.querySelectorAll('.unit-card').forEach(c => c.classList.remove('active'));
          document.querySelectorAll('.nav-tool-btn').forEach(b => { if (['arrow','zone','label'].includes(b.dataset.tool)) b.classList.remove('active'); });
          card.classList.add('active');
          const def = this.unitManager.getUnitDef(unitType);
          this.showToast(`🎯 放置模式: ${def.icon} ${def.label} — 点击场景放置`);
        }
        document.getElementById('zoneOptions')?.classList.remove('visible');
        document.getElementById('labelOptions')?.classList.remove('visible');
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  WIRE UI EVENTS
  // ═══════════════════════════════════════════════════════════════

  wireUIEvents() {
    // ─── Rail section buttons ───
    document.querySelectorAll('#sidebar-rail .rail-icon[data-section]').forEach(icon => {
      icon.addEventListener('click', () => {
        const sec = icon.dataset.section;
        this.toggleNavSection(sec);
        if (this.sidebarCollapsed) { this.sidebarCollapsed = false; document.getElementById('sidebar').classList.remove('collapsed'); }
      });
    });

    // ─── Rail collapse ───
    document.getElementById('railCollapseBtn')?.addEventListener('click', () => {
      this.sidebarCollapsed = !this.sidebarCollapsed;
      document.getElementById('sidebar').classList.toggle('collapsed', this.sidebarCollapsed);
    });
    document.getElementById('railToggle')?.addEventListener('click', () => {
      this.sidebarCollapsed = !this.sidebarCollapsed;
      document.getElementById('sidebar').classList.toggle('collapsed', this.sidebarCollapsed);
    });

    // ─── Section headers ───
    document.querySelectorAll('.nav-section-header').forEach(header => {
      header.addEventListener('click', () => this.toggleNavSection(header.dataset.section));
    });

    // ─── Brightness slider ───
    document.getElementById('brightnessSlider')?.addEventListener('input', (e) => this.sceneManager.setBrightness(parseFloat(e.target.value)));

    // ─── View presets ───
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.sceneManager.freeRoamMode) this.toggleFreeRoamMode();
        const d = Math.max(this.sceneManager.groundWidth, this.sceneManager.groundHeight) * 0.8;
        const views = {
          top: { pos: [0, d, 0.01], target: [0, 0, 0] },
          front: { pos: [0, d * 0.4, d * 0.6], target: [0, 0, 0] },
          side: { pos: [d * 0.6, d * 0.4, 0], target: [0, 0, 0] },
          angle: { pos: [d * 0.4, d * 0.5, d * 0.4], target: [0, 0, 0] }
        };
        const v = views[btn.dataset.view];
        if (v) {
          this.sceneManager.getCamera().position.set(...v.pos);
          this.sceneManager.getControls().target.set(...v.target);
          this.sceneManager.getControls().update();
          this.showToast(`📷 ${btn.textContent}视角`);
        }
      });
    });

    // ─── Free roam ───
    document.getElementById('freeRoamBtn')?.addEventListener('click', () => this.toggleFreeRoamMode());
    document.getElementById('roamSpeedSlider')?.addEventListener('input', (e) => {
      this.sceneManager.freeRoamSpeed = parseFloat(e.target.value);
      document.getElementById('roamSpeedValue').textContent = this.sceneManager.freeRoamSpeed;
    });

    // ─── Clip plane ───
    document.getElementById('clipToggleBtn')?.addEventListener('click', () => {
      const enabled = this.clipPlaneManager.toggle();
      const dot = document.getElementById('clipStatusDot');
      if (dot) dot.style.background = enabled ? '#ef4444' : '#475569';
      const ctrl = document.getElementById('clipControls');
      if (ctrl) ctrl.style.display = enabled ? 'block' : 'none';
      document.getElementById('clipToggleBtn')?.classList.toggle('active', enabled);
      const ind = document.getElementById('clipHeightIndicator');
      if (ind) ind.style.display = enabled ? 'block' : 'none';
      this.showToast(enabled ? '✂️ 剖切面已启用' : '✂️ 剖切面已关闭');
    });
    document.getElementById('clipHeightSlider')?.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      this.clipPlaneManager.setHeight(v);
      const el = document.getElementById('clipHeightValue'); if (el) el.textContent = v.toFixed(1);
    });
    document.getElementById('clipQuarter')?.addEventListener('click', () => { const v = this.modelManager.clipModelMinY + (this.modelManager.clipModelMaxY - this.modelManager.clipModelMinY) * 0.25; this.clipPlaneManager.setHeight(v); document.getElementById('clipHeightSlider').value = v; const el = document.getElementById('clipHeightValue'); if (el) el.textContent = v.toFixed(1); });
    document.getElementById('clipHalf')?.addEventListener('click', () => { const v = this.modelManager.clipModelMinY + (this.modelManager.clipModelMaxY - this.modelManager.clipModelMinY) * 0.5; this.clipPlaneManager.setHeight(v); document.getElementById('clipHeightSlider').value = v; const el = document.getElementById('clipHeightValue'); if (el) el.textContent = v.toFixed(1); });
    document.getElementById('clipThreeQuarter')?.addEventListener('click', () => { const v = this.modelManager.clipModelMinY + (this.modelManager.clipModelMaxY - this.modelManager.clipModelMinY) * 0.75; this.clipPlaneManager.setHeight(v); document.getElementById('clipHeightSlider').value = v; const el = document.getElementById('clipHeightValue'); if (el) el.textContent = v.toFixed(1); });
    document.getElementById('clipFull')?.addEventListener('click', () => { const v = this.modelManager.clipModelMaxY + 1; this.clipPlaneManager.setHeight(v); document.getElementById('clipHeightSlider').value = v; const el = document.getElementById('clipHeightValue'); if (el) el.textContent = v.toFixed(1); });

    // ─── Viewpoint management ───
    document.getElementById('saveViewpointBtn')?.addEventListener('click', () => {
      const name = prompt('输入视角名称:', '新视角');
      if (!name) return;
      this.viewpointManager.saveViewpoint(name, 'vp_default');
      this.renderViewpointSelector();
      this.showToast(`✅ 已保存视角: ${name}`);
    });
    this.renderViewpointSelector();

    // ─── Unit group tabs ───
    document.querySelectorAll('.unit-group-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.unit-group-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const g = tab.dataset.group;
        document.getElementById('unitGroupMonsters').style.display = g === 'monsters' ? 'block' : 'none';
        document.getElementById('unitGroupPlayers').style.display = g === 'players' ? 'block' : 'none';
        document.getElementById('unitGroupCustom').style.display = g === 'custom' ? 'block' : 'none';
      });
    });

    // ─── Player sub-tabs ───
    document.querySelectorAll('.unit-sub-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.unit-sub-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.dataStore.playerViewMode = tab.dataset.pmode;
        this.renderPlayerGrid();
      });
    });

    // ─── Monster grid clicks ───
    document.querySelectorAll('#monsterGrid .unit-card').forEach(card => {
      card.addEventListener('click', () => {
        const unitType = card.dataset.unit;
        if (this.dataStore.placementMode === unitType) { this.dataStore.placementMode = null; card.classList.remove('active'); }
        else {
          this.dataStore.placementMode = unitType; this.interactionManager.arrowStart = null;
          document.querySelectorAll('.unit-card').forEach(c => c.classList.remove('active'));
          document.querySelectorAll('.nav-tool-btn').forEach(b => { if (['arrow','zone','label'].includes(b.dataset.tool)) b.classList.remove('active'); });
          card.classList.add('active');
          const def = this.unitManager.getUnitDef(unitType);
          this.showToast(`🎯 放置模式: ${def.icon} ${def.label} — 点击场景放置`);
        }
        document.getElementById('zoneOptions')?.classList.remove('visible');
        document.getElementById('labelOptions')?.classList.remove('visible');
      });
    });

    // ─── Annotation tools ───
    document.querySelectorAll('.nav-tool-btn[data-tool="arrow"], .nav-tool-btn[data-tool="zone"], .nav-tool-btn[data-tool="label"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        if (this.dataStore.placementMode === tool) {
          this.dataStore.placementMode = null; btn.classList.remove('active');
          document.getElementById('zoneOptions')?.classList.remove('visible');
          document.getElementById('labelOptions')?.classList.remove('visible');
        } else {
          this.dataStore.placementMode = tool; this.interactionManager.arrowStart = null;
          document.querySelectorAll('.unit-card').forEach(c => c.classList.remove('active'));
          document.querySelectorAll('.nav-tool-btn').forEach(b => { if (['arrow','zone','label'].includes(b.dataset.tool)) b.classList.remove('active'); });
          btn.classList.add('active');
          document.getElementById('zoneOptions')?.classList.toggle('visible', tool === 'zone');
          document.getElementById('labelOptions')?.classList.toggle('visible', tool === 'label');
          const names = { arrow: '➡️ 箭头标注', zone: '🔴 区域标记', label: '📌 文字标签' };
          this.showToast(`✏️ ${names[tool]} — 点击场景放置`);
        }
      });
    });

    // ─── Zone radius display ───
    document.getElementById('zoneRadiusInput')?.addEventListener('input', (e) => {
      const el = document.getElementById('zoneRadiusVal'); if (el) el.textContent = e.target.value;
    });

    // ─── Transform inputs ───
    ['posX', 'posY', 'posZ', 'rotX', 'rotY', 'rotZ', 'scaleInput'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => this.applyTransform());
    });
    document.getElementById('unitScaleSlider')?.addEventListener('input', (e) => {
      document.getElementById('scaleInput').value = parseFloat(e.target.value).toFixed(3);
      this.applyTransform();
    });
    document.getElementById('unitNameInput')?.addEventListener('change', (e) => {
      if (!this.dataStore.selectedUnit) return;
      const newLabel = e.target.value;
      this.dataStore.selectedUnit.userData.label = newLabel;
      // 更新独立sprite文字
      const oldSprite = this.unitManager.labelSprites.find(s => s.userData.parentUnit === this.dataStore.selectedUnit);
      if (oldSprite) {
        this.sceneManager.getScene().remove(oldSprite);
        const idx = this.unitManager.labelSprites.indexOf(oldSprite);
        if (idx > -1) this.unitManager.labelSprites.splice(idx, 1);
        const def = this.unitManager.getUnitDef(this.dataStore.selectedUnit.userData.type);
        const newSprite = this.unitManager.createTextSprite(newLabel || def.label, def.color);
        const spriteY = 0.5;
        newSprite.position.set(this.dataStore.selectedUnit.position.x, this.dataStore.selectedUnit.position.y + spriteY, this.dataStore.selectedUnit.position.z);
        newSprite.userData.parentUnit = this.dataStore.selectedUnit;
        newSprite.userData.offsetY = spriteY;
        this.sceneManager.getScene().add(newSprite);
        this.unitManager.labelSprites.push(newSprite);
      }
      this.updateUnitList();
    });
    document.querySelectorAll('[data-scale]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseFloat(btn.dataset.scale);
        document.getElementById('scaleInput').value = val;
        document.getElementById('unitScaleSlider').value = val;
        this.applyTransform();
      });
    });

    // ─── Clear buttons ───
    document.getElementById('clearAnnotBtn')?.addEventListener('click', () => {
      this.annotationManager.clearAll();
      this.showToast('🗑️ 所有标注已清除'); this.updateAnnotCount();
    });
    document.getElementById('clearUnitsBtn')?.addEventListener('click', () => {
      this.unitManager.meshes.forEach(u => this.sceneManager.getScene().remove(u)); this.unitManager.meshes.length = 0;
      this.unitManager.labelSprites.forEach(s => this.sceneManager.getScene().remove(s)); this.unitManager.labelSprites.length = 0;
      this.dataStore.selectedUnit = null; this.showToast('🗑️ 所有单位已清除'); this.updateUnitList(); this.updateTransformPanel();
    });

    // ─── Model uploads ───
    const singleUploadZone = document.getElementById('singleUploadZone');
    const singleInput = document.getElementById('singleModelUpload');
    singleUploadZone?.addEventListener('click', () => singleInput?.click());
    singleUploadZone?.addEventListener('dragover', (e) => { e.preventDefault(); singleUploadZone.classList.add('dragover'); });
    singleUploadZone?.addEventListener('dragleave', () => singleUploadZone.classList.remove('dragover'));
    singleUploadZone?.addEventListener('drop', (e) => { e.preventDefault(); singleUploadZone.classList.remove('dragover'); if (e.dataTransfer.files.length) this.handleSingleModelUpload(e.dataTransfer.files[0]); });
    singleInput?.addEventListener('change', (e) => { if (e.target.files.length) this.handleSingleModelUpload(e.target.files[0]); });

    const batchUploadZone = document.getElementById('batchUploadZone');
    const batchInput = document.getElementById('batchModelUpload');
    batchUploadZone?.addEventListener('click', () => batchInput?.click());
    batchUploadZone?.addEventListener('dragover', (e) => { e.preventDefault(); batchUploadZone.classList.add('dragover'); });
    batchUploadZone?.addEventListener('dragleave', () => batchUploadZone.classList.remove('dragover'));
    batchUploadZone?.addEventListener('drop', (e) => { e.preventDefault(); batchUploadZone.classList.remove('dragover'); if (e.dataTransfer.files.length) this.handleModelUpload(e.dataTransfer.files, this.dataStore.sceneGroups[0]?.id); });
    batchInput?.addEventListener('change', (e) => { if (e.target.files.length) this.handleModelUpload(e.target.files, this.dataStore.sceneGroups[0]?.id); });
  }

  // ═══════════════════════════════════════════════════════════════
  //  NAV SECTION TOGGLE
  // ═══════════════════════════════════════════════════════════════

  toggleNavSection(sectionId) {
    // Update state
    for (const key of Object.keys(this.navSections)) {
      if (key === sectionId) {
        this.navSections[key].open = !this.navSections[key].open;
        this.navSections[key].active = this.navSections[key].open;
      } else {
        this.navSections[key].open = false;
        this.navSections[key].active = false;
      }
    }
    // Update DOM
    document.querySelectorAll('.nav-section-header').forEach(h => {
      const sec = h.dataset.section;
      h.classList.toggle('open', this.navSections[sec]?.open);
      h.classList.toggle('active', this.navSections[sec]?.active);
    });
    document.querySelectorAll('.nav-section-body').forEach(b => {
      const sec = b.dataset.section;
      b.classList.toggle('open', this.navSections[sec]?.open);
    });
    document.querySelectorAll('#sidebar-rail .rail-icon[data-section]').forEach(icon => {
      icon.classList.toggle('active', this.navSections[icon.dataset.section]?.active);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  SCENE SELECTOR
  // ═══════════════════════════════════════════════════════════════

  renderSceneSelector() {
    const container = document.getElementById('sceneSelector'); if (!container) return;
    let totalScenes = 0;
    let html = '';
    this.dataStore.sceneGroups.forEach(group => {
      const sceneCount = group.scenes.length;
      totalScenes += sceneCount;
      html += `<div class="scene-group">
        <div class="scene-group-header" data-gid="${group.id}">
          <span class="chevron ${group.collapsed ? '' : 'open'}">▶</span>
          <span class="grp-name">${group.name}</span>
          <span class="count">${sceneCount}</span>
          <span class="grp-actions">
            <button data-grp-action="add" data-gid="${group.id}" title="添加场景">+</button>
            <button data-grp-action="rename" data-gid="${group.id}" title="重命名">✏</button>
            <button data-grp-action="del" data-gid="${group.id}" title="删除分组">✕</button>
          </span>
        </div>
        <div class="scene-group-body ${group.collapsed ? 'collapsed' : ''}">`;
      group.scenes.forEach(sc => {
        const sd = this.dataStore.sceneDataStore[sc.id];
        const hasModel = sd?.model;
        const isActive = sc.id === this.dataStore.currentSceneId;
        const phases = sd?.phases?.length || 0;
        html += `<div class="scene-card ${isActive ? 'active' : ''}" data-sid="${sc.id}">
          <div class="thumb">${hasModel ? '🏔️' : '🗺️'}</div>
          <div class="info">
            <div class="name">${sc.name}</div>
            <div class="meta">
              <span class="model-badge ${hasModel ? '' : 'empty'}">${hasModel ? '● ' + (sd.model.fileName || '模型') : '○ 无模型'}</span>
              · ${phases}阶段
            </div>
          </div>
          <span class="card-actions">
            <button data-card-action="rename" data-sid="${sc.id}" title="重命名">✏</button>
            <button data-card-action="del" data-sid="${sc.id}" data-gid="${group.id}" title="删除">✕</button>
          </span>
        </div>`;
      });
      html += `<button class="add-scene-btn" data-grp-action="add" data-gid="${group.id}">+ 添加场景</button></div></div>`;
    });
    html += `<button class="add-group-btn" id="addGroupBtn">+ 新建分组</button>`;
    container.innerHTML = html;
    const countEl = document.getElementById('sceneCount'); if (countEl) countEl.textContent = totalScenes;

    // Wire scene selector events
    container.querySelectorAll('.scene-group-header').forEach(h => {
      h.addEventListener('click', (e) => {
        if (e.target.closest('[data-grp-action]')) return;
        const gid = h.dataset.gid;
        const g = this.dataStore.sceneGroups.find(x => x.id === gid);
        if (g) { g.collapsed = !g.collapsed; this.renderSceneSelector(); }
      });
    });
    container.querySelectorAll('.scene-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-card-action]')) return;
        this.switchScene(card.dataset.sid);
      });
    });
    container.querySelectorAll('[data-grp-action="add"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const gid = btn.dataset.gid;
        const g = this.dataStore.sceneGroups.find(x => x.id === gid); if (!g) return;
        const sceneId = `scene_${Date.now()}`;
        const name = `场景 ${g.scenes.length + 1}`;
        this.dataStore.initSceneData(sceneId, name, null);
        g.scenes.push({ id: sceneId, name }); g.collapsed = false;
        this.renderSceneSelector(); this.showToast(`✅ 已添加: ${name}`);
      });
    });
    container.querySelectorAll('[data-grp-action="rename"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const gid = btn.dataset.gid;
        const g = this.dataStore.sceneGroups.find(x => x.id === gid); if (!g) return;
        const name = prompt('输入新分组名称:', g.name); if (name) { g.name = name; this.renderSceneSelector(); }
      });
    });
    container.querySelectorAll('[data-grp-action="del"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const gid = btn.dataset.gid;
        if (this.dataStore.sceneGroups.length <= 1) { this.showToast('⚠️ 至少保留一个分组'); return; }
        if (!confirm('确定删除此分组?')) return;
        this.dataStore.sceneGroups = this.dataStore.sceneGroups.filter(x => x.id !== gid); this.renderSceneSelector();
      });
    });
    container.querySelectorAll('[data-card-action="rename"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = btn.dataset.sid;
        const sd = this.dataStore.sceneDataStore[sid]; if (!sd) return;
        const name = prompt('输入新场景名称:', sd.name);
        if (name) {
          sd.name = name;
          for (const g of this.dataStore.sceneGroups) { const s = g.scenes.find(x => x.id === sid); if (s) s.name = name; }
          this.renderSceneSelector();
        }
      });
    });
    container.querySelectorAll('[data-card-action="del"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = btn.dataset.sid; const gid = btn.dataset.gid;
        if (sid === this.dataStore.currentSceneId) { this.showToast('⚠️ 不能删除当前活动场景'); return; }
        if (!confirm('确定删除此场景?')) return;
        const g = this.dataStore.sceneGroups.find(x => x.id === gid);
        if (g) g.scenes = g.scenes.filter(x => x.id !== sid);
        delete this.dataStore.sceneDataStore[sid]; this.renderSceneSelector();
      });
    });
    document.getElementById('addGroupBtn')?.addEventListener('click', () => {
      const name = prompt('输入分组名称:', '新分组');
      if (name) {
        this.dataStore.sceneGroups.push({ id: `grp_${Date.now()}`, name, collapsed: false, scenes: [] });
        this.renderSceneSelector(); this.showToast(`✅ 分组已创建: ${name}`);
      }
    });
    this.updateCurrentModelInfo();

    // Scene import/export buttons
    const importBtn = document.getElementById('importSceneBtn');
    const exportBtn = document.getElementById('exportSceneBtn');
    if (importBtn && !importBtn._listenersWired) {
      importBtn._listenersWired = true;
      importBtn.addEventListener('click', () => {
        const fileInput = document.getElementById('sceneFileInput');
        if (fileInput?._importing) return;
        if (fileInput) fileInput._importing = true;
        fileInput?.click();
      });
      exportBtn?.addEventListener('click', () => {
        this.saveSceneToJson(this.dataStore.currentSceneId);
      });
      const fileInput = document.getElementById('sceneFileInput');
      fileInput?.addEventListener('change', (e) => {
        if (e.target.files?.[0]) {
          this.loadSceneFromJson(e.target.files[0]);
          e.target.value = '';
          e.target._importing = false;
        }
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  VIEWPOINT SELECTOR
  // ═══════════════════════════════════════════════════════════════

  renderViewpointSelector() {
    const container = document.getElementById('viewpointSelector');
    if (!container) return;

    const sd = this.dataStore.getCurrentSceneData();
    if (!sd) return;
    if (!sd.viewpointGroups) sd.viewpointGroups = [{ id: 'vp_default', name: '📌 常用视角', collapsed: false, viewpoints: [] }];
    const vpGroups = sd.viewpointGroups;

    let totalVPs = 0;
    let html = '';
    vpGroups.forEach(group => {
      const vpCount = group.viewpoints?.length || 0;
      totalVPs += vpCount;
      html += `<div class="viewpoint-group">
        <div class="viewpoint-group-header" data-gid="${group.id}">
          <span class="chevron ${group.collapsed ? '' : 'open'}">▶</span>
          <span class="grp-name">${group.name}</span>
          <span class="count">${vpCount}</span>
          <span class="grp-actions">
            <button data-vp-grp-action="add" data-gid="${group.id}" title="添加视角">+</button>
            <button data-vp-grp-action="rename" data-gid="${group.id}" title="重命名">✏</button>
            <button data-vp-grp-action="del" data-gid="${group.id}" title="删除分组">✕</button>
          </span>
        </div>
        <div class="viewpoint-group-body ${group.collapsed ? 'collapsed' : ''}">`;
      (group.viewpoints || []).forEach(vp => {
        const posStr = `${vp.pos.x.toFixed(0)}, ${vp.pos.y.toFixed(0)}, ${vp.pos.z.toFixed(0)}`;
        html += `<div class="viewpoint-card" data-vpid="${vp.id}" draggable="true">
          <div class="vp-icon">📷</div>
          <div class="vp-info">
            <div class="vp-name">${vp.name}</div>
            <div class="vp-pos">${posStr}</div>
          </div>
          <span class="card-actions">
            <button data-vp-action="rename" data-vpid="${vp.id}" title="重命名">✏</button>
            <button data-vp-action="del" data-vpid="${vp.id}" title="删除">✕</button>
          </span>
        </div>`;
      });
      html += `<button class="add-viewpoint-btn" data-vp-grp-action="add" data-gid="${group.id}">+ 添加视角</button></div></div>`;
    });
    html += `<button class="add-vp-group-btn" id="addVPGroupBtn">+ 新建分组</button>`;
    container.innerHTML = html;

    const countEl = document.getElementById('viewpointCount');
    if (countEl) countEl.textContent = totalVPs;

    // Group header toggle
    container.querySelectorAll('.viewpoint-group-header').forEach(h => {
      h.addEventListener('click', (e) => {
        if (e.target.closest('[data-vp-grp-action]')) return;
        const gid = h.dataset.gid;
        const g = vpGroups.find(x => x.id === gid);
        if (g) { g.collapsed = !g.collapsed; this.renderViewpointSelector(); }
      });
    });

    // Viewpoint card click - jump to viewpoint
    container.querySelectorAll('.viewpoint-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-vp-action]')) return;
        const vpid = card.dataset.vpid;
        const vp = vpGroups.flatMap(g => g.viewpoints || []).find(v => v.id === vpid);
        if (vp) {
          this.viewpointManager.jumpToViewpoint(vp);
          this.showToast(`📷 ${vp.name}`);
        }
      });
    });

    // Group actions
    container.querySelectorAll('[data-vp-grp-action="add"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = prompt('输入视角名称:', `视角 ${(vpGroups.find(g => g.id === btn.dataset.gid)?.viewpoints?.length || 0) + 1}`);
        if (!name) return;
        const group = vpGroups.find(x => x.id === btn.dataset.gid);
        if (!group) return;
        if (!group.viewpoints) group.viewpoints = [];
        const vp = { id: `vp_${Date.now()}`, name, ...this.viewpointManager.getCurrentCameraState() };
        group.viewpoints.push(vp);
        this.renderViewpointSelector();
        this.showToast(`✅ 已保存视角: ${name}`);
      });
    });
    container.querySelectorAll('[data-vp-grp-action="rename"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const gid = btn.dataset.gid;
        const g = vpGroups.find(x => x.id === gid);
        if (!g) return;
        const name = prompt('输入新分组名称:', g.name);
        if (name) { g.name = name; this.renderViewpointSelector(); }
      });
    });
    container.querySelectorAll('[data-vp-grp-action="del"]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (vpGroups.length <= 1) { this.showToast('⚠️ 至少保留一个分组'); return; }
        if (!confirm('确定删除此分组?')) return;
        const filtered = vpGroups.filter(x => x.id !== btn.dataset.gid);
        sd.viewpointGroups = filtered;
        this.renderViewpointSelector();
      });
    });

    // Viewpoint actions
    container.querySelectorAll('[data-vp-action="rename"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const vpid = btn.dataset.vpid;
        const vp = vpGroups.flatMap(g => g.viewpoints || []).find(v => v.id === vpid);
        if (!vp) return;
        const name = prompt('输入新视角名称:', vp.name);
        if (name) { vp.name = name; this.renderViewpointSelector(); }
      });
    });
    container.querySelectorAll('[data-vp-action="del"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const vpid = btn.dataset.vpid;
        vpGroups.forEach(g => { if (g.viewpoints) g.viewpoints = g.viewpoints.filter(v => v.id !== vpid); });
        this.renderViewpointSelector();
      });
    });

    // Drag to reorder
    const self = this;
    container.querySelectorAll('.viewpoint-card').forEach(card => {
      card.addEventListener('dragstart', (e) => {
        self.draggedViewpoint = card.dataset.vpid;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        container.querySelectorAll('.viewpoint-card').forEach(c => c.classList.remove('drag-over'));
        self.draggedViewpoint = null;
      });
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (self.draggedViewpoint && self.draggedViewpoint !== card.dataset.vpid) {
          card.classList.add('drag-over');
        }
      });
      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over');
      });
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        if (!self.draggedViewpoint || self.draggedViewpoint === card.dataset.vpid) return;
        const targetId = card.dataset.vpid;
        let srcVp, tgtVp, srcGroup, tgtGroup;
        for (const g of vpGroups) {
          const s = (g.viewpoints || []).find(v => v.id === self.draggedViewpoint);
          const t = (g.viewpoints || []).find(v => v.id === targetId);
          if (s) { srcVp = s; srcGroup = g; }
          if (t) { tgtVp = t; tgtGroup = g; }
        }
        if (!srcVp || !tgtVp) return;
        if (srcGroup.id === tgtGroup.id) {
          const arr = srcGroup.viewpoints;
          const si = arr.findIndex(v => v.id === self.draggedViewpoint);
          const ti = arr.findIndex(v => v.id === targetId);
          arr.splice(si, 1);
          arr.splice(ti, 0, srcVp);
        } else {
          srcGroup.viewpoints = srcGroup.viewpoints.filter(v => v.id !== self.draggedViewpoint);
          const ti = tgtGroup.viewpoints.findIndex(v => v.id === targetId);
          tgtGroup.viewpoints.splice(ti, 0, srcVp);
        }
        self.renderViewpointSelector();
      });
    });

    // Add new group button
    document.getElementById('addVPGroupBtn')?.addEventListener('click', () => {
      const name = prompt('输入分组名称:', '📂 新分组');
      if (name) {
        const finalName = /^[a-zA-Z0-9]/.test(name) ? '📂 ' + name : name;
        vpGroups.push({ id: `vpg_${Date.now()}`, name: finalName, collapsed: false, viewpoints: [] });
        this.renderViewpointSelector();
        this.showToast(`✅ 分组已创建: ${finalName}`);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  PHASE BAR
  // ═══════════════════════════════════════════════════════════════

  renderPhaseBar() {
    const bar = document.getElementById('phaseBar'); if (!bar) return;
    const phases = this.dataStore.getPhases();
    let html = '';
    phases.forEach((p, i) => {
      html += `<button class="phase-btn ${i === this.dataStore.currentPhase ? 'active' : ''}" data-phase="${i}">${p.name}</button>`;
    });
    html += `<button class="action-btn" id="addPhaseBtn" style="margin-left:8px;">+ 阶段</button>`;
    html += `<button class="action-btn" id="playAllBtn" style="margin-left:4px;">▶ 演示</button>`;
    bar.innerHTML = html;
    bar.querySelectorAll('.phase-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchPhase(parseInt(btn.dataset.phase)));
      btn.addEventListener('dblclick', () => {
        const idx = parseInt(btn.dataset.phase);
        const phases = this.dataStore.getPhases();
        const newName = prompt('阶段名称:', phases[idx].name);
        if (newName) { phases[idx].name = newName; this.renderPhaseBar(); }
      });
    });
    document.getElementById('addPhaseBtn')?.addEventListener('click', () => {
      const phases = this.dataStore.getPhases();
      const name = prompt('阶段名称:', `阶段 ${phases.length + 1}`);
      if (name) { phases.push({ name, units: [], annotations: [] }); this.renderPhaseBar(); this.showToast(`✅ 已添加阶段: ${name}`); }
    });
    document.getElementById('playAllBtn')?.addEventListener('click', () => {
      this.phaseManager.startAutoPlay(
        () => { this.renderPhaseBar(); this.updateUnitList(); },
        () => { this.showToast('⚠️ 至少需要两个阶段'); },
        () => { this.showToast('✅ 演示完成'); }
      );
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  UNIT LIST (RIGHT PANEL)
  // ═══════════════════════════════════════════════════════════════

  updateUnitList() {
    const container = document.getElementById('unitListContainer'); if (!container) return;
    const countEl = document.getElementById('unitCount');
    if (countEl) countEl.textContent = this.unitManager.meshes.length;
    if (this.unitManager.meshes.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:20px; color:#475569; font-size:11px;">暂无单位<br><span style="font-size:9px;">从左侧面板选择单位并点击场景放置</span></div>`;
      return;
    }
    // Group by monster / player
    const monsters = this.unitManager.meshes.filter(u => u.userData.isMonster);
    const players = this.unitManager.meshes.filter(u => !u.userData.isMonster);
    let html = '';
    if (monsters.length > 0) {
      html += `<div style="font-size:9px; font-weight:700; color:#f97316; padding:2px 4px; margin-bottom:2px;">👹 怪物 (${monsters.length})</div>`;
      monsters.forEach(u => { html += this.buildUnitListItem(u); });
    }
    if (players.length > 0) {
      html += `<div style="font-size:9px; font-weight:700; color:#3b82f6; padding:2px 4px; margin-top:4px; margin-bottom:2px;">⚔️ 玩家 (${players.length})</div>`;
      players.forEach(u => { html += this.buildUnitListItem(u); });
    }
    container.innerHTML = html;
    container.querySelectorAll('.unit-list-item').forEach(item => {
      item.addEventListener('click', () => {
        const name = item.dataset.name;
        const unit = this.unitManager.meshes.find(u => u.name === name);
        if (unit) { this.unitManager.clearSelectionVisuals(); this.dataStore.selectedUnit = unit; this.unitManager.addSelectionVisual(unit); this.updateTransformPanel(); }
      });
    });
    container.querySelectorAll('.unit-del-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = btn.dataset.name;
        const unit = this.unitManager.meshes.find(u => u.name === name);
        if (unit) {
          this.unitManager.deleteUnit(unit);
          this.updateTransformPanel();
          this.showToast('🗑️ 单位已删除'); this.updateUnitList();
        }
      });
    });
    this.updateAnnotCount();
  }

  buildUnitListItem(u) {
    const def = this.unitManager.getUnitDef(u.userData.type);
    const isSelected = u === this.dataStore.selectedUnit;
    const colorHex = '#' + def.color.toString(16).padStart(6, '0');
    return `<div class="unit-list-item" data-name="${u.name}" style="display:flex; align-items:center; gap:5px; padding:4px 6px; border-radius:5px; cursor:pointer; margin-bottom:1px; border:1px solid ${isSelected ? 'rgba(168,85,247,0.3)' : 'transparent'}; background:${isSelected ? 'rgba(168,85,247,0.1)' : 'transparent'}; transition:all 0.12s;">
      <div style="width:4px; height:16px; border-radius:2px; background:${colorHex}; opacity:0.6;"></div>
      <span style="font-size:13px;">${def.icon}</span>
      <div style="flex:1; min-width:0;">
        <div style="font-size:10px; font-weight:600; color:#e2e8f0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${u.userData.label}</div>
        <div style="font-size:8px; color:#475569;">x:${u.position.x.toFixed(1)} z:${u.position.z.toFixed(1)} · ${(u.userData.unitScale || 0.1).toFixed(2)}x</div>
      </div>
      <button class="unit-del-btn" data-name="${u.name}" style="width:18px; height:18px; border-radius:3px; border:none; background:rgba(239,68,68,0.1); color:#fca5a5; font-size:10px; cursor:pointer; display:flex; align-items:center; justify-content:center;">✕</button>
    </div>`;
  }

  // ═══════════════════════════════════════════════════════════════
  //  TOOLBAR / SCALE / INFO HELPERS
  // ═══════════════════════════════════════════════════════════════

  updateToolbarSelection() {
    document.querySelectorAll('.unit-card').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.nav-tool-btn').forEach(b => {
      if (['arrow', 'zone', 'label'].includes(b.dataset.tool)) b.classList.remove('active');
    });
    document.getElementById('zoneOptions')?.classList.remove('visible');
    document.getElementById('labelOptions')?.classList.remove('visible');
  }

  updateTransformPanel() {
    const panel = document.getElementById('transformPanel');
    if (!panel) return;
    if (!this.dataStore.selectedUnit) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    const p = this.dataStore.selectedUnit.position;
    const r = this.dataStore.selectedUnit.rotation;
    const s = this.dataStore.selectedUnit.scale.x;
    document.getElementById('posX').value = p.x.toFixed(2);
    document.getElementById('posY').value = p.y.toFixed(2);
    document.getElementById('posZ').value = p.z.toFixed(2);
    document.getElementById('rotX').value = (r.x * 180 / Math.PI).toFixed(1);
    document.getElementById('rotY').value = (r.y * 180 / Math.PI).toFixed(1);
    document.getElementById('rotZ').value = (r.z * 180 / Math.PI).toFixed(1);
    document.getElementById('scaleInput').value = s.toFixed(3);
    document.getElementById('unitScaleSlider').value = s;
    document.getElementById('unitNameInput').value = this.dataStore.selectedUnit.userData.label || '';
  }

  applyTransform() {
    if (!this.dataStore.selectedUnit) return;
    const px = parseFloat(document.getElementById('posX').value) || 0;
    const py = parseFloat(document.getElementById('posY').value) || 0;
    const pz = parseFloat(document.getElementById('posZ').value) || 0;
    const rx = (parseFloat(document.getElementById('rotX').value) || 0) * Math.PI / 180;
    const ry = (parseFloat(document.getElementById('rotY').value) || 0) * Math.PI / 180;
    const rz = (parseFloat(document.getElementById('rotZ').value) || 0) * Math.PI / 180;
    const scale = parseFloat(document.getElementById('scaleInput').value) || 0.1;
    this.dataStore.selectedUnit.position.set(px, py, pz);
    this.dataStore.selectedUnit.rotation.set(rx, ry, rz);
    this.dataStore.selectedUnit.scale.set(scale, scale, scale);
    this.dataStore.selectedUnit.userData.unitScale = scale;
    this.unitManager.updateUnitSprite(this.dataStore.selectedUnit);
  }

  updateCurrentModelInfo() {
    const el = document.getElementById('currentModelInfo'); if (!el) return;
    const sd = this.dataStore.getCurrentSceneData();
    if (sd?.model?.fileName) {
      el.textContent = sd.model.fileName; el.style.color = '#22c55e';
    } else {
      el.textContent = '无模型'; el.style.color = '#475569';
    }
  }

  updateAnnotCount() {
    const el = document.getElementById('annotCount'); if (el) el.textContent = this.annotationManager.meshes.length;
  }

  // ═══════════════════════════════════════════════════════════════
  //  TOAST
  // ═══════════════════════════════════════════════════════════════

  showToast(msg) {
    const toast = document.getElementById('toast'); if (!toast) return;
    toast.textContent = msg; toast.classList.add('show');
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => toast.classList.remove('show'), 2500);
  }
}
