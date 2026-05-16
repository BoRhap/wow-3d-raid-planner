# Code Splitting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the monolithic `index.js` (~3,307 lines) into 11 focused ES6 class modules in `src/`, with incremental migration.

**Architecture:** Each module is an ES6 class receiving its dependencies via constructor injection. App.js is the composition root. Three.js switches from CDN importmap to npm bundling first, then modules are extracted in dependency order (no-deps first, UI last).

**Tech Stack:** Vanilla JS (ES modules), Three.js 0.183 via npm, Vite 6

---

## File Structure

```
src/
  App.js                 # Entry: assembles all modules
  Constants.js           # UNIT_CATEGORIES, CUSTOM_ITEM_PATHS (no class)
  DataStore.js           # class DataStore
  SceneManager.js        # class SceneManager — renderer, camera, lights, ground, particles, animate
  ModelManager.js        # class ModelManager — GLB/FBX loading, upload
  ClipPlaneManager.js    # class ClipPlaneManager — clipping plane
  UnitManager.js         # class UnitManager — chibi meshes, placement, drag, selection
  AnnotationManager.js   # class AnnotationManager — arrows, zones, labels
  PhaseManager.js        # class PhaseManager — phase switching, animated transitions
  ViewpointManager.js    # class ViewpointManager — camera viewpoints
  InteractionManager.js  # class InteractionManager — raycaster, mouse/keyboard events
  UIManager.js           # class UIManager — all DOM construction
```

**Modify:** `index.html` (remove importmap, update entry)
**Remove:** `index.js` (after migration complete)

---

### Task 1: Switch Three.js to npm bundling

**Files:**
- Modify: `index.html:11-20` (remove importmap)
- Modify: `index.js:1-8` (change imports to npm paths)

- [ ] **Step 1: Replace CDN import paths with npm imports**

In `index.js` lines 1-8, replace:
```js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';
import naxx01Glb from './src/map/naxx-01.glb?url';
import naxx02Glb from './src/map/naxx-02.glb?url';
```

With:
```js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import naxx01Glb from './src/map/naxx-01.glb?url';
import naxx02Glb from './src/map/naxx-02.glb?url';
```

Note: Vite resolves `three/addons/` to `three/examples/jsm/` automatically. If that doesn't work, use `three/examples/jsm/` paths directly — both resolve from node_modules.

- [ ] **Step 2: Remove importmap from index.html**

Delete the entire `<script type="importmap">` block (lines 11-20 of `index.html`).

Result should be:
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; outline: none !important; box-sizing: border-box; }
    html, body, #root { width: 100%; height: 100%; overflow: hidden; background: #000; }
    canvas { display: block; outline: none !important; }
    #canvas { position: absolute; top: 0; left: 0; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/index.js"></script>
</body>
</html>
```

- [ ] **Step 3: Verify**

Run: `npm run dev`
Expected: App loads without errors. 3D scene renders, models (naxx-01.glb) load. Check browser console for no import errors.

---

### Task 2: Extract Constants.js

**Files:**
- Create: `src/Constants.js`
- Modify: `index.js:107-196` (remove unit definitions + custom items loading, add import)

- [ ] **Step 1: Create src/Constants.js**

Extract from `index.js` lines 107-167 (`UNIT_CATEGORIES`) and lines 103-105 (custom items registry variables):

```js
// src/Constants.js
export const UNIT_CATEGORIES = {
  monsters: {
    label: '怪物单位',
    icon: '👹',
    units: {
      boss:     { label: 'Boss',   icon: '💀', color: 0xa855f7, desc: '首领' },
      add:      { label: '小怪',   icon: '👹', color: 0xf97316, desc: '附加怪物' },
      elite:    { label: '精英怪', icon: '🔱', color: 0xef4444, desc: '精英单位' },
      summoned: { label: '召唤物', icon: '🌀', color: 0x8b5cf6, desc: '召唤产物' },
      mobGroup: { label: '怪物群', icon: '👥', color: 0xf97316, desc: '2精英+2小怪' },
    }
  },
  players_role: {
    label: '角色类型',
    icon: '⚔️',
    units: {
      tank:      { label: '坦克',   icon: '🛡️', color: 0x3b82f6, desc: '坦克' },
      healer:    { label: '治疗',   icon: '💚', color: 0x22c55e, desc: '治疗者' },
      dps:       { label: '输出',   icon: '⚔️', color: 0xef4444, desc: '伤害输出' },
      meleeDps:  { label: '近战输出', icon: '⚔️', color: 0xef4444, desc: '近战伤害输出' },
      rangedDps: { label: '远程输出', icon: '🏹', color: 0xf97316, desc: '远程伤害输出' },
      g1:        { label: 'G1',    icon: '🥉', color: 0xcd7f32, desc: '1级单位' },
      g2:        { label: 'G2',    icon: '🥈', color: 0xc0c0c0, desc: '2级单位' },
      g3:        { label: 'G3',    icon: '🥈', color: 0xc0c0c0, desc: '3级单位' },
      g4:        { label: 'G4',    icon: '🥇', color: 0xffd700, desc: '4级单位' },
      g5:        { label: 'G5',    icon: '💎', color: 0x60a5fa, desc: '5级单位' },
    }
  },
  players_class: {
    label: '职业类型',
    icon: '📜',
    units: {
      warrior:      { label: '战士',     icon: '⚔️', color: 0xc79c6e, desc: 'Warrior' },
      paladin:      { label: '圣骑士',   icon: '🛡️', color: 0xf58cba, desc: 'Paladin' },
      deathknight:  { label: '死亡骑士', icon: '💀', color: 0xc41e3a, desc: 'Death Knight' },
      hunter:       { label: '猎人',     icon: '🏹', color: 0xabd473, desc: 'Hunter' },
      shaman:       { label: '萨满',     icon: '🌊', color: 0x0070de, desc: 'Shaman' },
      rogue:        { label: '盗贼',     icon: '🗡️', color: 0xfff569, desc: 'Rogue' },
      druid:        { label: '德鲁伊',   icon: '🌿', color: 0xff7d0a, desc: 'Druid' },
      mage:         { label: '法师',     icon: '🔮', color: 0x69ccf0, desc: 'Mage' },
      warlock:      { label: '术士',     icon: '🔥', color: 0x9482c9, desc: 'Warlock' },
      priest:       { label: '牧师',     icon: '✨', color: 0xffffff, desc: 'Priest' },
    }
  },
  custom: {
    label: '自定义物品',
    icon: '🎒',
    units: {}
  }
};

export const CUSTOM_ITEM_DEFS = [
  { filename: 'TBC鞋',  label: 'TBC鞋',  color: 0x8B4513 },
  { filename: '敲鼓',   label: '敲鼓',   color: 0xDAA520 },
  { filename: '火箭靴', label: '火箭靴', color: 0x4169E1 },
  { filename: '误导',   label: '误导',   color: 0x32CD32 },
  { filename: '自由',   label: '自由',   color: 0x4169E1 },
  { filename: '群嘲',   label: '群嘲',   color: 0xDC143C },
  { filename: '保护',   label: '保护',   color: 0x228B22 },
];

export const DEFAULT_GROUND_WIDTH = 60;
export const DEFAULT_GROUND_HEIGHT = 60;
```

- [ ] **Step 2: Update index.js imports and use Constants**

Add at top of `index.js` after the Three.js imports:
```js
import { UNIT_CATEGORIES, CUSTOM_ITEM_DEFS, DEFAULT_GROUND_WIDTH, DEFAULT_GROUND_HEIGHT } from './src/Constants.js';
```

Remove lines 107-167 (`const UNIT_CATEGORIES = { ... };`) since it's now imported.

Keep the custom items registry variables (lines 103-105) and `loadCustomItems()` function (lines 159-196) in index.js for now — they still depend on `tgaLoader` which is a Three.js object.

- [ ] **Step 3: Verify**

Run: `npm run dev`
Expected: App loads. Unit palette renders all categories. Custom items list shows. No import errors in console.

---

### Task 3: Extract DataStore.js

**Files:**
- Create: `src/DataStore.js`
- Modify: `index.js:198-232` (scene system → import DataStore), `index.js:1090-1149` (save/load → move to DataStore), `index.js:1140-1240` (import/export → move to DataStore)

- [ ] **Step 1: Create src/DataStore.js**

```js
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

  downloadJson(data, filename) {
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
}
```

- [ ] **Step 2: Wire DataStore into index.js**

Add import:
```js
import { DataStore } from './src/DataStore.js';
```

Replace the global initialization (lines 199-232) with:
```js
const dataStore = new DataStore([
  { id: 'raid1', name: '🏰 团队副本', collapsed: false, scenes: [
    { id: 'scene01', name: '场景01' },
    { id: 'scene02', name: '场景02' }
  ] },
  { id: 'dungeon1', name: '⚔️ 大秘境', collapsed: false, scenes: [] },
  { id: 'pvp1', name: '🛡️ PvP战场', collapsed: true, scenes: [] }
]);

dataStore.initSceneData('scene01', '场景01', { dataUrl: naxx01Glb, fileName: 'naxx-01.glb', type: 'glb' });
dataStore.initSceneData('scene02', '场景02', { dataUrl: naxx02Glb, fileName: 'naxx-02.glb', type: 'glb' });
dataStore.currentSceneId = 'scene01';
```

Replace all usages of `sceneDataStore`, `sceneGroups`, `currentSceneId`, `currentPhase`, `selectedUnit`, `selectedAnnotation`, `hoveredUnit`, `hoveredAnnotation`, `placementMode` with `dataStore.xxx`.

Replace `getCurrentSceneData()` → `dataStore.getCurrentSceneData()`
Replace `getPhases()` → `dataStore.getPhases()`
Replace `initSceneData(...)` → `dataStore.initSceneData(...)`
Replace `saveCurrentState()` → call `dataStore.savePhaseState(unitMeshes, annotationMeshes)`
Replace `downloadJson(...)` → `dataStore.downloadJson(...)` (or keep standalone)
Replace `saveSceneToJson(...)` → use `dataStore.exportSceneJSON()` + `dataStore.downloadJson()`

- [ ] **Step 3: Verify**

Run: `npm run dev`
Expected: App loads. Scene switching works. Phase switching works. JSON export/import works.

---

### Task 4: Extract SceneManager.js

**Files:**
- Create: `src/SceneManager.js`
- Modify: `index.js:242-306` (init → use SceneManager), `index.js:308-325` (lighting), `index.js:327-349` (ground)

- [ ] **Step 1: Create src/SceneManager.js**

```js
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

    this.#createLighting();
    this.#createGround(this.groundWidth, this.groundHeight);
    this.#createRuneParticles();
  }

  // --- Getters ---
  getCamera() { return this.camera; }
  getScene() { return this.scene; }
  getRenderer() { return this.renderer; }
  getControls() { return this.controls; }
  getClock() { return this.clock; }

  // --- Lighting ---
  #createLighting() {
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
  #createGround(w, h) {
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
  #createRuneParticles() {
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
```

- [ ] **Step 2: Wire SceneManager into index.js**

Add import:
```js
import { SceneManager } from './src/SceneManager.js';
```

Replace `init()` (lines 243-306) with:
```js
const sceneManager = new SceneManager();

function init() {
  sceneManager.init();

  // Wire pointer lock events
  document.addEventListener('mousemove', (e) => sceneManager.handleMouseMoveForFreeRoam(e));

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  buildUI();
  bindEvents();

  const sd = dataStore.getCurrentSceneData();
  if (sd.model) loadModelIntoScene(sd.model);

  renderer.setAnimationLoop(() => sceneManager.animate(unitMeshes, annotationMeshes, selectedUnit));

  loadCustomItems().then(() => populateCustomGrid());
}
```

Replace all global references:
- `scene` → `sceneManager.getScene()`
- `camera` → `sceneManager.getCamera()`
- `renderer` → `sceneManager.getRenderer()`
- `controls` → `sceneManager.getControls()`
- `clock` → `sceneManager.getClock()`
- `groundWidth`/`groundHeight` → `sceneManager.groundWidth`/`sceneManager.groundHeight`
- `brightness` → `sceneManager.brightness`
- `freeRoamMode`, `freeRoamSpeed`, `keys` → `sceneManager.*`
- `createLighting()` → (removed, in SceneManager)
- `createGround(w, h)` → `sceneManager.#createGround(w, h)` → expose as `sceneManager.createGround(w, h)` if needed externally
- `setBrightness(val)` → `sceneManager.setBrightness(val)`

**Important:** Make `createGround` a public method (not private) since `loadModelIntoScene()` calls it.

- [ ] **Step 3: Verify**

Run: `npm run dev`
Expected: 3D scene renders. Lighting looks normal. Ground and grid visible. Orbit controls work. Free-roam (WASD) works. Brightness slider works.

---

### Task 5: Extract ModelManager.js

**Files:**
- Create: `src/ModelManager.js`
- Modify: `index.js:351-423` (model loading → use ModelManager), `index.js:1343-1369` (model upload)

- [ ] **Step 1: Create src/ModelManager.js**

Extract lines 234-240 (loaders), 352-423 (loadModelIntoScene), and 1343-1369 (upload handlers) into:

```js
// src/ModelManager.js
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export class ModelManager {
  constructor(sceneManager, dataStore) {
    this.sceneManager = sceneManager;
    this.dataStore = dataStore;
    this.currentSceneModel = null;
    this.clipModelMinY = 0;
    this.clipModelMaxY = 100;

    this.fbxLoader = new FBXLoader();
    this.gltfLoader = new GLTFLoader();
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
  }

  getCurrentModel() { return this.currentSceneModel; }

  loadModelIntoScene(modelInfo, onLoadedCallback) {
    if (!modelInfo || !modelInfo.dataUrl) {
      if (onLoadedCallback) onLoadedCallback();
      return;
    }
    if (this.currentSceneModel) {
      this.sceneManager.getScene().remove(this.currentSceneModel);
      this.currentSceneModel = null;
    }

    const scene = this.sceneManager.getScene();

    const onLoaded = (object) => {
      const model = object.scene ? object.scene : object;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scaleFactor = maxDim > 0 ? 60 / maxDim : 1;
      model.scale.multiplyScalar(scaleFactor);
      box.setFromObject(model); box.getSize(size); box.getCenter(center);
      model.position.x -= center.x; model.position.z -= center.z;
      model.position.y -= box.min.y;

      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true; child.receiveShadow = true;
          if (child.geometry) {
            if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals();
            child.geometry.computeBoundingSphere();
          }
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          const fixedMats = mats.map(m => {
            const nm = new THREE.MeshStandardMaterial();
            if (m.color) {
              const c = m.color;
              nm.color.set((c.r < 0.05 && c.g < 0.05 && c.b < 0.05) ? 0x888888 : c);
            } else nm.color.set(0xaaaaaa);
            if (m.map) { nm.map = m.map; nm.map.colorSpace = THREE.SRGBColorSpace; nm.map.needsUpdate = true; }
            if (m.normalMap) nm.normalMap = m.normalMap;
            if (m.emissive && (m.emissive.r > 0 || m.emissive.g > 0 || m.emissive.b > 0)) {
              nm.emissive.copy(m.emissive);
              nm.emissiveIntensity = m.emissiveIntensity || 0.5;
              if (m.emissiveMap) nm.emissiveMap = m.emissiveMap;
            }
            if (m.transparent) { nm.transparent = true; nm.opacity = m.opacity ?? 1; }
            if (m.alphaMap) { nm.alphaMap = m.alphaMap; nm.transparent = true; }
            if (m.opacity !== undefined && m.opacity < 1) { nm.transparent = true; nm.opacity = m.opacity; }
            nm.side = THREE.DoubleSide; nm.roughness = 0.6; nm.metalness = 0.1;
            if (m.aoMap) nm.aoMap = m.aoMap;
            if (m.specularMap) { nm.metalnessMap = m.specularMap; nm.metalness = 0.3; }
            nm.needsUpdate = true; m.dispose(); return nm;
          });
          child.material = fixedMats.length === 1 ? fixedMats[0] : fixedMats;
        }
      });

      model.name = 'sceneModel';
      scene.add(model);
      this.currentSceneModel = model;

      const sd = this.dataStore.getCurrentSceneData();
      if (sd) sd.modelBounds = { sizeX: size.x, sizeY: size.y, sizeZ: size.z };

      const finalBox = new THREE.Box3().setFromObject(model);
      this.clipModelMinY = finalBox.min.y;
      this.clipModelMaxY = finalBox.max.y;

      const footW = Math.max(size.x * 1.3, 20), footH = Math.max(size.z * 1.3, 20);
      this.sceneManager.createGround(footW, footH);

      const dirLight = scene.getObjectByName('dirLight');
      if (dirLight) {
        const maxExt = Math.max(footW, footH) * 0.6;
        dirLight.shadow.camera.left = -maxExt; dirLight.shadow.camera.right = maxExt;
        dirLight.shadow.camera.top = maxExt; dirLight.shadow.camera.bottom = -maxExt;
        dirLight.shadow.camera.far = size.y * 3 + 100;
        dirLight.shadow.camera.updateProjectionMatrix();
      }

      const diagSize = Math.sqrt(footW * footW + footH * footH);
      const cam = this.sceneManager.getCamera();
      const ctrl = this.sceneManager.getControls();
      cam.position.set(0, diagSize * 0.7, diagSize * 0.5);
      cam.lookAt(0, size.y * 0.3, 0);
      ctrl.target.set(0, size.y * 0.3, 0);
      ctrl.update();

      if (onLoadedCallback) onLoadedCallback();
    };

    const onError = (err) => {
      console.error('Model load error:', err);
      if (onLoadedCallback) onLoadedCallback();
    };
    const onProgress = undefined; // skip progress toasts for now

    if (modelInfo.type === 'glb' || modelInfo.type === 'gltf') {
      this.gltfLoader.load(modelInfo.dataUrl, onLoaded, onProgress, onError);
    } else if (modelInfo.type === 'fbx') {
      this.fbxLoader.load(modelInfo.dataUrl, onLoaded, onProgress, onError);
    }
  }

  getModelMeshes() {
    const meshes = [];
    if (this.currentSceneModel) {
      this.currentSceneModel.traverse(c => { if (c.isMesh) meshes.push(c); });
    }
    return meshes;
  }

  getModelSurfaceHeight(x, z) {
    if (!this.currentSceneModel) return 0.5;
    const meshes = this.getModelMeshes();
    const ray = new THREE.Raycaster(
      new THREE.Vector3(x, this.clipModelMaxY + 50, z),
      new THREE.Vector3(0, -1, 0),
      0, this.clipModelMaxY + 100
    );
    const hits = ray.intersectObjects(meshes, false);
    if (hits.length > 0) return hits[0].point.y + 0.3;

    const upRay = new THREE.Raycaster(
      new THREE.Vector3(x, this.clipModelMinY - 10, z),
      new THREE.Vector3(0, 1, 0),
      0, this.clipModelMaxY + 50
    );
    const upHits = upRay.intersectObjects(meshes, false);
    return upHits.length > 0 ? upHits[0].point.y + 0.3 : 0.5;
  }
}
```

**Note:** The `applySceneModel` helper used in single upload flow needs to be preserved — it wraps `loadModelIntoScene` + saving to DataStore. If it doesn't exist as a standalone function, inline it in the upload handler.

- [ ] **Step 2: Wire ModelManager into index.js**

Add import:
```js
import { ModelManager } from './src/ModelManager.js';
```

Initialize:
```js
const modelManager = new ModelManager(sceneManager, dataStore);
```

Replace:
- `loadModelIntoScene(...)` → `modelManager.loadModelIntoScene(...)`
- `getModelSurfaceHeight(x, z)` → `modelManager.getModelSurfaceHeight(x, z)`
- `currentSceneModel` → `modelManager.getCurrentModel()`
- Remove `fbxLoader`, `gltfLoader`, `dracoLoader` globals (now in ModelManager)
- `handleModelUpload(files, groupId)` → `modelManager.handleBatchUpload(files, groupId)` (or keep in index.js temporarily — it depends on UIManager's `renderSceneSelector`)
- `handleSingleModelUpload(file)` → `modelManager.handleSingleUpload(file)` (same note)

For model upload functions that need UI callbacks, keep them in index.js for now but delegate file reading to ModelManager. We'll move them fully when UIManager is extracted.

- [ ] **Step 3: Verify**

Run: `npm run dev`
Expected: Naxxramas models load. Unit placement snaps to model surface. Model upload via UI works.

---

### Task 6: Extract ClipPlaneManager.js

**Files:**
- Create: `src/ClipPlaneManager.js`
- Modify: `index.js:1371-1433` (clip plane logic → use ClipPlaneManager)

- [ ] **Step 1: Create src/ClipPlaneManager.js**

```js
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

  destroy() {
    if (this.helper) {
      this.sceneManager.getScene().remove(this.helper);
      this.helper = null;
    }
    this.disable();
  }
}
```

- [ ] **Step 2: Wire into index.js**

Add import and initialization:
```js
import { ClipPlaneManager } from './src/ClipPlaneManager.js';
const clipPlaneManager = new ClipPlaneManager(sceneManager, modelManager);
```

Replace:
- `setClipEnabled(enabled)` → `clipPlaneManager.enable()` / `clipPlaneManager.disable()`
- `setClipHeight(val)` → `clipPlaneManager.setHeight(val)`
- `createClipPlaneVisual()` → (handled internally by ClipPlaneManager)
- `updateClipSliderRange()` → `clipPlaneManager.updateRange()`
- `clipEnabled`, `clipHeight`, `clipPlane`, `clipPlaneHelper` → remove globals

- [ ] **Step 3: Verify**

Run: `npm run dev`
Expected: Toggle clipping on/off works. Height slider works. Helper plane visible when enabled.

---

### Task 7: Extract UnitManager.js

**Files:**
- Create: `src/UnitManager.js`
- Modify: `index.js:443-903` (unit creation, selection, drag, chibi mesh)

- [ ] **Step 1: Create src/UnitManager.js**

This is the largest module extraction (~460 lines). The class skeleton:

```js
// src/UnitManager.js
import * as THREE from 'three';
import { UNIT_CATEGORIES, CUSTOM_ITEM_DEFS } from './Constants.js';

export class UnitManager {
  constructor(sceneManager, dataStore, modelManager, tgaLoader) {
    this.sceneManager = sceneManager;
    this.dataStore = dataStore;
    this.modelManager = modelManager;
    this.tgaLoader = tgaLoader;
    this.meshes = [];
    this.labelSprites = [];
    this.customItemsRegistry = {};
    this.customItemsLoaded = false;
  }

  // --- Custom Items Loading ---
  async loadCustomItems() {
    if (this.customItemsLoaded) return;
    for (const item of CUSTOM_ITEM_DEFS) {
      try {
        const texture = await new Promise((resolve, reject) => {
          this.tgaLoader.load(`/src/icons/${item.filename}.tga`, resolve, undefined, reject);
        });
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.flipY = false;
        this.customItemsRegistry[item.filename] = {
          label: item.label, icon: '🎒', color: item.color, texture
        };
      } catch (err) {
        console.warn(`加载 ${item.filename}.tga 失败:`, err);
      }
    }
    this.customItemsLoaded = true;
  }

  // --- Unit Definition Lookup ---
  getUnitDef(type) {
    for (const cat of Object.values(UNIT_CATEGORIES)) {
      if (cat.units && cat.units[type]) return cat.units[type];
    }
    if (this.customItemsRegistry[type]) {
      return {
        label: this.customItemsRegistry[type].label,
        icon: this.customItemsRegistry[type].icon,
        color: this.customItemsRegistry[type].color,
        desc: '自定义物品'
      };
    }
    return { label: type, icon: '❓', color: 0xaaaaaa, desc: '' };
  }

  // --- Chibi Mesh Creation ---
  // Extract createChibiMesh() from index.js lines 460-882
  // Keep exact same geometry code, parameterized by color/scale/label

  createChibiMesh(def, label, scale) { /* ... exact code from index.js ... */ }

  // --- Custom Mesh Creation ---
  createCustomMesh(itemId, x, z, label, scale) { /* ... exact code from index.js ... */ }

  // --- Placement ---
  placeUnit(type, x, y, z) {
    // Create mesh, add to scene, push to meshes[]
    // Create label sprite
    // Return the mesh
  }

  // --- Selection ---
  selectUnit(mesh) { /* ... */ }
  deselectUnit() { /* ... */ }
  deleteUnit(mesh) { /* ... */ }

  // --- Drag ---
  startDrag(mesh) { /* ... */ }
  updateDrag(intersectPoint) { /* ... */ }
  endDrag() { /* ... */ }

  // --- Transform ---
  setUnitTransform(mesh, pos, rot, scale) { /* ... */ }
  getUnitTransform(mesh) { /* ... */ }
}
```

**All code extracted from index.js with no logic changes.** Exact geometry creation in `createChibiMesh` must match character-by-character — it's complex procedural 3D geometry (spheres, capsules, cones, toruses).

- [ ] **Step 2: Wire UnitManager into index.js**

Add import and initialization:
```js
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import { UnitManager } from './src/UnitManager.js';

const tgaLoader = new TGALoader();
const unitManager = new UnitManager(sceneManager, dataStore, modelManager, tgaLoader);
```

Replace:
- `unitMeshes` → `unitManager.meshes`
- `unitLabelSprites` → `unitManager.labelSprites`
- `customItemsRegistry` → `unitManager.customItemsRegistry`
- `customItemsLoaded` → `unitManager.customItemsLoaded`
- `loadCustomItems()` → `unitManager.loadCustomItems()`
- `getUnitDef(type)` → `unitManager.getUnitDef(type)`
- `createUnitMesh(...)` → `unitManager.createChibiMesh(...)` (adapt call signature)
- `createCustomMesh(...)` → `unitManager.createCustomMesh(...)`
- `addSelectionVisual(u)` → `unitManager.addSelectionVisual(u)`

- [ ] **Step 3: Verify**

Run: `npm run dev`
Expected: All unit types placeable (boss, add, elite, summoned, mobGroup, tank, healer, dps, etc.). Custom items load and placeable. Unit selection, drag, and deletion work. Transform panel shows correct values.

---

### Task 8: Extract AnnotationManager.js

**Files:**
- Create: `src/AnnotationManager.js`
- Modify: `index.js:1011-1088` (annotation creation), `index.js:904-1010` (annotation edit panel)

- [ ] **Step 1: Create src/AnnotationManager.js**

```js
// src/AnnotationManager.js
import * as THREE from 'three';

export class AnnotationManager {
  constructor(sceneManager, dataStore) {
    this.sceneManager = sceneManager;
    this.dataStore = dataStore;
    this.meshes = [];
  }

  createArrowAnnotation(startPos, endPos, color) {
    // Extract createArrowAnnotation() from index.js lines 1011-1040
    // Exact same code, return the Group
  }

  createZoneAnnotation(center, radius, color, label) {
    // Extract createZoneAnnotation() from index.js lines 1041-1070
  }

  createLabelAnnotation(position, text) {
    // Extract createLabelAnnotation() from index.js lines 1071-1088
  }

  createTextSprite(text, color) {
    // Extract createTextSprite() — canvas-based sprite
  }

  selectAnnotation(mesh) {
    this.dataStore.selectedAnnotation = mesh;
    // Add selection visual
  }

  deselectAnnotation() {
    this.dataStore.selectedAnnotation = null;
    // Clear selection visuals
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
```

- [ ] **Step 2: Wire into index.js**

Add import and initialization:
```js
import { AnnotationManager } from './src/AnnotationManager.js';
const annotationManager = new AnnotationManager(sceneManager, dataStore);
```

Replace:
- `annotationMeshes` → `annotationManager.meshes`
- `createArrowAnnotation(...)` → `annotationManager.createArrowAnnotation(...)`
- `createZoneAnnotation(...)` → `annotationManager.createZoneAnnotation(...)`
- `createLabelAnnotation(...)` → `annotationManager.createLabelAnnotation(...)`
- `createTextSprite(...)` → `annotationManager.createTextSprite(...)`

- [ ] **Step 3: Verify**

Run: `npm run dev`
Expected: Arrow creation (click-drag) works. Zone creation works. Label creation works. Annotation selection and deletion work. Color editing works.

---

### Task 9: Extract PhaseManager.js

**Files:**
- Create: `src/PhaseManager.js`
- Modify: `index.js:440-441` (phase helpers), `index.js:1090-1140` (save/load/clear/switch)

- [ ] **Step 1: Create src/PhaseManager.js**

```js
// src/PhaseManager.js
import * as THREE from 'three';

export class PhaseManager {
  constructor(dataStore, unitManager, annotationManager, sceneManager) {
    this.dataStore = dataStore;
    this.unitManager = unitManager;
    this.annotationManager = annotationManager;
    this.sceneManager = sceneManager;
    this.animating = false;
  }

  switchPhase(index) {
    if (this.animating) return;
    // Save current state
    this.dataStore.savePhaseState(this.unitManager.meshes, this.annotationManager.meshes);

    const prevIndex = this.dataStore.currentPhase;
    if (!this.dataStore.switchPhase(index)) return;

    // Animate transition
    this.#animateTransition(prevIndex, index);
  }

  addPhase(name) { this.dataStore.addPhase(name); }
  removePhase(index) { this.dataStore.removePhase(index); }

  startAutoPlay() {
    // Extract auto-play logic from index.js phase demo section
    // Cycles through phases with animatePhaseTransition
  }

  #animateTransition(fromIndex, toIndex) {
    // Extract animatePhaseTransition() from index.js
    // Lerp units between old and new positions with arc effect
  }

  clearSceneObjects() {
    this.unitManager.meshes.forEach(m => this.sceneManager.getScene().remove(m));
    this.unitManager.meshes.length = 0;
    this.unitManager.labelSprites.forEach(s => this.sceneManager.getScene().remove(s));
    this.unitManager.labelSprites.length = 0;
    this.annotationManager.meshes.forEach(a => this.sceneManager.getScene().remove(a));
    this.annotationManager.meshes.length = 0;
  }
}
```

- [ ] **Step 2: Wire into index.js**

```js
import { PhaseManager } from './src/PhaseManager.js';
const phaseManager = new PhaseManager(dataStore, unitManager, annotationManager, sceneManager);
```

Replace:
- `saveCurrentState()` → handled by PhaseManager
- `clearSceneObjects()` → `phaseManager.clearSceneObjects()`
- `loadPhaseState(phase)` → `phaseManager.loadPhaseState(phase)` (or inline in PhaseManager)
- Phase switching and auto-play logic → `phaseManager.switchPhase(index)` / `phaseManager.startAutoPlay()`

- [ ] **Step 3: Verify**

Run: `npm run dev`
Expected: Phase switching works with animation. Add/remove phases works. Auto-play demo cycles through phases. Units persist correctly across phase switches.

---

### Task 10: Extract ViewpointManager.js

**Files:**
- Create: `src/ViewpointManager.js`
- Modify: `index.js:64-98` (viewpoint management)

- [ ] **Step 1: Create src/ViewpointManager.js**

```js
// src/ViewpointManager.js
export class ViewpointManager {
  constructor(sceneManager, dataStore) {
    this.sceneManager = sceneManager;
    this.dataStore = dataStore;
  }

  getCurrentCameraState() {
    const cam = this.sceneManager.getCamera();
    const ctrl = this.sceneManager.getControls();
    return {
      pos: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
      target: { x: ctrl.target.x, y: ctrl.target.y, z: ctrl.target.z },
      quaternion: { x: cam.quaternion.x, y: cam.quaternion.y, z: cam.quaternion.z, w: cam.quaternion.w }
    };
  }

  saveViewpoint(name, groupId) {
    const sd = this.dataStore.getCurrentSceneData();
    if (!sd) return;
    if (!sd.viewpointGroups) {
      sd.viewpointGroups = [{ id: 'vp_default', name: '📌 常用视角', collapsed: false, viewpoints: [] }];
    }
    const id = `vp_${Date.now()}`;
    const vp = { id, name, ...this.getCurrentCameraState() };
    const group = sd.viewpointGroups.find(g => g.id === groupId) || sd.viewpointGroups[0];
    if (!group.viewpoints) group.viewpoints = [];
    group.viewpoints.push(vp);
    return vp;
  }

  jumpToViewpoint(vp) {
    if (this.sceneManager.freeRoamMode) this.sceneManager.toggleFreeRoam();
    const cam = this.sceneManager.getCamera();
    const ctrl = this.sceneManager.getControls();
    cam.position.set(vp.pos.x, vp.pos.y, vp.pos.z);
    ctrl.target.set(vp.target.x, vp.target.y, vp.target.z);
    if (vp.quaternion) cam.quaternion.set(vp.quaternion.x, vp.quaternion.y, vp.quaternion.z, vp.quaternion.w);
    ctrl.update();
  }

  addGroup(name) { /* ... */ }
  removeGroup(id) { /* ... */ }
  deleteViewpoint(groupId, vpId) { /* ... */ }
  reorderViewpoints(groupId, fromIndex, toIndex) { /* ... */ }
}
```

- [ ] **Step 2: Wire into index.js**

```js
import { ViewpointManager } from './src/ViewpointManager.js';
const viewpointManager = new ViewpointManager(sceneManager, dataStore);
```

Replace all viewpoint-related global functions with ViewpointManager method calls.

- [ ] **Step 3: Verify**

Run: `npm run dev`
Expected: Save viewpoint works. Jump to viewpoint restores exact camera position. Viewpoint groups work. Drag-and-drop reorder works.

---

### Task 11: Extract InteractionManager.js

**Files:**
- Create: `src/InteractionManager.js`
- Modify: `index.js:1435-1494` (raycasting), `index.js:1496-1761` (events)

- [ ] **Step 1: Create src/InteractionManager.js**

```js
// src/InteractionManager.js
import * as THREE from 'three';

export class InteractionManager {
  constructor(sceneManager, unitManager, annotationManager, modelManager, dataStore) {
    this.sceneManager = sceneManager;
    this.unitManager = unitManager;
    this.annotationManager = annotationManager;
    this.modelManager = modelManager;
    this.dataStore = dataStore;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.isDragging = false;
    this.dragTarget = null;
    this.arrowStart = null;
  }

  // --- Hit Testing ---
  getSceneIntersect(event) {
    // Extract from index.js getSceneIntersect
    // Hits model meshes first, falls back to ground plane
  }

  getUnitIntersect(event) {
    // Extract from index.js getUnitIntersect
  }

  getAnnotationIntersect(event) {
    // Extract from index.js getAnnotationIntersect
  }

  // --- Event Handlers ---
  bindEvents(rendererDomElement, uiCallbacks) {
    // Extract bindEvents() from index.js
    // mousedown, mousemove, mouseup, click, contextmenu, keydown, keyup, resize
    // uiCallbacks provides: onUnitPlaced, onAnnotationCreated, etc.
  }

  handleClick(event) { /* ... */ }
  handleMouseMove(event) { /* hover detection, drag updates */ }
  handleMouseDown(event) { /* start drag / arrow placement */ }
  handleMouseUp(event) { /* end drag / complete arrow */ }
  handleKeyDown(event) { /* WASD, Escape, Delete */ }
  handleKeyUp(event) { /* release movement keys */ }
}
```

- [ ] **Step 2: Wire into index.js**

```js
import { InteractionManager } from './src/InteractionManager.js';
const interactionManager = new InteractionManager(sceneManager, unitManager, annotationManager, modelManager, dataStore);
interactionManager.bindEvents(sceneManager.getRenderer().domElement, {
  onUnitPlaced: (type, x, z) => { /* ... */ },
  onAnnotationCreated: (type, data) => { /* ... */ },
  // etc.
});
```

Replace:
- `raycaster`, `mouse` → `interactionManager.raycaster`, `interactionManager.mouse`
- `bindEvents()` → `interactionManager.bindEvents()`
- All raycasting functions → `interactionManager.*`
- `isDragging`, `dragTarget`, `arrowStart` → `interactionManager.*`

- [ ] **Step 3: Verify**

Run: `npm run dev`
Expected: Click to place units works. Drag to move units works. Hover highlights. Click annotations to select. WASD free-roam works. Escape cancels placement.

---

### Task 12: Extract UIManager.js + App.js assembly

**Files:**
- Create: `src/UIManager.js`
- Create: `src/App.js`
- Modify: `index.html` (update entry to `/src/App.js`)
- Remove: `index.js`

- [ ] **Step 1: Create src/UIManager.js**

```js
// src/UIManager.js
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

    // Sidebar state
    this.sidebarCollapsed = false;
    this.navSections = {
      scenes: { open: true, active: true },
      view: { open: false, active: false },
      viewpoints: { open: false, active: false },
      units: { open: false, active: false },
      annotate: { open: false, active: false }
    };
  }

  buildUI() {
    this.#injectStyles();
    this.#buildSidebar();
    this.#buildPhaseBar();
    this.#buildUnitListPanel();
    // ... rest of DOM construction from index.js buildUI()
  }

  showToast(msg) {
    // Extract showToast from index.js
  }

  // --- Private methods ---
  #injectStyles() { /* ... extract buildUI() CSS <style> block ... */ }
  #buildSidebar() { /* ... */ }
  #buildRail() { /* ... */ }
  #renderSceneSelector() { /* ... */ }
  #renderViewTools() { /* ... */ }
  #renderViewpointSelector() { /* ... */ }
  #renderUnitPalette() { /* ... */ }
  #renderAnnotationTools() { /* ... */ }
  #buildPhaseBar() { /* ... */ }
  #buildUnitListPanel() { /* ... */ }
  #showTransformPanel(unit) { /* ... */ }
  #showAnnotationEditPanel(ann, x, y) { /* ... */ }
  // ... all other render* / build* functions from index.js UI section
}
```

**Note:** The UIManager is ~1500 lines of DOM code. Extract the entire UI section (lines 1795-3302) from index.js verbatim, changing only:
- Global variable references → `this.deps.moduleName.xxx`
- Function declarations → private methods

- [ ] **Step 2: Create src/App.js**

```js
// src/App.js
import * as THREE from 'three';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import naxx01Glb from './map/naxx-01.glb?url';
import naxx02Glb from './map/naxx-02.glb?url';

import { DataStore } from './DataStore.js';
import { SceneManager } from './SceneManager.js';
import { ModelManager } from './ModelManager.js';
import { ClipPlaneManager } from './ClipPlaneManager.js';
import { UnitManager } from './UnitManager.js';
import { AnnotationManager } from './AnnotationManager.js';
import { PhaseManager } from './PhaseManager.js';
import { ViewpointManager } from './ViewpointManager.js';
import { InteractionManager } from './InteractionManager.js';
import { UIManager } from './UIManager.js';

export class App {
  constructor() {
    // 1. Data layer (no deps)
    this.dataStore = new DataStore([
      { id: 'raid1', name: '🏰 团队副本', collapsed: false, scenes: [
        { id: 'scene01', name: '场景01' },
        { id: 'scene02', name: '场景02' }
      ] },
      { id: 'dungeon1', name: '⚔️ 大秘境', collapsed: false, scenes: [] },
      { id: 'pvp1', name: '🛡️ PvP战场', collapsed: true, scenes: [] }
    ]);

    this.dataStore.initSceneData('scene01', '场景01', { dataUrl: naxx01Glb, fileName: 'naxx-01.glb', type: 'glb' });
    this.dataStore.initSceneData('scene02', '场景02', { dataUrl: naxx02Glb, fileName: 'naxx-02.glb', type: 'glb' });
    this.dataStore.currentSceneId = 'scene01';

    // 2. Rendering layer
    this.sceneManager = new SceneManager();
    this.modelManager = new ModelManager(this.sceneManager, this.dataStore);
    this.clipPlaneManager = new ClipPlaneManager(this.sceneManager, this.modelManager);

    // 3. Domain layer
    const tgaLoader = new TGALoader();
    this.unitManager = new UnitManager(this.sceneManager, this.dataStore, this.modelManager, tgaLoader);
    this.annotationManager = new AnnotationManager(this.sceneManager, this.dataStore);
    this.phaseManager = new PhaseManager(this.dataStore, this.unitManager, this.annotationManager, this.sceneManager);
    this.viewpointManager = new ViewpointManager(this.sceneManager, this.dataStore);

    // 4. Interaction layer
    this.interactionManager = new InteractionManager(
      this.sceneManager, this.unitManager, this.annotationManager,
      this.modelManager, this.dataStore
    );

    // 5. UI layer
    this.uiManager = new UIManager({
      dataStore: this.dataStore,
      sceneManager: this.sceneManager,
      unitManager: this.unitManager,
      annotationManager: this.annotationManager,
      phaseManager: this.phaseManager,
      viewpointManager: this.viewpointManager,
      modelManager: this.modelManager,
      clipPlaneManager: this.clipPlaneManager,
      interactionManager: this.interactionManager
    });
  }

  async start() {
    // Init rendering
    this.sceneManager.init();

    // Wire free-roam mouse
    document.addEventListener('mousemove', (e) => {
      this.sceneManager.handleMouseMoveForFreeRoam(e);
    });

    // Build UI
    this.uiManager.buildUI();

    // Bind events
    this.interactionManager.bindEvents(this.sceneManager.getRenderer().domElement);

    // Load model
    const sd = this.dataStore.getCurrentSceneData();
    if (sd.model) {
      this.modelManager.loadModelIntoScene(sd.model);
    }

    // Load custom items
    await this.unitManager.loadCustomItems();
    this.uiManager.populateCustomGrid();

    // Start render loop
    this.sceneManager.getRenderer().setAnimationLoop(() => {
      this.sceneManager.animate(
        this.unitManager.meshes,
        this.annotationManager.meshes,
        this.dataStore.selectedUnit
      );
    });
  }
}

// Boot
new App().start();
```

- [ ] **Step 3: Update index.html entry**

Change:
```html
<script type="module" src="/index.js"></script>
```
To:
```html
<script type="module" src="/src/App.js"></script>
```

- [ ] **Step 4: Delete index.js**

```bash
rm index.js
```

- [ ] **Step 5: Verify full regression**

Run: `npm run dev`

Manual test checklist:
1. App loads without errors in console
2. 3D scene renders with Naxxramas model
3. Unit palette shows all categories (monsters/players/custom)
4. Place boss — click boss card, click scene, unit appears
5. Place tank, healer, DPS — all render correctly
6. Place custom items — TGA icons load and display
7. Select unit — pulse animation + selection ring visible
8. Drag unit to new position — surface snapping works
9. Transform panel — edit position/rotation/scale values
10. Create arrow annotation — click-drag to draw
11. Create zone annotation — circle with label
12. Create label annotation — text sprite at position
13. Edit annotation — click to select, edit panel appears
14. Add phase, switch phases — animation plays
15. Auto-play demo — cycles through phases
16. Save viewpoint, jump to viewpoint — camera restores
17. Free-roam mode — WASD/QE movement, pointer lock
18. Clip plane — toggle, adjust height slider
19. Brightness slider — lighting adjusts
20. Export scene to JSON, import scene from JSON
21. Model upload — drag .glb file to upload zone

Run: `npm run build`
Expected: Production build succeeds without errors.

---

## Summary

| Task | Files Created | Lines (approx) |
|------|--------------|----------------|
| 1. Switch Three.js | — | — (modify 2 files) |
| 2. Constants.js | src/Constants.js | ~90 |
| 3. DataStore.js | src/DataStore.js | ~160 |
| 4. SceneManager.js | src/SceneManager.js | ~230 |
| 5. ModelManager.js | src/ModelManager.js | ~150 |
| 6. ClipPlaneManager.js | src/ClipPlaneManager.js | ~100 |
| 7. UnitManager.js | src/UnitManager.js | ~500 |
| 8. AnnotationManager.js | src/AnnotationManager.js | ~150 |
| 9. PhaseManager.js | src/PhaseManager.js | ~100 |
| 10. ViewpointManager.js | src/ViewpointManager.js | ~60 |
| 11. InteractionManager.js | src/InteractionManager.js | ~200 |
| 12. UIManager + App | src/UIManager.js (~900), src/App.js (~100) | ~1000 |
| **Total** | **12 new files** | **~2640** |
