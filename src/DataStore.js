// src/DataStore.js
export class DataStore {
  constructor(initialScenes = []) {
    this.sceneGroups = initialScenes;
    this.sceneDataStore = {};

    // Runtime state
    this.currentSceneId = null;
    this.currentPhase = 0;
    this.selectedUnit = null;
    this.selectedAnnotation = null;
    this.hoveredUnit = null;
    this.hoveredAnnotation = null;
    this.placementMode = null;
    this.playerViewMode = 'role';
  }

  // --- Scene Groups ---
  addGroup(id, name) {
    this.sceneGroups.push({ id, name, collapsed: false, scenes: [] });
  }

  removeGroup(id) {
    const idx = this.sceneGroups.findIndex(g => g.id === id);
    if (idx >= 0) this.sceneGroups.splice(idx, 1);
  }

  addSceneToGroup(groupId, sceneId, name, model) {
    const group = this.sceneGroups.find(g => g.id === groupId);
    if (!group) return;
    group.scenes.push({ id: sceneId, name });
    this.initSceneData(sceneId, name, model);
  }

  removeScene(sceneId) {
    delete this.sceneDataStore[sceneId];
    for (const group of this.sceneGroups) {
      const idx = group.scenes.findIndex(s => s.id === sceneId);
      if (idx >= 0) { group.scenes.splice(idx, 1); break; }
    }
  }

  // --- Scene Data ---
  initSceneData(sceneId, name, modelInfo) {
    if (!this.sceneDataStore[sceneId]) {
      this.sceneDataStore[sceneId] = {
        name: name || '未命名场景',
        model: modelInfo || null,
        phases: [{ name: '阶段 1', units: [], annotations: [] }],
        currentPhase: 0,
        modelBounds: null,
        viewpointGroups: [
          { id: 'vp_default', name: '📌 常用视角', collapsed: false, viewpoints: [] }
        ]
      };
    }
    return this.sceneDataStore[sceneId];
  }

  getCurrentSceneData() {
    return this.sceneDataStore[this.currentSceneId];
  }

  getCurrentPhaseData() {
    const sd = this.getCurrentSceneData();
    return sd ? sd.phases[this.currentPhase] : null;
  }

  getPhases() {
    const sd = this.getCurrentSceneData();
    return sd ? sd.phases : [];
  }

  // --- Phase state save/load ---
  savePhaseState(units, annotations) {
    const sd = this.getCurrentSceneData();
    if (!sd) return;
    const phase = sd.phases[this.currentPhase];
    phase.units = units.map(u => ({
      type: u.userData.type,
      label: u.userData.label,
      x: u.position.x, y: u.position.y, z: u.position.z,
      rx: u.rotation.x, ry: u.rotation.y, rz: u.rotation.z,
      name: u.name,
      unitScale: u.userData.unitScale || 0.1
    }));
    phase.annotations = annotations.map(a => {
      const d = { type: a.userData.annotationType };
      if (d.type === 'arrow') {
        d.start = a.userData.start; d.end = a.userData.end; d.color = a.userData.color;
      } else if (d.type === 'zone') {
        d.center = a.userData.center; d.radius = a.userData.radius;
        d.color = a.userData.color; d.label = a.userData.label;
      } else if (d.type === 'label') {
        d.pos = a.userData.pos; d.text = a.userData.text;
      }
      return d;
    });
    sd.currentPhase = this.currentPhase;
  }

  switchPhase(index) {
    const sd = this.getCurrentSceneData();
    if (!sd || index < 0 || index >= sd.phases.length) return false;
    this.currentPhase = index;
    return true;
  }

  addPhase(name) {
    const sd = this.getCurrentSceneData();
    if (!sd) return;
    sd.phases.push({ name: name || `阶段 ${sd.phases.length + 1}`, units: [], annotations: [] });
  }

  removePhase(index) {
    const sd = this.getCurrentSceneData();
    if (!sd || sd.phases.length <= 1) return;
    sd.phases.splice(index, 1);
    if (this.currentPhase >= sd.phases.length) this.currentPhase = sd.phases.length - 1;
  }

  // --- JSON Export/Import ---
  exportSceneJSON(sceneId) {
    const sd = this.sceneDataStore[sceneId];
    if (!sd) return null;
    return JSON.stringify({
      name: sd.name,
      model: sd.model,
      phases: sd.phases,
      viewpointGroups: sd.viewpointGroups
    }, null, 2);
  }

  importSceneJSON(jsonString, sceneId, modelInfo) {
    const data = JSON.parse(jsonString);
    this.sceneDataStore[sceneId] = {
      name: data.name || 'Imported Scene',
      model: modelInfo || data.model || null,
      phases: data.phases || [{ name: '阶段 1', units: [], annotations: [] }],
      currentPhase: 0,
      modelBounds: null,
      viewpointGroups: data.viewpointGroups || [
        { id: 'vp_default', name: '📌 常用视角', collapsed: false, viewpoints: [] }
      ]
    };
  }

}
