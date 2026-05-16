import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import naxx01Glb from './src/map/naxx-01.glb?url';
import naxx02Glb from './src/map/naxx-02.glb?url';
import { UNIT_CATEGORIES, CUSTOM_ITEM_DEFS, DEFAULT_GROUND_WIDTH, DEFAULT_GROUND_HEIGHT } from './src/Constants.js';

// ============================================================
//  WoW-Style 3D Raid Tactics Planner
//  Two-level hierarchy: Group → BattleScene
//  Layered unit system: Monster / Player (Role / Class)
// ============================================================

// ─── GLOBALS ────────────────────────────────────────────────
let scene, camera, renderer, controls, raycaster, mouse, clock;
let groundPlane, gridHelper, borderLines;
let currentPhase = 0;
let selectedUnit = null;
let selectedAnnotation = null;
let placementMode = null;
let hoveredUnit = null;
let hoveredAnnotation = null;
let arrowStart = null;
let animating = false;
let isDragging = false;
let dragTarget = null;
let brightness = 1.2;

let groundWidth = DEFAULT_GROUND_WIDTH;
let groundHeight = DEFAULT_GROUND_HEIGHT;

// ─── CLIPPING PLANE STATE ──────────────────────────────────
let clipEnabled = false;
let clipHeight = 100;
let clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 100);
let clipPlaneHelper = null;
let clipModelMinY = 0;
let clipModelMaxY = 100;

// ─── FREE ROAM STATE ───────────────────────────────────────
let freeRoamMode = false;
let freeRoamSpeed = 5;
let freeRoamEuler = new THREE.Euler(0, 0, 0, 'YXZ');
let isPointerLocked = false;
const keys = { w: false, a: false, s: false, d: false, q: false, e: false, shift: false };

const unitMeshes = [];
const unitLabelSprites = [];
const annotationMeshes = [];
let currentSceneModel = null;

// ─── SIDEBAR STATE ─────────────────────────────────────────
let sidebarCollapsed = false;
let navSections = {
  scenes: { open: true, active: true },
  view: { open: false, active: false },
  viewpoints: { open: false, active: false },
  units: { open: false, active: false },
  annotate: { open: false, active: false }
};

// ─── VIEWPOINT MANAGEMENT ──────────────────────────────────
function getCurrentViewpointGroups() {
  const sd = getCurrentSceneData();
  return sd?.viewpointGroups || [];
}

function getCurrentCameraState() {
  return {
    pos: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
    quaternion: { x: camera.quaternion.x, y: camera.quaternion.y, z: camera.quaternion.z, w: camera.quaternion.w }
  };
}

function jumpToViewpoint(vp) {
  if (freeRoamMode) toggleFreeRoamMode();
  camera.position.set(vp.pos.x, vp.pos.y, vp.pos.z);
  controls.target.set(vp.target.x, vp.target.y, vp.target.z);
  if (vp.quaternion) camera.quaternion.set(vp.quaternion.x, vp.quaternion.y, vp.quaternion.z, vp.quaternion.w);
  controls.update();
  showToast(`📷 ${vp.name}`);
}

function saveCurrentViewpoint(name) {
  const sd = getCurrentSceneData();
  if (!sd) return;
  if (!sd.viewpointGroups) sd.viewpointGroups = [{ id: 'vp_default', name: '📌 常用视角', collapsed: false, viewpoints: [] }];
  const id = `vp_${Date.now()}`;
  const vp = { id, name, ...getCurrentCameraState() };
  const group = sd.viewpointGroups.find(g => g.id === 'vp_default') || sd.viewpointGroups[0];
  if (!group.viewpoints) group.viewpoints = [];
  group.viewpoints.push(vp);
  renderViewpointSelector();
  return vp;
}

// ─── UNIT CLASSIFICATION MODE ──────────────────────────────
let playerViewMode = 'role'; // 'role' or 'class'

// ─── CUSTOM ITEMS REGISTRY ────────────────────────────────
const customItemsRegistry = {};
let customItemsLoaded = false;

// ─── LOAD CUSTOM ITEMS ──────────────────────────────────────
async function loadCustomItems() {
  if (customItemsLoaded) return;

  for (const item of CUSTOM_ITEM_DEFS) {
    try {
      const texture = await new Promise((resolve, reject) => {
        tgaLoader.load(`/src/icons/${item.filename}.tga`, resolve, undefined, reject);
      });
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.flipY = false;

      customItemsRegistry[item.filename] = {
        label: item.label,
        icon: '🎒',
        color: item.color,
        texture: texture
      };
    } catch (err) {
      console.warn(`加载 ${item.filename}.tga 失败:`, err);
    }
  }

  customItemsLoaded = true;
  console.log('自定义物品已加载:', Object.keys(customItemsRegistry));
}

// ─── TWO-LEVEL SCENE SYSTEM ────────────────────────────────
let currentSceneId = 'scene01';
let sceneGroups = [
  { id: 'raid1', name: '🏰 团队副本', collapsed: false, scenes: [
    { id: 'scene01', name: '场景01' },
    { id: 'scene02', name: '场景02' }
  ] },
  { id: 'dungeon1', name: '⚔️ 大秘境', collapsed: false, scenes: [] },
  { id: 'pvp1', name: '🛡️ PvP战场', collapsed: true, scenes: [] }
];

const sceneDataStore = {};

function initSceneData(sceneId, name, modelInfo) {
  if (!sceneDataStore[sceneId]) {
    sceneDataStore[sceneId] = {
      name: name || '未命名场景', model: modelInfo || null,
      phases: [
        { name: '阶段 1', units: [], annotations: [] },
      ],
      currentPhase: 0, modelBounds: null,
      viewpointGroups: [
        { id: 'vp_default', name: '📌 常用视角', collapsed: false, viewpoints: [] }
      ]
    };
  }
  return sceneDataStore[sceneId];
}

(function initDefaultScenes() {
  initSceneData('scene01', '场景01', { dataUrl: naxx01Glb, fileName: 'naxx-01.glb', type: 'glb' });
  initSceneData('scene02', '场景02', { dataUrl: naxx02Glb, fileName: 'naxx-02.glb', type: 'glb' });
})();

function getCurrentSceneData() { return sceneDataStore[currentSceneId]; }

// ─── LOADERS ────────────────────────────────────────────────
const fbxLoader = new FBXLoader();
const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
gltfLoader.setDRACOLoader(dracoLoader);
const tgaLoader = new TGALoader();

// ─── INIT ───────────────────────────────────────────────────
function init() {
  clock = new THREE.Clock();
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0e17);
  scene.fog = new THREE.FogExp2(0x0a0e17, 0.001);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 80, 60);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.LinearToneMapping;
  renderer.toneMappingExposure = brightness;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.localClippingEnabled = true;
  const root = document.getElementById('root') ?? document.body;
  root.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.minDistance = 5; controls.maxDistance = 500;
  controls.target.set(0, 0, 0);

  renderer.domElement.addEventListener('click', () => {
    if (freeRoamMode && !isPointerLocked) renderer.domElement.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    isPointerLocked = document.pointerLockElement === renderer.domElement;
    if (!isPointerLocked && freeRoamMode) showToast('🖱️ 点击场景重新锁定视角');
  });
  document.addEventListener('mousemove', (e) => {
    if (!freeRoamMode || !isPointerLocked) return;
    const sensitivity = 0.002;
    freeRoamEuler.setFromQuaternion(camera.quaternion);
    freeRoamEuler.y -= e.movementX * sensitivity;
    freeRoamEuler.x -= e.movementY * sensitivity;
    freeRoamEuler.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, freeRoamEuler.x));
    camera.quaternion.setFromEuler(freeRoamEuler);
  });

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  createLighting();
  createGround(60, 60);
  createEnvironmentDecor();
  buildUI();
  bindEvents();

  const sd = getCurrentSceneData();
  if (sd.model) loadModelIntoScene(sd.model);

  renderer.setAnimationLoop(animate);

  // 加载自定义物品
  loadCustomItems().then(() => {
    populateCustomGrid();
  });
}

// ─── LIGHTING ───────────────────────────────────────────────
function createLighting() {
  const ambient = new THREE.AmbientLight(0xffffff, 2.0); ambient.name = 'ambientLight'; scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xfff5e6, 3.0); dirLight.name = 'dirLight';
  dirLight.position.set(40, 80, 40); dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.left = -80; dirLight.shadow.camera.right = 80;
  dirLight.shadow.camera.top = 80; dirLight.shadow.camera.bottom = -80;
  dirLight.shadow.camera.near = 1; dirLight.shadow.camera.far = 300;
  dirLight.shadow.bias = -0.0005; dirLight.shadow.normalBias = 0.04;
  scene.add(dirLight);
  const d2 = new THREE.DirectionalLight(0xaaccff, 1.5); d2.name = 'dirLight2'; d2.position.set(-30, 50, -30); scene.add(d2);
  const d3 = new THREE.DirectionalLight(0x8899bb, 0.8); d3.name = 'dirLight3'; d3.position.set(0, -20, 0); scene.add(d3);
  const hemi = new THREE.HemisphereLight(0xddeeff, 0x667788, 1.8); hemi.name = 'hemiLight'; scene.add(hemi);
  [[-40, 25, -40, 0xccaaff], [40, 25, 40, 0xaaccff], [40, 25, -40, 0xffeedd], [-40, 25, 40, 0xddffee]].forEach(([x, y, z, c], i) => {
    const pl = new THREE.PointLight(c, 1.1, 200); pl.name = `fillLight${i + 1}`; pl.position.set(x, y, z); scene.add(pl);
  });
}

// ─── GROUND ─────────────────────────────────────────────────
function createGround(w, h) {
  if (groundPlane) scene.remove(groundPlane);
  if (gridHelper) scene.remove(gridHelper);
  if (borderLines) scene.remove(borderLines);
  groundWidth = w; groundHeight = h;

  const geo = new THREE.PlaneGeometry(w, h, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a4060, roughness: 0.8, metalness: 0, transparent: true, opacity: 0.08 });
  groundPlane = new THREE.Mesh(geo, mat); groundPlane.name = 'groundPlane';
  groundPlane.rotation.x = -Math.PI / 2; groundPlane.receiveShadow = true; scene.add(groundPlane);

  const gridDiv = Math.max(Math.round(Math.max(w, h) / 2), 10);
  const gridSize = Math.max(w, h);
  gridHelper = new THREE.GridHelper(gridSize, gridDiv, 0x4a5080, 0x2a3050);
  gridHelper.name = 'gridHelper'; gridHelper.position.y = 0.02;
  gridHelper.material.opacity = 0.2; gridHelper.material.transparent = true; scene.add(gridHelper);

  const bGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, h));
  const bMat = new THREE.LineBasicMaterial({ color: 0x6633cc, transparent: true, opacity: 0.4 });
  borderLines = new THREE.LineSegments(bGeo, bMat); borderLines.name = 'borderLines';
  borderLines.rotation.x = -Math.PI / 2; borderLines.position.y = 0.04; scene.add(borderLines);
}

// ─── MODEL LOADING ──────────────────────────────────────────
function loadModelIntoScene(modelInfo, callback) {
  if (!modelInfo || !modelInfo.dataUrl) { if (callback) callback(); return; }
  if (currentSceneModel) { scene.remove(currentSceneModel); currentSceneModel = null; }
  showToast('⏳ 正在加载3D模型...');

  const onLoaded = (object) => {
    const model = object.scene ? object.scene : object;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scaleFactor = maxDim > 0 ? 60 / maxDim : 1;
    model.scale.multiplyScalar(scaleFactor);
    box.setFromObject(model); box.getSize(size); box.getCenter(center);
    model.position.x -= center.x; model.position.z -= center.z; model.position.y -= box.min.y;

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true; child.receiveShadow = true;
        if (child.geometry) { if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals(); child.geometry.computeBoundingSphere(); }
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        const fixedMats = mats.map(m => {
          const nm = new THREE.MeshStandardMaterial();
          if (m.color) { const c = m.color; nm.color.set((c.r < 0.05 && c.g < 0.05 && c.b < 0.05) ? 0x888888 : c); } else nm.color.set(0xaaaaaa);
          if (m.map) { nm.map = m.map; nm.map.colorSpace = THREE.SRGBColorSpace; nm.map.needsUpdate = true; }
          if (m.normalMap) nm.normalMap = m.normalMap;
          if (m.emissive && (m.emissive.r > 0 || m.emissive.g > 0 || m.emissive.b > 0)) {
            nm.emissive.copy(m.emissive); nm.emissiveIntensity = m.emissiveIntensity || 0.5;
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

    model.name = 'sceneModel'; scene.add(model); currentSceneModel = model;
    const sd = getCurrentSceneData();
    if (sd) sd.modelBounds = { sizeX: size.x, sizeY: size.y, sizeZ: size.z };
    const finalBox = new THREE.Box3().setFromObject(model);
    clipModelMinY = finalBox.min.y; clipModelMaxY = finalBox.max.y;
    clipHeight = clipModelMaxY + 1; clipPlane.constant = clipHeight; updateClipSliderRange();
    const footW = Math.max(size.x * 1.3, 20), footH = Math.max(size.z * 1.3, 20);
    createGround(footW, footH);
    const dirLight = scene.getObjectByName('dirLight');
    if (dirLight) {
      const maxExt = Math.max(footW, footH) * 0.6;
      dirLight.shadow.camera.left = -maxExt; dirLight.shadow.camera.right = maxExt;
      dirLight.shadow.camera.top = maxExt; dirLight.shadow.camera.bottom = -maxExt;
      dirLight.shadow.camera.far = size.y * 3 + 100; dirLight.shadow.camera.updateProjectionMatrix();
    }
    const diagSize = Math.sqrt(footW * footW + footH * footH);
    camera.position.set(0, diagSize * 0.7, diagSize * 0.5);
    camera.lookAt(0, size.y * 0.3, 0);
    controls.target.set(0, size.y * 0.3, 0); controls.update();
    showToast(`✅ 模型已加载: ${modelInfo.fileName}`);
    renderSceneSelector();
    if (callback) callback();
  };

  const onError = (err) => { console.error('Model load error:', err); showToast('❌ 模型加载失败'); if (callback) callback(); };
  const onProgress = (xhr) => { if (xhr.total > 0) showToast(`⏳ 加载模型... ${Math.round(xhr.loaded / xhr.total * 100)}%`); };

  if (modelInfo.type === 'glb' || modelInfo.type === 'gltf') gltfLoader.load(modelInfo.dataUrl, onLoaded, onProgress, onError);
  else fbxLoader.load(modelInfo.dataUrl, onLoaded, onProgress, onError);
}

// ─── ENVIRONMENT ────────────────────────────────────────────
function createEnvironmentDecor() {
  const pc = 150, geo = new THREE.BufferGeometry();
  const pos = new Float32Array(pc * 3), col = new Float32Array(pc * 3);
  for (let i = 0; i < pc; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 120; pos[i * 3 + 1] = Math.random() * 40 + 5; pos[i * 3 + 2] = (Math.random() - 0.5) * 120;
    const c = new THREE.Color().setHSL(0.7 + Math.random() * 0.15, 0.8, 0.6);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 0.15, vertexColors: true, transparent: true, opacity: 0.4, sizeAttenuation: true });
  const p = new THREE.Points(geo, mat); p.name = 'runeParticles'; scene.add(p);
}

// ─── PHASES ─────────────────────────────────────────────────
function getPhases() { return getCurrentSceneData().phases; }

// ════════════════════════════════════════════════════════════
//  Q版 CHIBI UNIT CREATION — CUTE ROUNDED STYLE
// ════════════════════════════════════════════════════════════
function getUnitDef(type) {
  for (const cat of Object.values(UNIT_CATEGORIES)) {
    if (cat.units && cat.units[type]) return cat.units[type];
  }
  if (customItemsRegistry[type]) {
    return {
      label: customItemsRegistry[type].label,
      icon: customItemsRegistry[type].icon,
      color: customItemsRegistry[type].color,
      desc: '自定义物品'
    };
  }
  return { label: type, icon: '❓', color: 0xaaaaaa, desc: '' };
}

function createChibiMesh(type, color, isMonster) {
  const group = new THREE.Group();
  const c = new THREE.Color(color);
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15, emissive: color, emissiveIntensity: 0.15 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xfce4c8, roughness: 0.5, metalness: 0.05 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.1 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const cheekMat = new THREE.MeshStandardMaterial({ color: 0xffaaaa, roughness: 0.6, transparent: true, opacity: 0.5 });

  if (isMonster) {
    // ─── MONSTER CHIBI ───
    const isBoss = type === 'boss';
    const isElite = type === 'elite';
    const isSummoned = type === 'summoned';
    const bodyScale = isBoss ? 1.3 : 1.0;

    // Round body
    const bodyGeo = new THREE.SphereGeometry(1.1 * bodyScale, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.85);
    const monsterBodyMat = new THREE.MeshStandardMaterial({
      color, roughness: 0.35, metalness: 0.2, emissive: color,
      emissiveIntensity: isBoss ? 0.4 : isSummoned ? 0.5 : 0.2
    });
    const body = new THREE.Mesh(bodyGeo, monsterBodyMat);
    body.position.y = 1.2 * bodyScale; body.castShadow = true; group.add(body);

    // Big head
    const headGeo = new THREE.SphereGeometry(0.85 * bodyScale, 16, 14);
    const head = new THREE.Mesh(headGeo, monsterBodyMat);
    head.position.y = 2.5 * bodyScale; head.castShadow = true; group.add(head);

    // Eyes — angry slant
    [-0.3, 0.3].forEach(xo => {
      const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.2 * bodyScale, 10, 10), whiteMat);
      eyeWhite.position.set(xo * bodyScale, 2.6 * bodyScale, 0.65 * bodyScale);
      eyeWhite.scale.set(1, 0.8, 0.5); group.add(eyeWhite);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.12 * bodyScale, 8, 8),
        new THREE.MeshStandardMaterial({ color: isSummoned ? 0xaa00ff : 0xff2200, emissive: isSummoned ? 0xaa00ff : 0xff2200, emissiveIntensity: 0.8 }));
      pupil.position.set(xo * bodyScale, 2.58 * bodyScale, 0.78 * bodyScale);
      pupil.scale.set(1, 0.8, 0.5); group.add(pupil);
    });

    // Horns for boss
    if (isBoss) {
      const hornMat = new THREE.MeshStandardMaterial({ color: 0x440044, roughness: 0.3, metalness: 0.5 });
      [-0.55, 0.55].forEach(xo => {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8, 6), hornMat);
        horn.position.set(xo, 3.4, -0.1); horn.rotation.z = -xo * 0.5; horn.rotation.x = -0.2;
        horn.castShadow = true; group.add(horn);
      });
    }

    // Spikes for elite
    if (isElite) {
      const spikeMat = new THREE.MeshStandardMaterial({ color: 0xcc3333, emissive: 0xcc3333, emissiveIntensity: 0.3 });
      for (let i = 0; i < 5; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4, 5), spikeMat);
        const angle = (i / 5) * Math.PI * 2;
        spike.position.set(Math.cos(angle) * 0.7, 3.1, Math.sin(angle) * 0.7);
        spike.lookAt(new THREE.Vector3(Math.cos(angle) * 2, 3.5, Math.sin(angle) * 2));
        group.add(spike);
      }
    }

    // Summoned glow ring
    if (isSummoned) {
      const glowGeo = new THREE.TorusGeometry(1.0, 0.06, 8, 32);
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xaa44ff, transparent: true, opacity: 0.5 });
      const ring = new THREE.Mesh(glowGeo, glowMat);
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.5; group.add(ring);
    }

    // Monster Group (mobGroup) - 2 elite + 2 normal mini chibis
    if (type === 'mobGroup') {
      const miniScale = 1.05;
      const eliteColor = 0xef4444;
      const normalColor = 0xf97316;
      const positions = [
        { x: -1.4, z: -1.4, color: eliteColor, isElite: true },
        { x: 1.4, z: -1.4, color: normalColor, isElite: false },
        { x: -1.4, z: 1.4, color: normalColor, isElite: false },
        { x: 1.4, z: 1.4, color: eliteColor, isElite: true },
      ];
      positions.forEach(({ x, z, color: mc, isElite: isMiniElite }) => {
        const miniGroup = new THREE.Group();
        const miniBodyMat = new THREE.MeshStandardMaterial({ color: mc, roughness: 0.35, metalness: 0.2, emissive: mc, emissiveIntensity: 0.2 });
        // Mini body
        const mBody = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), miniBodyMat);
        mBody.position.y = 0.5; miniGroup.add(mBody);
        // Mini head
        const mHead = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 10), miniBodyMat);
        mHead.position.y = 1.1; miniGroup.add(mHead);
        // Mini eyes
        [-0.15, 0.15].forEach(xo => {
          const mEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), whiteMat);
          mEye.position.set(xo, 1.12, 0.3); miniGroup.add(mEye);
          const mPupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6),
            new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 0.8 }));
          mPupil.position.set(xo, 1.1, 0.35); miniGroup.add(mPupil);
        });
        // Mini legs
        [-0.18, 0.18].forEach(xo => {
          const mLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.2, 4, 6), miniBodyMat);
          mLeg.position.set(xo, 0.12, 0); miniGroup.add(mLeg);
        });
        // Elite spikes
        if (isMiniElite) {
          const spikeMat = new THREE.MeshStandardMaterial({ color: 0xcc3333, emissive: 0xcc3333, emissiveIntensity: 0.3 });
          for (let i = 0; i < 5; i++) {
            const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 5), spikeMat);
            const angle = (i / 5) * Math.PI * 2;
            spike.position.set(Math.cos(angle) * 0.35, 1.35, Math.sin(angle) * 0.35);
            spike.lookAt(new THREE.Vector3(Math.cos(angle) * 2, 1.6, Math.sin(angle) * 2));
            miniGroup.add(spike);
          }
        }
        miniGroup.scale.set(miniScale, miniScale, miniScale);
        miniGroup.position.set(x, 0, z);
        group.add(miniGroup);
      });
      return group;
    }

    // Tiny arms
    [-0.9, 0.9].forEach(xo => {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12 * bodyScale, 0.4 * bodyScale, 4, 8), monsterBodyMat);
      arm.position.set(xo * bodyScale, 1.3 * bodyScale, 0);
      arm.rotation.z = -xo * 0.4; arm.castShadow = true; group.add(arm);
    });

    // Tiny legs
    [-0.35, 0.35].forEach(xo => {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.14 * bodyScale, 0.3 * bodyScale, 4, 8), monsterBodyMat);
      leg.position.set(xo * bodyScale, 0.25 * bodyScale, 0); leg.castShadow = true; group.add(leg);
    });

    // Boss glow
    if (isBoss) {
      const glow = new THREE.PointLight(color, 1.2, 10); glow.position.y = 2; group.add(glow);
      const baseRing = new THREE.Mesh(
        new THREE.RingGeometry(1.4, 1.6, 32),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
      );
      baseRing.rotation.x = -Math.PI / 2; baseRing.position.y = 0.05; group.add(baseRing);
    }

    // Mouth — angry frown
    const mouthGeo = new THREE.TorusGeometry(0.18 * bodyScale, 0.03, 8, 12, Math.PI);
    const mouth = new THREE.Mesh(mouthGeo, darkMat);
    mouth.position.set(0, 2.25 * bodyScale, 0.72 * bodyScale);
    mouth.rotation.x = Math.PI; group.add(mouth);

  } else {
    // ─── PLAYER CHIBI ───
    // Round body (tunic)
    const bodyGeo = new THREE.SphereGeometry(0.85, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.85);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.0; body.scale.y = 1.1; body.castShadow = true; group.add(body);

    // Head (skin)
    const headGeo = new THREE.SphereGeometry(0.65, 16, 14);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 2.15; head.castShadow = true; group.add(head);

    // Hair
    const hairColor = [0x3b2507, 0x8b6914, 0xc9510c, 0x1a1a2e, 0xd4a574, 0x6b3a2a][Math.floor(Math.random() * 6)];
    const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.7 });
    const hairGeo = new THREE.SphereGeometry(0.68, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.y = 2.3; group.add(hair);

    // Eyes — big cute
    [-0.22, 0.22].forEach(xo => {
      const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), whiteMat);
      eyeWhite.position.set(xo, 2.22, 0.52); eyeWhite.scale.set(1, 1.2, 0.5); group.add(eyeWhite);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), darkMat);
      pupil.position.set(xo, 2.2, 0.6); pupil.scale.set(1, 1.2, 0.5); group.add(pupil);
      // Highlight
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), whiteMat);
      hl.position.set(xo + 0.05, 2.27, 0.62); group.add(hl);
    });

    // Blush cheeks
    [-0.35, 0.35].forEach(xo => {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), cheekMat);
      cheek.position.set(xo, 2.05, 0.55); cheek.scale.set(1.2, 0.8, 0.5); group.add(cheek);
    });

    // Smile
    const smileGeo = new THREE.TorusGeometry(0.1, 0.02, 8, 12, Math.PI);
    const smile = new THREE.Mesh(smileGeo, darkMat);
    smile.position.set(0, 2.0, 0.58); smile.rotation.z = Math.PI; group.add(smile);

    // Arms (tiny)
    [-0.72, 0.72].forEach(xo => {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.35, 4, 8), skinMat);
      arm.position.set(xo, 1.1, 0); arm.rotation.z = -xo * 0.35; arm.castShadow = true; group.add(arm);
    });

    // Legs
    [-0.25, 0.25].forEach(xo => {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.3, 4, 8), bodyMat);
      leg.position.set(xo, 0.22, 0); leg.castShadow = true; group.add(leg);
      const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), darkMat);
      shoe.position.set(xo, 0.05, 0.04); shoe.scale.set(1, 0.7, 1.3); group.add(shoe);
    });

    // Class-specific accessories
    addClassAccessories(group, type, c, bodyMat);

    // Base ring (class color)
    const baseRing = new THREE.Mesh(
      new THREE.RingGeometry(0.65, 0.75, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    baseRing.rotation.x = -Math.PI / 2; baseRing.position.y = 0.05; group.add(baseRing);
  }

  return group;
}

function addClassAccessories(group, type, color, bodyMat) {
  const accentMat = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.8), roughness: 0.35, metalness: 0.4 });

  switch (type) {
    case 'tank': case 'warrior': case 'deathknight': {
      // Shield on back
      const shieldGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.06, 6);
      const shieldMat = new THREE.MeshStandardMaterial({ color: 0x6688bb, roughness: 0.2, metalness: 0.7 });
      const shield = new THREE.Mesh(shieldGeo, shieldMat);
      shield.position.set(-0.55, 1.3, -0.2); shield.rotation.z = Math.PI / 2; group.add(shield);
      // Sword
      const sword = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.03),
        new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.1 }));
      sword.position.set(0.6, 1.4, -0.15); sword.rotation.z = 0.3; group.add(sword);
      break;
    }
    case 'healer': case 'priest': {
      // Halo
      const haloGeo = new THREE.TorusGeometry(0.35, 0.04, 8, 24);
      const haloMat = new THREE.MeshStandardMaterial({ color: 0xffdd44, emissive: 0xffdd44, emissiveIntensity: 0.6 });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.y = 3.0; halo.rotation.x = -Math.PI / 2; group.add(halo);
      // Glow
      const gl = new THREE.PointLight(0x44ff88, 0.5, 6); gl.position.y = 2.5; group.add(gl);
      break;
    }
    case 'dps': case 'rogue': {
      // Dual daggers
      [-0.5, 0.5].forEach(xo => {
        const dagger = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.5, 4),
          new THREE.MeshStandardMaterial({ color: 0xaaaacc, metalness: 0.8, roughness: 0.1 }));
        dagger.position.set(xo * 1.1, 0.8, 0.1); dagger.rotation.z = xo * 0.6; group.add(dagger);
      });
      break;
    }
    case 'paladin': {
      // Glowing hammer
      const hamHead = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.3),
        new THREE.MeshStandardMaterial({ color: 0xf0c060, metalness: 0.6, roughness: 0.2 }));
      hamHead.position.set(0.65, 1.8, -0.1); group.add(hamHead);
      const hamHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6),
        new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.6 }));
      hamHandle.position.set(0.65, 1.4, -0.1); group.add(hamHandle);
      const gl = new THREE.PointLight(0xffcc44, 0.4, 5); gl.position.set(0.65, 1.8, 0); group.add(gl);
      break;
    }
    case 'hunter': {
      // Bow
      const bowGeo = new THREE.TorusGeometry(0.35, 0.03, 6, 12, Math.PI);
      const bow = new THREE.Mesh(bowGeo, new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.5 }));
      bow.position.set(-0.55, 1.5, 0); bow.rotation.y = Math.PI / 2; group.add(bow);
      // Pet paw mark
      const pawMat = new THREE.MeshBasicMaterial({ color: 0xabd473, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
      const paw = new THREE.Mesh(new THREE.CircleGeometry(0.2, 8), pawMat);
      paw.rotation.x = -Math.PI / 2; paw.position.set(0.6, 0.06, 0.4); group.add(paw);
      break;
    }
    case 'shaman': {
      // Totems
      const totemMat = new THREE.MeshStandardMaterial({ color: 0x0070de, emissive: 0x0070de, emissiveIntensity: 0.3 });
      for (let i = 0; i < 3; i++) {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.3, 6), totemMat);
        t.position.set(-0.5 + i * 0.4, 0.15, 0.65); group.add(t);
      }
      break;
    }
    case 'druid': {
      // Leaf crown
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x44aa22, emissive: 0x228800, emissiveIntensity: 0.2 });
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), leafMat);
        leaf.position.set(Math.cos(angle) * 0.45, 2.7, Math.sin(angle) * 0.45);
        leaf.scale.set(1.5, 0.6, 1); group.add(leaf);
      }
      break;
    }
    case 'mage': {
      // Staff with orb
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6),
        new THREE.MeshStandardMaterial({ color: 0x6644aa, roughness: 0.4 }));
      staff.position.set(0.65, 1.2, -0.1); group.add(staff);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0x69ccf0, emissive: 0x69ccf0, emissiveIntensity: 0.7, transparent: true, opacity: 0.8 }));
      orb.position.set(0.65, 1.9, -0.1); group.add(orb);
      const gl = new THREE.PointLight(0x69ccf0, 0.6, 5); gl.position.set(0.65, 1.9, 0); group.add(gl);
      break;
    }
    case 'warlock': {
      // Demonic flame
      const flameMat = new THREE.MeshStandardMaterial({ color: 0x9482c9, emissive: 0x6633aa, emissiveIntensity: 0.5, transparent: true, opacity: 0.7 });
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 6), flameMat);
      flame.position.set(0, 3.1, 0); group.add(flame);
      // Dark circle
      const darkCircle = new THREE.Mesh(
        new THREE.RingGeometry(0.55, 0.65, 16),
        new THREE.MeshBasicMaterial({ color: 0x6633aa, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
      );
      darkCircle.rotation.x = -Math.PI / 2; darkCircle.position.y = 0.06; group.add(darkCircle);
      break;
    }
  }
}

function createUnitMesh(type, x, z, label, unitScale) {
  const def = getUnitDef(type);
  const isMonster = !!UNIT_CATEGORIES.monsters.units[type];
  const group = createChibiMesh(type, def.color, isMonster);
  group.name = `unit_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  group.position.set(x, 0, z);
  const s = unitScale !== undefined ? unitScale : 0.1;
  group.scale.set(s, s, s);
  group.userData = { type, label: label || def.label, role: type, isUnit: true, unitScale: s, isMonster };
  scene.add(group);
  unitMeshes.push(group);

  // Label sprite - 作为独立对象添加到场景
  const labelText = label || (def.icon + ' ' + def.label);
  const sprite = createTextSprite(labelText, def.color);
  const spriteOffsetY = 0.5;
  sprite.position.set(x, group.position.y + spriteOffsetY, z);
  sprite.userData.parentUnit = group;
  sprite.userData.offsetY = spriteOffsetY;
  scene.add(sprite);
  unitLabelSprites.push(sprite);

  return group;
}

function createCustomMesh(type, x, z, label, unitScale) {
  const item = customItemsRegistry[type];
  if (!item) {
    console.error(`自定义物品未找到: ${type}`);
    return null;
  }

  // 正方体尺寸
  const sizeX = 2;
  const sizeY = 0.5;
  const sizeZ = 2;

  const geometry = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);

  // 纹理工料 - 顶面应用TGA纹理，其他面使用纯色
  const textureMaterial = new THREE.MeshStandardMaterial({
    map: item.texture,
    transparent: true,
    roughness: 0.7,
    metalness: 0.1
  });
  const sideColor = new THREE.Color(item.color).multiplyScalar(0.6);
  const sideMaterial = new THREE.MeshStandardMaterial({
    color: sideColor,
    roughness: 0.8,
    metalness: 0.1
  });

  // 材质数组: 左右上下前后 - 纹理朝上
  // BoxGeometry顺序: +x, -x, +y, -y, +z, -z
  // +y (index 2) 是顶面，应用纹理
  const materials = [
    sideMaterial,           // 右
    sideMaterial,           // 左
    textureMaterial,        // 上 (应用TGA纹理，朝上)
    sideMaterial,           // 下
    sideMaterial,           // 前
    sideMaterial            // 后
  ];

  const mesh = new THREE.Mesh(geometry, materials);
  mesh.name = `unit_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  mesh.position.set(x, sizeY / 2, z);  // 底部接地

  const s = unitScale !== undefined ? unitScale : 0.1;
  mesh.scale.set(s, s, s);

  const labelText = label || item.label;
  mesh.userData = {
    type: type,
    label: labelText,
    role: type,
    isUnit: true,
    isCustom: true,
    unitScale: s,
    isMonster: false
  };

  scene.add(mesh);
  unitMeshes.push(mesh);

  // Label sprite - 作为独立对象添加到场景
  const sprite = createTextSprite(labelText, item.color);
  const spriteOffsetY = 0.5;
  sprite.position.set(x, mesh.position.y + spriteOffsetY, z);
  sprite.userData.parentUnit = mesh;
  sprite.userData.offsetY = spriteOffsetY;
  scene.add(sprite);
  unitLabelSprites.push(sprite);

  return mesh;
}

function createTextSprite(text, color) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 1024; canvas.height = 256;
  ctx.clearRect(0, 0, 1024, 256);
  ctx.font = 'bold 72px "Inter", Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
  const hex = typeof color === 'number' ? '#' + color.toString(16).padStart(6, '0') : color;
  ctx.fillStyle = hex;
  ctx.fillText(text, 512, 128);
  const tex = new THREE.CanvasTexture(canvas); tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.5, 0.125, 1);
  sprite.renderOrder = 999; // 确保始终最后渲染，在其他物体之上
  return sprite;
}

// ─── ANNOTATION EDIT PANEL ──────────────────────────────────
function showAnnotationEditPanel(annotation, screenX, screenY) {
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

function hideAnnotationEditPanel() {
  const panel = document.getElementById('annotationEditPanel');
  if (panel) panel.style.display = 'none';
}

function applyAnnotationEdit(type) {
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
        const newSprite = createTextSprite(annotation.userData.label || '', newColor);
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
      const newSprite = createTextSprite('📌 ' + newText, '#ffffff');
      newSprite.position.set(annotation.userData.pos.x, annotation.userData.pos.y + 0.3, annotation.userData.pos.z);
      newSprite.scale.set(0.9, 0.22, 1);
      annotation.add(newSprite);
    }
  }

  hideAnnotationEditPanel();
}

function setEditColor(color, type) {
  if (type === 'arrow') {
    const input = document.getElementById('editArrowColor');
    if (input) input.value = color;
  } else if (type === 'zone') {
    const input = document.getElementById('editZoneColor');
    if (input) input.value = color;
  }
}

// Make applyAnnotationEdit globally available
window.applyAnnotationEdit = applyAnnotationEdit;
window.setEditColor = setEditColor;

// ─── ANNOTATIONS ────────────────────────────────────────────
function createArrowAnnotation(start, end, color) {
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
  scene.add(group); annotationMeshes.push(group); return group;
}

function createZoneAnnotation(center, radius, color, label) {
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
  if (label) { const sprite = createTextSprite(label, c); sprite.position.set(center.x, center.y + 0.3, center.z); sprite.scale.set(0.6, 0.15, 1); group.add(sprite); }
  group.userData = { isAnnotation: true, annotationType: 'zone', center: center.clone(), radius, color: c, label };
  scene.add(group); annotationMeshes.push(group); return group;
}

function createLabelAnnotation(position, text) {
  const group = new THREE.Group(); group.name = `label_${Date.now()}`;
  const sprite = createTextSprite('📌 ' + text, '#ffffff');
  sprite.position.set(position.x, position.y + 0.3, position.z); sprite.scale.set(0.9, 0.22, 1); group.add(sprite);
  const pinH = position.y + 0.01;
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, pinH, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }));
  pin.position.set(position.x, pinH / 2, position.z); group.add(pin);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
  dot.position.set(position.x, position.y + 0.01, position.z); group.add(dot);
  group.userData = { isAnnotation: true, annotationType: 'label', text, pos: position.clone() };
  scene.add(group); annotationMeshes.push(group); return group;
}

// ─── SAVE / LOAD ────────────────────────────────────────────
function saveCurrentState() {
  const sd = getCurrentSceneData(); if (!sd) return;
  const phase = sd.phases[currentPhase];
  phase.units = unitMeshes.map(u => ({ type: u.userData.type, label: u.userData.label, x: u.position.x, y: u.position.y, z: u.position.z, rx: u.rotation.x, ry: u.rotation.y, rz: u.rotation.z, name: u.name, unitScale: u.userData.unitScale || 0.1 }));
  phase.annotations = annotationMeshes.map(a => {
    const d = { type: a.userData.annotationType };
    if (d.type === 'arrow') { d.start = a.userData.start; d.end = a.userData.end; d.color = a.userData.color; }
    else if (d.type === 'zone') { d.center = a.userData.center; d.radius = a.userData.radius; d.color = a.userData.color; d.label = a.userData.label; }
    else if (d.type === 'label') { d.pos = a.userData.pos; d.text = a.userData.text; }
    return d;
  });
  sd.currentPhase = currentPhase;
}

function clearSceneObjects() {
  unitMeshes.forEach(m => scene.remove(m)); unitMeshes.length = 0;
  unitLabelSprites.forEach(s => scene.remove(s)); unitLabelSprites.length = 0;
  annotationMeshes.forEach(a => scene.remove(a)); annotationMeshes.length = 0;
}

function loadPhaseState(phase) {
  clearSceneObjects();
  if (phase.units) phase.units.forEach(u => {
    let mesh;
    if (customItemsRegistry[u.type]) {
      mesh = createCustomMesh(u.type, u.x, u.z, u.label, u.unitScale);
    } else {
      mesh = createUnitMesh(u.type, u.x, u.z, u.label, u.unitScale);
    }
    mesh.name = u.name;
    if (u.y !== undefined && u.y !== 0) mesh.position.y = u.y;
    else mesh.position.y = getModelSurfaceHeight(u.x, u.z);
    if (u.rx !== undefined) mesh.rotation.x = u.rx;
    if (u.ry !== undefined) mesh.rotation.y = u.ry;
    if (u.rz !== undefined) mesh.rotation.z = u.rz;
    // 同步sprite位置，确保sprite在mesh上方且不低于最小高度
    const sprite = unitLabelSprites.find(s => s.userData.parentUnit === mesh);
    if (sprite) {
      const targetY = Math.max(mesh.position.y + sprite.userData.offsetY, 0.5);
      sprite.position.set(mesh.position.x, targetY, mesh.position.z);
    }
  });
  if (phase.annotations) phase.annotations.forEach(a => {
    if (a.type === 'arrow' && a.start && a.end) createArrowAnnotation(new THREE.Vector3(a.start.x, a.start.y || 0, a.start.z), new THREE.Vector3(a.end.x, a.end.y || 0, a.end.z), a.color);
    else if (a.type === 'zone' && a.center) createZoneAnnotation(new THREE.Vector3(a.center.x, a.center.y || 0, a.center.z), a.radius, a.color, a.label);
    else if (a.type === 'label' && a.pos) createLabelAnnotation(new THREE.Vector3(a.pos.x, a.pos.y || 0, a.pos.z), a.text);
  });
}

// ─── SCENE IMPORT / EXPORT ──────────────────────────────────
function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function saveSceneToJson(sceneId) {
  saveCurrentState();
  const sd = sceneDataStore[sceneId];
  if (!sd) { showToast('❌ 场景不存在'); return; }
  const sceneName = sd.name || '未命名场景';
  const date = new Date().toLocaleDateString('zh-CN').replace(/\//g, '-');
  const filename = `场景_${sceneName}_${date}.json`;
  const exportData = {
    version: 1,
    sceneId: sceneId,
    name: sd.name,
    phases: sd.phases,
    currentPhase: sd.currentPhase,
    modelBounds: sd.modelBounds,
    viewpointGroups: sd.viewpointGroups || []
  };
  downloadJson(exportData, filename);
  showToast(`✅ 已导出场景: ${sceneName}`);
}

function loadSceneFromJson(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || !data.phases || !Array.isArray(data.phases)) {
        showToast('❌ 无效的场景文件'); return;
      }
      const existingScene = sceneDataStore[currentSceneId];
      const mode = existingScene && existingScene.phases[0]?.units?.length > 0
        ? confirm('当前场景已有数据。\n确定要覆盖吗？')
        : true;
      if (!mode) return;
      importSceneData(currentSceneId, data);
      showToast(`✅ 已导入场景: ${data.name || '未命名'}`);
    } catch (err) {
      console.error('Load error:', err); showToast('❌ 场景文件加载失败');
    }
  };
  reader.readAsText(file);
}

function importSceneData(sceneId, data) {
  const existingModel = sceneDataStore[sceneId]?.model;
  sceneDataStore[sceneId] = {
    name: data.name || '导入场景',
    model: data.model && data.model.dataUrl ? data.model : existingModel,
    phases: data.phases.map((p, i) => ({
      name: p.name || `P${i + 1}`,
      units: p.units || [],
      annotations: p.annotations || []
    })),
    currentPhase: data.currentPhase || 0,
    modelBounds: data.modelBounds || null,
    viewpointGroups: data.viewpointGroups || [{ id: 'vp_default', name: '📌 常用视角', collapsed: false, viewpoints: [] }]
  };
  if (sceneGroups.every(g => g.id !== 'imported')) {
    const hasScene = sceneGroups.some(g => g.scenes.some(s => s.id === sceneId));
    if (!hasScene) {
      const group = sceneGroups.find(g => g.id === 'raid1') || sceneGroups[0];
      group.scenes.push({ id: sceneId, name: data.name || '导入场景' });
    }
  }
  renderSceneSelector();
  renderViewpointSelector();
  if (sceneId === currentSceneId) {
    currentPhase = sceneDataStore[sceneId].currentPhase || 0;
    applySceneModel(sceneDataStore[sceneId], () => {
      loadPhaseState(sceneDataStore[sceneId].phases[currentPhase]);
      renderPhaseBar();
      updateUnitList();
    });
  }
}

function applySceneModel(sd, onReady) {
  if (currentSceneModel) { scene.remove(currentSceneModel); currentSceneModel = null; }
  if (sd.model) {
    loadModelIntoScene(sd.model, () => {
      if (onReady) onReady();
    });
  } else {
    createGround(60, 60); camera.position.set(0, 80, 60); camera.lookAt(0, 0, 0); controls.target.set(0, 0, 0); controls.update();
    if (onReady) onReady();
  }
}

function switchScene(sceneId) {
  if (sceneId === currentSceneId || animating) return;
  saveCurrentState(); currentSceneId = sceneId;
  const sd = getCurrentSceneData(); if (!sd) return;
  currentPhase = sd.currentPhase || 0;
  applySceneModel(sd, () => {
    loadPhaseState(sd.phases[currentPhase]);
    renderPhaseBar(); renderSceneSelector(); renderViewpointSelector(); updateUnitList();
    showToast(`🗺️ 已切换到: ${sd.name}`);
  });
}

function switchPhase(newIdx, withAnimation = true) {
  const phases = getPhases();
  if (newIdx === currentPhase || newIdx < 0 || newIdx >= phases.length || animating) return;
  saveCurrentState();
  const oldPhase = phases[currentPhase], newPhase = phases[newIdx];
  if (withAnimation && oldPhase.units?.length > 0 && newPhase.units?.length > 0) {
    animatePhaseTransition(oldPhase, newPhase, () => {
      currentPhase = newIdx; getCurrentSceneData().currentPhase = currentPhase;
      renderPhaseBar(); updateUnitList();
    });
  } else {
    currentPhase = newIdx; getCurrentSceneData().currentPhase = currentPhase;
    loadPhaseState(newPhase); renderPhaseBar(); updateUnitList();
  }
}

function animatePhaseTransition(oldP, newP, callback) {
  animating = true; const duration = 1.2; let elapsed = 0;
  const pairs = [];
  if (newP.units) newP.units.forEach(nu => {
    const existing = unitMeshes.find(m => m.name === nu.name);
    if (existing) {
      const toY = nu.y !== undefined ? nu.y : getModelSurfaceHeight(nu.x, nu.z);
      pairs.push({ mesh: existing, from: { x: existing.position.x, y: existing.position.y, z: existing.position.z }, to: { x: nu.x, y: toY, z: nu.z } });
    }
  });
  const existingNames = unitMeshes.map(m => m.name);
  const toAdd = (newP.units || []).filter(nu => !existingNames.includes(nu.name));
  const newNames = (newP.units || []).map(nu => nu.name);
  const toRemove = unitMeshes.filter(m => !newNames.includes(m.name));

  function frame() {
    elapsed += clock.getDelta();
    const t = Math.min(elapsed / duration, 1);
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    pairs.forEach(p => {
      p.mesh.position.x = p.from.x + (p.to.x - p.from.x) * ease;
      p.mesh.position.z = p.from.z + (p.to.z - p.from.z) * ease;
      const baseY = p.from.y + (p.to.y - p.from.y) * ease;
      const midY = getModelSurfaceHeight(p.mesh.position.x, p.mesh.position.z);
      p.mesh.position.y = Math.max(baseY, midY) + Math.sin(ease * Math.PI) * 2.0;
      // 同步更新精灵位置
      const sprite = unitLabelSprites.find(s => s.userData.parentUnit === p.mesh);
      if (sprite) {
        sprite.position.set(p.mesh.position.x, p.mesh.position.y + sprite.userData.offsetY, p.mesh.position.z);
      }
    });
    toRemove.forEach(m => m.scale.setScalar((1 - ease) * (m.userData.unitScale || 0.1)));
    pairs.forEach(p => { if (t > 0.05 && t < 0.95 && Math.random() < 0.3) createTrailParticle(p.mesh.position); });
    controls.update(); renderer.render(scene, camera);
    if (t >= 1) {
      toRemove.forEach(m => {
        scene.remove(m); const idx = unitMeshes.indexOf(m); if (idx > -1) unitMeshes.splice(idx, 1);
        const spriteIdx = unitLabelSprites.findIndex(s => s.userData.parentUnit === m);
        if (spriteIdx > -1) { scene.remove(unitLabelSprites[spriteIdx]); unitLabelSprites.splice(spriteIdx, 1); }
      });
      toAdd.forEach(nu => {
        const m = createUnitMesh(nu.type, nu.x, nu.z, nu.label, nu.unitScale);
        m.position.y = nu.y !== undefined ? nu.y : getModelSurfaceHeight(nu.x, nu.z);
        if (nu.rx !== undefined) m.rotation.x = nu.rx;
        if (nu.ry !== undefined) m.rotation.y = nu.ry;
        if (nu.rz !== undefined) m.rotation.z = nu.rz;
        // 同步sprite位置
        const sprite = unitLabelSprites.find(s => s.userData.parentUnit === m);
        if (sprite) {
          sprite.position.set(m.position.x, m.position.y + sprite.userData.offsetY, m.position.z);
        }
      });
      pairs.forEach(p => {
        p.mesh.position.y = p.to.y;
        const sprite = unitLabelSprites.find(s => s.userData.parentUnit === p.mesh);
        if (sprite) {
          sprite.position.set(p.to.x, p.to.y + sprite.userData.offsetY, p.to.z);
        }
      });
      annotationMeshes.forEach(a => scene.remove(a)); annotationMeshes.length = 0;
      if (newP.annotations) newP.annotations.forEach(a => {
        if (a.type === 'arrow' && a.start && a.end) createArrowAnnotation(new THREE.Vector3(a.start.x, a.start.y || 0, a.start.z), new THREE.Vector3(a.end.x, a.end.y || 0, a.end.z), a.color);
        else if (a.type === 'zone' && a.center) createZoneAnnotation(new THREE.Vector3(a.center.x, a.center.y || 0, a.center.z), a.radius, a.color, a.label);
        else if (a.type === 'label' && a.pos) createLabelAnnotation(new THREE.Vector3(a.pos.x, a.pos.y || 0, a.pos.z), a.text);
      });
      animating = false; renderer.setAnimationLoop(animate);
      if (callback) callback(); return;
    }
    renderer.setAnimationLoop(frame);
  }
  renderer.setAnimationLoop(frame);
}

function createTrailParticle(pos) {
  const p = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.6 }));
  p.position.copy(pos); p.position.x += (Math.random() - 0.5) * 0.3; p.position.z += (Math.random() - 0.5) * 0.3;
  scene.add(p); setTimeout(() => scene.remove(p), 500);
}

// ─── MODEL UPLOAD ───────────────────────────────────────────
async function handleModelUpload(files, targetGroupId) {
  for (const file of Array.from(files)) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['fbx', 'glb', 'gltf'].includes(ext)) { showToast(`⚠️ 不支持的格式: .${ext}`); continue; }
    const dataUrl = await new Promise(r => { const rd = new FileReader(); rd.onload = e => r(e.target.result); rd.readAsDataURL(file); });
    const sceneId = `scene_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const sceneName = file.name.replace(/\.[^.]+$/, '');
    const type = (ext === 'glb' || ext === 'gltf') ? 'glb' : 'fbx';
    initSceneData(sceneId, sceneName, { dataUrl, fileName: file.name, type });
    let group = sceneGroups.find(g => g.id === targetGroupId) || sceneGroups[0];
    group.scenes.push({ id: sceneId, name: sceneName }); group.collapsed = false;
    renderSceneSelector(); showToast(`✅ 已添加模型场景: ${sceneName}`);
  }
}

async function handleSingleModelUpload(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['fbx', 'glb', 'gltf'].includes(ext)) { showToast(`⚠️ 不支持的格式: .${ext}`); return; }
  const dataUrl = await new Promise(r => { const rd = new FileReader(); rd.onload = e => r(e.target.result); rd.readAsDataURL(file); });
  const type = (ext === 'glb' || ext === 'gltf') ? 'glb' : 'fbx';
  const sd = getCurrentSceneData();
  sd.model = { dataUrl, fileName: file.name, type };
  applySceneModel(sd, () => {
    renderSceneSelector();
  });
}

// ─── CLIP PLANE ─────────────────────────────────────────────
function setClipEnabled(enabled) {
  clipEnabled = enabled;
  if (currentSceneModel) {
    currentSceneModel.traverse(child => {
      if (child.isMesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(m => { m.clippingPlanes = enabled ? [clipPlane] : []; m.clipShadows = enabled; m.needsUpdate = true; });
      }
    });
  }
  if (enabled) { if (!clipPlaneHelper) createClipPlaneVisual(); clipPlaneHelper.visible = true; }
  else { if (clipPlaneHelper) clipPlaneHelper.visible = false; }
  const ind = document.getElementById('clipHeightIndicator');
  if (ind) ind.style.display = enabled ? 'block' : 'none';
}

function setClipHeight(val) {
  clipHeight = val; clipPlane.constant = val;
  if (clipPlaneHelper) clipPlaneHelper.position.y = val;
  const el = document.getElementById('clipHeightValue'); if (el) el.textContent = val.toFixed(1);
}

function createClipPlaneVisual() {
  if (clipPlaneHelper) scene.remove(clipPlaneHelper);
  const group = new THREE.Group(); group.name = 'clipPlaneHelper';
  const s = Math.max(groundWidth, groundHeight) * 1.2;
  const planeGeo = new THREE.PlaneGeometry(s, s);
  const planeMat = new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(planeGeo, planeMat); mesh.rotation.x = -Math.PI / 2; group.add(mesh);
  const ringGeo = new THREE.RingGeometry(s * 0.48, s * 0.5, 64);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(ringGeo, ringMat); ring.rotation.x = -Math.PI / 2; group.add(ring);
  const half = s * 0.4;
  const lineMat = new THREE.LineBasicMaterial({ color: 0xff6666, transparent: true, opacity: 0.1 });
  for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * 2 - 1;
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(t * half, 0, -half), new THREE.Vector3(t * half, 0, half)]), lineMat));
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-half, 0, t * half), new THREE.Vector3(half, 0, t * half)]), lineMat));
  }
  group.position.y = clipHeight; group.visible = clipEnabled;
  scene.add(group); clipPlaneHelper = group;
}

function updateClipSliderRange() {
  const slider = document.getElementById('clipHeightSlider'); if (!slider) return;
  const margin = (clipModelMaxY - clipModelMinY) * 0.05;
  slider.min = clipModelMinY; slider.max = clipModelMaxY + margin;
  slider.step = ((clipModelMaxY - clipModelMinY) / 200).toFixed(3); slider.value = clipHeight;
  const valEl = document.getElementById('clipHeightValue'); if (valEl) valEl.textContent = clipHeight.toFixed(1);
  const rangeEl = document.getElementById('clipRangeInfo'); if (rangeEl) rangeEl.textContent = `${clipModelMinY.toFixed(1)} ~ ${clipModelMaxY.toFixed(1)}`;
}

function setBrightness(val) {
  brightness = val; renderer.toneMappingExposure = val;
  const amb = scene.getObjectByName('ambientLight'); if (amb) amb.intensity = 2 * val;
  const d = scene.getObjectByName('dirLight'); if (d) d.intensity = 3 * val;
  const d2 = scene.getObjectByName('dirLight2'); if (d2) d2.intensity = 1.5 * val;
  const d3 = scene.getObjectByName('dirLight3'); if (d3) d3.intensity = 0.8 * val;
  const h = scene.getObjectByName('hemiLight'); if (h) h.intensity = 1.8 * val;
  for (let i = 1; i <= 4; i++) { const l = scene.getObjectByName(`fillLight${i}`); if (l) l.intensity = 1.1 * val; }
  const el = document.getElementById('brightnessValue'); if (el) el.textContent = Math.round(val * 100) + '%';
}

// ─── RAYCASTING ─────────────────────────────────────────────
function getModelSurfaceHeight(x, z) {
  if (!currentSceneModel) return 0.5;
  const meshes = []; currentSceneModel.traverse(c => { if (c.isMesh) meshes.push(c); });
  const ray = new THREE.Raycaster(new THREE.Vector3(x, clipModelMaxY + 50, z), new THREE.Vector3(0, -1, 0), 0, clipModelMaxY + 100);
  const hits = ray.intersectObjects(meshes, false);
  if (hits.length > 0) return hits[0].point.y;
  const ray2 = new THREE.Raycaster(new THREE.Vector3(x, clipModelMinY - 10, z), new THREE.Vector3(0, 1, 0), 0, clipModelMaxY + 50);
  const hits2 = ray2.intersectObjects(meshes, false);
  if (hits2.length > 0) return hits2[0].point.y;
  return 0.5;
}

function getSceneIntersect(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  if (currentSceneModel) {
    const meshes = []; currentSceneModel.traverse(c => { if (c.isMesh) meshes.push(c); });
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) return hits[0].point.clone();
  }
  const planeHits = raycaster.intersectObject(groundPlane);
  if (planeHits.length > 0) {
    const pt = planeHits[0].point.clone();
    return pt;
  }
  return null;
}

function getGroundIntersect(event) { return getSceneIntersect(event); }

function getUnitIntersect(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(unitMeshes, true);
  if (hits.length > 0) {
    let obj = hits[0].object;
    while (obj && obj !== scene && !obj.userData.isUnit) obj = obj.parent;
    if (obj && obj.userData.isUnit) return obj;
  }
  return null;
}

function getAnnotationIntersect(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(annotationMeshes, true);
  if (hits.length > 0) {
    let obj = hits[0].object;
    while (obj && obj !== scene && !obj.userData.isAnnotation) obj = obj.parent;
    if (obj && obj.userData.isAnnotation) return obj;
  }
  return null;
}

// ─── EVENTS ─────────────────────────────────────────────────

function bindEvents() {
  renderer.domElement.addEventListener('click', onCanvasClick);
  renderer.domElement.addEventListener('mousemove', onCanvasMouseMove);
  renderer.domElement.addEventListener('mousedown', onMouseDown);
  renderer.domElement.addEventListener('mouseup', onMouseUp);
  renderer.domElement.addEventListener('contextmenu', (e) => {
    e.preventDefault(); selectedUnit = null; selectedAnnotation = null; placementMode = null; arrowStart = null;
    updateToolbarSelection(); clearSelectionVisuals(); clearAnnotationSelection(); hideAnnotationEditPanel();
  });
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('annotationEditPanel');
    if (panel && panel.style.display !== 'none' && !panel.contains(e.target) && !e.target.closest('canvas')) {
      hideAnnotationEditPanel();
    }
  });
}

function onCanvasClick(e) {
  if (animating || freeRoamMode) return;
  const point = getGroundIntersect(e);
  if (!point) return;
  const halfW = groundWidth / 2 - 1, halfH = groundHeight / 2 - 1;
  point.x = Math.max(-halfW, Math.min(halfW, point.x));
  point.z = Math.max(-halfH, Math.min(halfH, point.z));

  if (placementMode) {
    const allUnits = { ...UNIT_CATEGORIES.monsters.units, ...UNIT_CATEGORIES.players_role.units, ...UNIT_CATEGORIES.players_class.units, ...UNIT_CATEGORIES.custom.units };
    if (allUnits[placementMode]) {
      const labelInput = document.getElementById('unitLabelInput');
      const label = labelInput?.value || '';
      let mesh;
      if (UNIT_CATEGORIES.custom.units[placementMode]) {
        mesh = createCustomMesh(placementMode, point.x, point.z, label || undefined);
      } else {
        mesh = createUnitMesh(placementMode, point.x, point.z, label || undefined);
      }
      mesh.position.y = point.y || 0;
      // 同步精灵位置
      const sprite = unitLabelSprites.find(s => s.userData.parentUnit === mesh);
      if (sprite) {
        sprite.position.set(mesh.position.x, mesh.position.y + sprite.userData.offsetY, mesh.position.z);
      }
      const def = getUnitDef(placementMode);
      showToast(`✅ 已放置 ${def.icon} ${def.label}`);
    } else if (placementMode === 'arrow') {
      if (!arrowStart) { arrowStart = point.clone(); arrowStart.y += 0.3; showToast('📍 点击第二个点完成箭头'); }
      else {
        const endPoint = point.clone(); endPoint.y += 0.3;
        createArrowAnnotation(arrowStart, endPoint); arrowStart = null; showToast('✅ 箭头已添加');
      }
    } else if (placementMode === 'zone') {
      const radius = parseFloat(document.getElementById('zoneRadiusInput')?.value) || 4;
      const zoneLabel = document.getElementById('zoneLabelInput')?.value || '危险区域';
      const zoneColor = parseInt(document.getElementById('zoneColorInput')?.value?.replace('#', ''), 16) || 0xef4444;
      createZoneAnnotation(point, radius, zoneColor, zoneLabel); showToast('✅ 区域标记已添加');
    } else if (placementMode === 'label') {
      const text = document.getElementById('annotationTextInput')?.value || '标记点';
      createLabelAnnotation(point, text); showToast('✅ 标签已添加');
    }
    updateUnitList(); return;
  }

  const unit = getUnitIntersect(e);
  const annotation = getAnnotationIntersect(e);
  if (annotation) {
    clearAnnotationSelection();
    selectedAnnotation = annotation;
    addAnnotationSelection(annotation);
    window.currentSelectedAnnotation = annotation;
    showAnnotationEditPanel(annotation, e.clientX, e.clientY);
  }
  else if (unit) { clearAnnotationSelection(); selectedUnit = unit; addSelectionVisual(unit); updateTransformPanel(); hideAnnotationEditPanel(); }
  else { clearAnnotationSelection(); clearSelectionVisuals(); selectedUnit = null; updateTransformPanel(); hideAnnotationEditPanel(); }
}

function onMouseDown(e) {
  if (animating || placementMode) return;
  const unit = getUnitIntersect(e);
  if (unit) { isDragging = true; dragTarget = unit; controls.enabled = false; }
}
function onMouseUp() { if (isDragging) { isDragging = false; dragTarget = null; controls.enabled = true; } }

function onCanvasMouseMove(e) {
  if (animating) return;
  if (isDragging && dragTarget) {
    const point = getGroundIntersect(e);
    if (point) {
      const halfW = groundWidth / 2 - 1, halfH = groundHeight / 2 - 1;
      dragTarget.position.x = Math.max(-halfW, Math.min(halfW, point.x));
      dragTarget.position.z = Math.max(-halfH, Math.min(halfH, point.z));
      // 如果物体当前在模型内部，使用交点Y；否则吸附到表面
      const currentY = dragTarget.position.y;
      const isInsideModel = currentY > clipModelMinY && currentY < clipModelMaxY;
      if (isInsideModel) {
        dragTarget.position.y = point.y;
      } else {
        dragTarget.position.y = getModelSurfaceHeight(dragTarget.position.x, dragTarget.position.z);
      }
      // 同步更新精灵位置
      const sprite = unitLabelSprites.find(s => s.userData.parentUnit === dragTarget);
      if (sprite) {
        sprite.position.set(dragTarget.position.x, dragTarget.position.y + sprite.userData.offsetY, dragTarget.position.z);
      }
      if (dragTarget === selectedUnit) {
        document.getElementById('posX').value = dragTarget.position.x.toFixed(2);
        document.getElementById('posY').value = dragTarget.position.y.toFixed(2);
        document.getElementById('posZ').value = dragTarget.position.z.toFixed(2);
      }
    }
    return;
  }
  const unit = getUnitIntersect(e);
  const annotation = getAnnotationIntersect(e);
  if (unit !== hoveredUnit) {
    if (hoveredUnit && hoveredUnit !== selectedUnit) {
      hoveredUnit.traverse(c => { if (c.isMesh && c.material.emissiveIntensity !== undefined) c.material.emissiveIntensity = c.material.userData?.origEmissive || 0.15; });
    }
    hoveredUnit = unit;
    if (hoveredUnit) {
      hoveredUnit.traverse(c => {
        if (c.isMesh && c.material.emissiveIntensity !== undefined) {
          c.material.userData = c.material.userData || {};
          c.material.userData.origEmissive = c.material.emissiveIntensity;
          c.material.emissiveIntensity = 0.6;
        }
      });
      renderer.domElement.style.cursor = 'grab';
    }
  }
  if (annotation !== hoveredAnnotation) {
    if (hoveredAnnotation && hoveredAnnotation !== selectedAnnotation) {
      hoveredAnnotation.traverse(c => { if (c.isMesh && c.material.opacity !== undefined && c.material.userData?.origOpacity !== undefined) c.material.opacity = c.material.userData.origOpacity; });
    }
    hoveredAnnotation = annotation;
    if (hoveredAnnotation) {
      hoveredAnnotation.traverse(c => {
        if (c.isMesh && c.material.opacity !== undefined) {
          c.material.userData = c.material.userData || {};
          c.material.userData.origOpacity = c.material.opacity;
          c.material.opacity = 1;
        }
      });
      renderer.domElement.style.cursor = 'pointer';
    } else if (!hoveredUnit) {
      renderer.domElement.style.cursor = placementMode ? 'crosshair' : 'default';
    }
  }
}

function onKeyDown(e) {
  if (e.target.closest('input')) return;
  const key = e.key.toLowerCase();
  if (key === 'w' || key === 'arrowup') keys.w = true;
  if (key === 's' || key === 'arrowdown') keys.s = true;
  if (key === 'a' || key === 'arrowleft') keys.a = true;
  if (key === 'd' || key === 'arrowright') keys.d = true;
  if (key === 'q') keys.q = true;
  if (key === 'e') keys.e = true;
  if (key === 'shift') keys.shift = true;
  if (key === 'f') toggleFreeRoamMode();
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedAnnotation && !e.target.closest('input')) {
      scene.remove(selectedAnnotation); const idx = annotationMeshes.indexOf(selectedAnnotation);
      if (idx > -1) annotationMeshes.splice(idx, 1);
      selectedAnnotation = null; showToast('🗑️ 标注已删除'); updateAnnotCount();
    } else if (selectedUnit && !e.target.closest('input')) {
      scene.remove(selectedUnit); const idx = unitMeshes.indexOf(selectedUnit);
      if (idx > -1) unitMeshes.splice(idx, 1);
      // 同时删除关联的精灵
      const spriteIdx = unitLabelSprites.findIndex(s => s.userData.parentUnit === selectedUnit);
      if (spriteIdx > -1) {
        scene.remove(unitLabelSprites[spriteIdx]);
        unitLabelSprites.splice(spriteIdx, 1);
      }
      selectedUnit = null; showToast('🗑️ 单位已删除'); updateUnitList(); updateTransformPanel();
    }
  }
  if (e.key === 'Escape') {
    if (freeRoamMode && isPointerLocked) { document.exitPointerLock(); return; }
    placementMode = null; arrowStart = null; selectedUnit = null; selectedAnnotation = null;
    clearSelectionVisuals(); clearAnnotationSelection(); updateToolbarSelection(); updateTransformPanel();
    hideAnnotationEditPanel();
  }
}

function onKeyUp(e) {
  const key = e.key.toLowerCase();
  if (key === 'w' || key === 'arrowup') keys.w = false;
  if (key === 's' || key === 'arrowdown') keys.s = false;
  if (key === 'a' || key === 'arrowleft') keys.a = false;
  if (key === 'd' || key === 'arrowright') keys.d = false;
  if (key === 'q') keys.q = false;
  if (key === 'e') keys.e = false;
  if (key === 'shift') keys.shift = false;
}

function updateFreeRoamMovement(delta) {
  if (!freeRoamMode) return;
  const speed = freeRoamSpeed * (keys.shift ? 2.5 : 1.0) * delta;
  const forward = new THREE.Vector3(); camera.getWorldDirection(forward); forward.normalize();
  const right = new THREE.Vector3(); right.crossVectors(forward, camera.up).normalize();
  const move = new THREE.Vector3(0, 0, 0);
  if (keys.w) move.add(forward.clone().multiplyScalar(speed));
  if (keys.s) move.add(forward.clone().multiplyScalar(-speed));
  if (keys.a) move.add(right.clone().multiplyScalar(-speed));
  if (keys.d) move.add(right.clone().multiplyScalar(speed));
  if (keys.q) move.y -= speed;
  if (keys.e) move.y += speed;
  camera.position.add(move);
}

function toggleFreeRoamMode() {
  freeRoamMode = !freeRoamMode;
  if (freeRoamMode) {
    controls.enabled = false; freeRoamEuler.setFromQuaternion(camera.quaternion);
    showToast('🎮 漫游模式 — WS前后·AD左右 / QE升降 / Shift加速');
    renderer.domElement.requestPointerLock(); setActiveTool('roam');
  } else {
    controls.enabled = true; if (isPointerLocked) document.exitPointerLock();
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    controls.target.copy(camera.position).add(dir.multiplyScalar(20));
    controls.update(); showToast('🖱️ 轨道视角模式'); setActiveTool(null);
  }
  const btn = document.getElementById('freeRoamBtn');
  if (btn) btn.classList.toggle('active', freeRoamMode);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight);
}

function addSelectionVisual(unit) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 1.0, 32),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; ring.name = 'selectionRing'; unit.add(ring);
}
function clearSelectionVisuals() {
  unitMeshes.forEach(u => { const ring = u.getObjectByName('selectionRing'); if (ring) u.remove(ring); });
}
function addAnnotationSelection(annotation) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.2, 1.5, 32),
    new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; ring.name = 'annotSelectionRing'; annotation.add(ring);
}
function clearAnnotationSelection() {
  annotationMeshes.forEach(a => { const ring = a.getObjectByName('annotSelectionRing'); if (ring) a.remove(ring); });
}

let currentActiveTool = null;
function setActiveTool(toolId) {
  currentActiveTool = toolId;
  document.querySelectorAll('.nav-tool-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === toolId);
  });
}

// ─── ANIMATION LOOP ────────────────────────────────────────
function animate() {
  const delta = clock.getDelta();
  const t = clock.getElapsedTime();
  updateFreeRoamMovement(delta);
  unitMeshes.forEach((u, i) => {
    // Idle bob
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
  annotationMeshes.forEach(a => a.traverse(c => { if (c.userData?.pulse && c.material) c.material.opacity = 0.15 + Math.sin(t * 3) * 0.15; }));
  const particles = scene.getObjectByName('runeParticles');
  if (particles) {
    particles.rotation.y = t * 0.015;
    const pos = particles.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.array[i * 3 + 1] += Math.sin(t + i) * 0.001;
    pos.needsUpdate = true;
  }
  unitMeshes.forEach(u => { const ring = u.getObjectByName('selectionRing'); if (ring) ring.rotation.z = t * 2; });
  if (!freeRoamMode) controls.update();
  renderer.render(scene, camera);
}

// ════════════════════════════════════════════════════════════
//  UI
// ════════════════════════════════════════════════════════════
function buildUI() {
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
    <div class="rail-icon ${navSections.scenes.open ? 'active' : ''}" data-section="scenes">🗺️<span class="rail-tooltip">战斗场景</span></div>
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
        <div class="nav-section-header ${navSections.scenes.open ? 'open active' : ''}" data-section="scenes">
          <div class="sec-icon">🗺️</div><span class="sec-label">战斗场景</span>
          <span class="sec-count" id="sceneCount">0</span><span class="sec-chevron">▶</span>
        </div>
        <div class="nav-section-body ${navSections.scenes.open ? 'open' : ''}" data-section="scenes">
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
            <div class="nav-control-label">场景亮度 <span class="val" id="brightnessValue">${Math.round(brightness * 100)}%</span></div>
            <div class="nav-slider-row"><span class="sl">🌙</span><input type="range" id="brightnessSlider" min="0.3" max="3.0" step="0.05" value="${brightness}" /><span class="sl">☀️</span></div>
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
            <div class="nav-control-label">移动速度 <span class="val" id="roamSpeedValue">${freeRoamSpeed}</span></div>
            <div class="nav-slider-row"><span class="sl">慢</span><input type="range" id="roamSpeedSlider" min="1" max="10" step="1" value="${freeRoamSpeed}" /><span class="sl">快</span></div>
          </div>
          <div class="nav-sep"></div>
          <button class="nav-tool-btn" id="clipToggleBtn" data-tool="clip">
            <span class="t-icon">✂️</span><span class="t-label">Z轴剖切</span><span class="t-status" id="clipStatusDot" style="background:#475569;"></span>
          </button>
          <div id="clipControls" class="nav-control-group" style="display:none; margin-left:4px;">
            <div class="nav-control-label">剖切高度 <span class="val" id="clipHeightValue">${clipHeight.toFixed(1)}</span></div>
            <div class="nav-slider-row"><span class="sl">底</span><input type="range" id="clipHeightSlider" min="${clipModelMinY}" max="${clipModelMaxY}" step="0.5" value="${clipHeight}" /><span class="sl">顶</span></div>
            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:3px;">
              <span style="font-size:8px; color:#3b4050;">范围: <span id="clipRangeInfo">${clipModelMinY.toFixed(1)} ~ ${clipModelMaxY.toFixed(1)}</span></span>
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
        <div class="nav-section-header ${navSections.viewpoints.open ? 'open active' : ''}" data-section="viewpoints">
          <div class="sec-icon">🎥</div><span class="sec-label">视角管理</span>
          <span class="sec-count" id="viewpointCount">0</span><span class="sec-chevron">▶</span>
        </div>
        <div class="nav-section-body ${navSections.viewpoints.open ? 'open' : ''}" data-section="viewpoints">
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
  populateUnitGrids();

  // ════ WIRE EVENTS ════
  wireUIEvents();

  // ════ INITIAL RENDERS ════
  renderSceneSelector();
  renderPhaseBar();
  updateUnitList();
  updateCurrentModelInfo();
}

function populateUnitGrids() {
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
  renderPlayerGrid();
}

function populateCustomGrid() {
  const customGrid = document.getElementById('customGrid');
  if (!customGrid) return;

  UNIT_CATEGORIES.custom.units = { ...customItemsRegistry };

  let html = '';
  for (const [key, item] of Object.entries(customItemsRegistry)) {
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
      const item = customItemsRegistry[unitType];
      if (placementMode === unitType) {
        placementMode = null;
        card.classList.remove('active');
      } else {
        placementMode = unitType;
        document.querySelectorAll('.unit-card').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.nav-tool-btn').forEach(b => {
          if (['arrow', 'zone', 'label'].includes(b.dataset.tool)) b.classList.remove('active');
        });
        card.classList.add('active');
        showToast(`🎯 放置模式: ${item.icon} ${item.label} — 点击场景放置`);
      }
      document.getElementById('zoneOptions')?.classList.remove('visible');
      document.getElementById('labelOptions')?.classList.remove('visible');
    });
  });
}

function renderPlayerGrid() {
  const grid = document.getElementById('playerGrid');
  if (!grid) return;
  const source = playerViewMode === 'role' ? UNIT_CATEGORIES.players_role : UNIT_CATEGORIES.players_class;
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
      if (placementMode === unitType) { placementMode = null; card.classList.remove('active'); }
      else {
        placementMode = unitType; arrowStart = null;
        document.querySelectorAll('.unit-card').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.nav-tool-btn').forEach(b => { if (['arrow','zone','label'].includes(b.dataset.tool)) b.classList.remove('active'); });
        card.classList.add('active');
        const def = getUnitDef(unitType);
        showToast(`🎯 放置模式: ${def.icon} ${def.label} — 点击场景放置`);
      }
      document.getElementById('zoneOptions')?.classList.remove('visible');
      document.getElementById('labelOptions')?.classList.remove('visible');
    });
  });
}

function wireUIEvents() {
  // ─── Rail section buttons ───
  document.querySelectorAll('#sidebar-rail .rail-icon[data-section]').forEach(icon => {
    icon.addEventListener('click', () => {
      const sec = icon.dataset.section;
      toggleNavSection(sec);
      if (sidebarCollapsed) { sidebarCollapsed = false; document.getElementById('sidebar').classList.remove('collapsed'); }
    });
  });

  // ─── Rail collapse ───
  document.getElementById('railCollapseBtn')?.addEventListener('click', () => {
    sidebarCollapsed = !sidebarCollapsed;
    document.getElementById('sidebar').classList.toggle('collapsed', sidebarCollapsed);
  });
  document.getElementById('railToggle')?.addEventListener('click', () => {
    sidebarCollapsed = !sidebarCollapsed;
    document.getElementById('sidebar').classList.toggle('collapsed', sidebarCollapsed);
  });

  // ─── Section headers ───
  document.querySelectorAll('.nav-section-header').forEach(header => {
    header.addEventListener('click', () => toggleNavSection(header.dataset.section));
  });

  // ─── Brightness slider ───
  document.getElementById('brightnessSlider')?.addEventListener('input', (e) => setBrightness(parseFloat(e.target.value)));

  // ─── View presets ───
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (freeRoamMode) toggleFreeRoamMode();
      const d = Math.max(groundWidth, groundHeight) * 0.8;
      const views = {
        top: { pos: [0, d, 0.01], target: [0, 0, 0] },
        front: { pos: [0, d * 0.4, d * 0.6], target: [0, 0, 0] },
        side: { pos: [d * 0.6, d * 0.4, 0], target: [0, 0, 0] },
        angle: { pos: [d * 0.4, d * 0.5, d * 0.4], target: [0, 0, 0] }
      };
      const v = views[btn.dataset.view];
      if (v) {
        camera.position.set(...v.pos); controls.target.set(...v.target); controls.update();
        showToast(`📷 ${btn.textContent}视角`);
      }
    });
  });

  // ─── Free roam ───
  document.getElementById('freeRoamBtn')?.addEventListener('click', toggleFreeRoamMode);
  document.getElementById('roamSpeedSlider')?.addEventListener('input', (e) => {
    freeRoamSpeed = parseFloat(e.target.value);
    document.getElementById('roamSpeedValue').textContent = freeRoamSpeed;
  });

  // ─── Clip plane ───
  document.getElementById('clipToggleBtn')?.addEventListener('click', () => {
    clipEnabled = !clipEnabled; setClipEnabled(clipEnabled);
    const dot = document.getElementById('clipStatusDot');
    if (dot) dot.style.background = clipEnabled ? '#ef4444' : '#475569';
    const ctrl = document.getElementById('clipControls');
    if (ctrl) ctrl.style.display = clipEnabled ? 'block' : 'none';
    document.getElementById('clipToggleBtn')?.classList.toggle('active', clipEnabled);
    showToast(clipEnabled ? '✂️ 剖切面已启用' : '✂️ 剖切面已关闭');
  });
  document.getElementById('clipHeightSlider')?.addEventListener('input', (e) => setClipHeight(parseFloat(e.target.value)));
  document.getElementById('clipQuarter')?.addEventListener('click', () => { const v = clipModelMinY + (clipModelMaxY - clipModelMinY) * 0.25; setClipHeight(v); document.getElementById('clipHeightSlider').value = v; });
  document.getElementById('clipHalf')?.addEventListener('click', () => { const v = clipModelMinY + (clipModelMaxY - clipModelMinY) * 0.5; setClipHeight(v); document.getElementById('clipHeightSlider').value = v; });
  document.getElementById('clipThreeQuarter')?.addEventListener('click', () => { const v = clipModelMinY + (clipModelMaxY - clipModelMinY) * 0.75; setClipHeight(v); document.getElementById('clipHeightSlider').value = v; });
  document.getElementById('clipFull')?.addEventListener('click', () => { const v = clipModelMaxY + 1; setClipHeight(v); document.getElementById('clipHeightSlider').value = v; });

  // ─── Viewpoint management ───
  document.getElementById('saveViewpointBtn')?.addEventListener('click', () => {
    const name = prompt('输入视角名称:', '新视角');
    if (!name) return;
    saveCurrentViewpoint(name);
    showToast(`✅ 已保存视角: ${name}`);
  });
  renderViewpointSelector();

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
      playerViewMode = tab.dataset.pmode;
      renderPlayerGrid();
    });
  });

  // ─── Monster grid clicks ───
  document.querySelectorAll('#monsterGrid .unit-card').forEach(card => {
    card.addEventListener('click', () => {
      const unitType = card.dataset.unit;
      if (placementMode === unitType) { placementMode = null; card.classList.remove('active'); }
      else {
        placementMode = unitType; arrowStart = null;
        document.querySelectorAll('.unit-card').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.nav-tool-btn').forEach(b => { if (['arrow','zone','label'].includes(b.dataset.tool)) b.classList.remove('active'); });
        card.classList.add('active');
        const def = getUnitDef(unitType);
        showToast(`🎯 放置模式: ${def.icon} ${def.label} — 点击场景放置`);
      }
      document.getElementById('zoneOptions')?.classList.remove('visible');
      document.getElementById('labelOptions')?.classList.remove('visible');
    });
  });

  // ─── Annotation tools ───
  document.querySelectorAll('.nav-tool-btn[data-tool="arrow"], .nav-tool-btn[data-tool="zone"], .nav-tool-btn[data-tool="label"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      if (placementMode === tool) {
        placementMode = null; btn.classList.remove('active');
        document.getElementById('zoneOptions')?.classList.remove('visible');
        document.getElementById('labelOptions')?.classList.remove('visible');
      } else {
        placementMode = tool; arrowStart = null;
        document.querySelectorAll('.unit-card').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.nav-tool-btn').forEach(b => { if (['arrow','zone','label'].includes(b.dataset.tool)) b.classList.remove('active'); });
        btn.classList.add('active');
        document.getElementById('zoneOptions')?.classList.toggle('visible', tool === 'zone');
        document.getElementById('labelOptions')?.classList.toggle('visible', tool === 'label');
        const names = { arrow: '➡️ 箭头标注', zone: '🔴 区域标记', label: '📌 文字标签' };
        showToast(`✏️ ${names[tool]} — 点击场景放置`);
      }
    });
  });

  // ─── Zone radius display ───
  document.getElementById('zoneRadiusInput')?.addEventListener('input', (e) => {
    const el = document.getElementById('zoneRadiusVal'); if (el) el.textContent = e.target.value;
  });

  // ─── Transform inputs ───
  ['posX', 'posY', 'posZ', 'rotX', 'rotY', 'rotZ', 'scaleInput'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', applyTransform);
  });
  document.getElementById('unitScaleSlider')?.addEventListener('input', (e) => {
    document.getElementById('scaleInput').value = parseFloat(e.target.value).toFixed(3);
    applyTransform();
  });
  document.getElementById('unitNameInput')?.addEventListener('change', (e) => {
    if (!selectedUnit) return;
    const newLabel = e.target.value;
    selectedUnit.userData.label = newLabel;
    // 更新独立sprite文字
    const oldSprite = unitLabelSprites.find(s => s.userData.parentUnit === selectedUnit);
    if (oldSprite) {
      scene.remove(oldSprite);
      const idx = unitLabelSprites.indexOf(oldSprite);
      if (idx > -1) unitLabelSprites.splice(idx, 1);
      const def = getUnitDef(selectedUnit.userData.type);
      const newSprite = createTextSprite(newLabel || def.label, def.color);
      const spriteY = 0.5;
      newSprite.position.set(selectedUnit.position.x, selectedUnit.position.y + spriteY, selectedUnit.position.z);
      newSprite.userData.parentUnit = selectedUnit;
      newSprite.userData.offsetY = spriteY;
      scene.add(newSprite);
      unitLabelSprites.push(newSprite);
    }
    updateUnitList();
  });
  document.querySelectorAll('[data-scale]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = parseFloat(btn.dataset.scale);
      document.getElementById('scaleInput').value = val;
      document.getElementById('unitScaleSlider').value = val;
      applyTransform();
    });
  });

  // ─── Clear buttons ───
  document.getElementById('clearAnnotBtn')?.addEventListener('click', () => {
    annotationMeshes.forEach(a => scene.remove(a)); annotationMeshes.length = 0;
    showToast('🗑️ 所有标注已清除'); updateAnnotCount();
  });
  document.getElementById('clearUnitsBtn')?.addEventListener('click', () => {
    unitMeshes.forEach(u => scene.remove(u)); unitMeshes.length = 0;
    unitLabelSprites.forEach(s => scene.remove(s)); unitLabelSprites.length = 0;
    selectedUnit = null; showToast('🗑️ 所有单位已清除'); updateUnitList(); updateTransformPanel();
  });

  // ─── Model uploads ───
  const singleUploadZone = document.getElementById('singleUploadZone');
  const singleInput = document.getElementById('singleModelUpload');
  singleUploadZone?.addEventListener('click', () => singleInput?.click());
  singleUploadZone?.addEventListener('dragover', (e) => { e.preventDefault(); singleUploadZone.classList.add('dragover'); });
  singleUploadZone?.addEventListener('dragleave', () => singleUploadZone.classList.remove('dragover'));
  singleUploadZone?.addEventListener('drop', (e) => { e.preventDefault(); singleUploadZone.classList.remove('dragover'); if (e.dataTransfer.files.length) handleSingleModelUpload(e.dataTransfer.files[0]); });
  singleInput?.addEventListener('change', (e) => { if (e.target.files.length) handleSingleModelUpload(e.target.files[0]); });

  const batchUploadZone = document.getElementById('batchUploadZone');
  const batchInput = document.getElementById('batchModelUpload');
  batchUploadZone?.addEventListener('click', () => batchInput?.click());
  batchUploadZone?.addEventListener('dragover', (e) => { e.preventDefault(); batchUploadZone.classList.add('dragover'); });
  batchUploadZone?.addEventListener('dragleave', () => batchUploadZone.classList.remove('dragover'));
  batchUploadZone?.addEventListener('drop', (e) => { e.preventDefault(); batchUploadZone.classList.remove('dragover'); if (e.dataTransfer.files.length) handleModelUpload(e.dataTransfer.files, sceneGroups[0]?.id); });
  batchInput?.addEventListener('change', (e) => { if (e.target.files.length) handleModelUpload(e.target.files, sceneGroups[0]?.id); });
}

// ═══════════════════════════════════════════════════════════
//  NAV SECTION TOGGLE
// ═══════════════════════════════════════════════════════════
function toggleNavSection(sectionId) {
  // Update state
  for (const key of Object.keys(navSections)) {
    if (key === sectionId) {
      navSections[key].open = !navSections[key].open;
      navSections[key].active = navSections[key].open;
    } else {
      navSections[key].open = false;
      navSections[key].active = false;
    }
  }
  // Update DOM
  document.querySelectorAll('.nav-section-header').forEach(h => {
    const sec = h.dataset.section;
    h.classList.toggle('open', navSections[sec]?.open);
    h.classList.toggle('active', navSections[sec]?.active);
  });
  document.querySelectorAll('.nav-section-body').forEach(b => {
    const sec = b.dataset.section;
    b.classList.toggle('open', navSections[sec]?.open);
  });
  document.querySelectorAll('#sidebar-rail .rail-icon[data-section]').forEach(icon => {
    icon.classList.toggle('active', navSections[icon.dataset.section]?.active);
  });
}

// ═══════════════════════════════════════════════════════════
//  SCENE SELECTOR
// ═══════════════════════════════════════════════════════════
function renderSceneSelector() {
  const container = document.getElementById('sceneSelector'); if (!container) return;
  let totalScenes = 0;
  let html = '';
  sceneGroups.forEach(group => {
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
      const sd = sceneDataStore[sc.id];
      const hasModel = sd?.model;
      const isActive = sc.id === currentSceneId;
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
      const g = sceneGroups.find(x => x.id === gid);
      if (g) { g.collapsed = !g.collapsed; renderSceneSelector(); }
    });
  });
  container.querySelectorAll('.scene-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-card-action]')) return;
      switchScene(card.dataset.sid);
    });
  });
  container.querySelectorAll('[data-grp-action="add"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const gid = btn.dataset.gid;
      const g = sceneGroups.find(x => x.id === gid); if (!g) return;
      const sceneId = `scene_${Date.now()}`;
      const name = `场景 ${g.scenes.length + 1}`;
      initSceneData(sceneId, name, null);
      g.scenes.push({ id: sceneId, name }); g.collapsed = false;
      renderSceneSelector(); showToast(`✅ 已添加: ${name}`);
    });
  });
  container.querySelectorAll('[data-grp-action="rename"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const gid = btn.dataset.gid;
      const g = sceneGroups.find(x => x.id === gid); if (!g) return;
      const name = prompt('输入新分组名称:', g.name); if (name) { g.name = name; renderSceneSelector(); }
    });
  });
  container.querySelectorAll('[data-grp-action="del"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const gid = btn.dataset.gid;
      if (sceneGroups.length <= 1) { showToast('⚠️ 至少保留一个分组'); return; }
      if (!confirm('确定删除此分组?')) return;
      sceneGroups = sceneGroups.filter(x => x.id !== gid); renderSceneSelector();
    });
  });
  container.querySelectorAll('[data-card-action="rename"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = btn.dataset.sid;
      const sd = sceneDataStore[sid]; if (!sd) return;
      const name = prompt('输入新场景名称:', sd.name);
      if (name) {
        sd.name = name;
        for (const g of sceneGroups) { const s = g.scenes.find(x => x.id === sid); if (s) s.name = name; }
        renderSceneSelector();
      }
    });
  });
  container.querySelectorAll('[data-card-action="del"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = btn.dataset.sid; const gid = btn.dataset.gid;
      if (sid === currentSceneId) { showToast('⚠️ 不能删除当前活动场景'); return; }
      if (!confirm('确定删除此场景?')) return;
      const g = sceneGroups.find(x => x.id === gid);
      if (g) g.scenes = g.scenes.filter(x => x.id !== sid);
      delete sceneDataStore[sid]; renderSceneSelector();
    });
  });
  document.getElementById('addGroupBtn')?.addEventListener('click', () => {
    const name = prompt('输入分组名称:', '新分组');
    if (name) {
      sceneGroups.push({ id: `grp_${Date.now()}`, name, collapsed: false, scenes: [] });
      renderSceneSelector(); showToast(`✅ 分组已创建: ${name}`);
    }
  });
  updateCurrentModelInfo();

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
      saveSceneToJson(currentSceneId);
    });
    const fileInput = document.getElementById('sceneFileInput');
    fileInput?.addEventListener('change', (e) => {
      if (e.target.files?.[0]) {
        loadSceneFromJson(e.target.files[0]);
        e.target.value = '';
        e.target._importing = false;
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════
//  VIEWPOINT SELECTOR
// ═══════════════════════════════════════════════════════════
let draggedViewpoint = null;

function renderViewpointSelector() {
  const container = document.getElementById('viewpointSelector');
  if (!container) return;

  const sd = getCurrentSceneData();
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
      if (g) { g.collapsed = !g.collapsed; renderViewpointSelector(); }
    });
  });

  // Viewpoint card click - jump to viewpoint
  container.querySelectorAll('.viewpoint-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-vp-action]')) return;
      const vpid = card.dataset.vpid;
      const vp = vpGroups.flatMap(g => g.viewpoints || []).find(v => v.id === vpid);
      if (vp) jumpToViewpoint(vp);
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
      const vp = { id: `vp_${Date.now()}`, name, ...getCurrentCameraState() };
      group.viewpoints.push(vp);
      renderViewpointSelector();
      showToast(`✅ 已保存视角: ${name}`);
    });
  });
  container.querySelectorAll('[data-vp-grp-action="rename"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const gid = btn.dataset.gid;
      const g = vpGroups.find(x => x.id === gid);
      if (!g) return;
      const name = prompt('输入新分组名称:', g.name);
      if (name) { g.name = name; renderViewpointSelector(); }
    });
  });
  container.querySelectorAll('[data-vp-grp-action="del"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (vpGroups.length <= 1) { showToast('⚠️ 至少保留一个分组'); return; }
      if (!confirm('确定删除此分组?')) return;
      const filtered = vpGroups.filter(x => x.id !== btn.dataset.gid);
      sd.viewpointGroups = filtered;
      renderViewpointSelector();
    });
  });

  // Viewpoint actions
  container.querySelectorAll('[data-vp-action="rename"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const vpid = btn.dataset.vpid;
      const vp = vpGroups.flatMap(g => g.viewpoints || []).find(v => v.id === vpid);
      if (!vp) return;
      const name = prompt('输入新视角名称:', vp.name);
      if (name) { vp.name = name; renderViewpointSelector(); }
    });
  });
  container.querySelectorAll('[data-vp-action="del"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const vpid = btn.dataset.vpid;
      vpGroups.forEach(g => { if (g.viewpoints) g.viewpoints = g.viewpoints.filter(v => v.id !== vpid); });
      renderViewpointSelector();
    });
  });

  // Drag to reorder
  container.querySelectorAll('.viewpoint-card').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      draggedViewpoint = card.dataset.vpid;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      container.querySelectorAll('.viewpoint-card').forEach(c => c.classList.remove('drag-over'));
      draggedViewpoint = null;
    });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (draggedViewpoint && draggedViewpoint !== card.dataset.vpid) {
        card.classList.add('drag-over');
      }
    });
    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      if (!draggedViewpoint || draggedViewpoint === card.dataset.vpid) return;
      const targetId = card.dataset.vpid;
      let srcVp, tgtVp, srcGroup, tgtGroup;
      for (const g of vpGroups) {
        const s = (g.viewpoints || []).find(v => v.id === draggedViewpoint);
        const t = (g.viewpoints || []).find(v => v.id === targetId);
        if (s) { srcVp = s; srcGroup = g; }
        if (t) { tgtVp = t; tgtGroup = g; }
      }
      if (!srcVp || !tgtVp) return;
      if (srcGroup.id === tgtGroup.id) {
        const arr = srcGroup.viewpoints;
        const si = arr.findIndex(v => v.id === draggedViewpoint);
        const ti = arr.findIndex(v => v.id === targetId);
        arr.splice(si, 1);
        arr.splice(ti, 0, srcVp);
      } else {
        srcGroup.viewpoints = srcGroup.viewpoints.filter(v => v.id !== draggedViewpoint);
        const ti = tgtGroup.viewpoints.findIndex(v => v.id === targetId);
        tgtGroup.viewpoints.splice(ti, 0, srcVp);
      }
      renderViewpointSelector();
    });
  });

  // Add new group button
  document.getElementById('addVPGroupBtn')?.addEventListener('click', () => {
    const name = prompt('输入分组名称:', '📂 新分组');
    if (name) {
      const finalName = /^[a-zA-Z0-9]/.test(name) ? '📂 ' + name : name;
      vpGroups.push({ id: `vpg_${Date.now()}`, name: finalName, collapsed: false, viewpoints: [] });
      renderViewpointSelector();
      showToast(`✅ 分组已创建: ${finalName}`);
    }
  });
}

// ═══════════════════════════════════════════════════════════
//  PHASE BAR
// ═══════════════════════════════════════════════════════════
function renderPhaseBar() {
  const bar = document.getElementById('phaseBar'); if (!bar) return;
  const phases = getPhases();
  let html = '';
  phases.forEach((p, i) => {
    html += `<button class="phase-btn ${i === currentPhase ? 'active' : ''}" data-phase="${i}">${p.name}</button>`;
  });
  html += `<button class="action-btn" id="addPhaseBtn" style="margin-left:8px;">+ 阶段</button>`;
  html += `<button class="action-btn" id="playAllBtn" style="margin-left:4px;">▶ 演示</button>`;
  bar.innerHTML = html;
  bar.querySelectorAll('.phase-btn').forEach(btn => {
    btn.addEventListener('click', () => switchPhase(parseInt(btn.dataset.phase)));
    btn.addEventListener('dblclick', () => {
      const idx = parseInt(btn.dataset.phase);
      const phases = getPhases();
      const newName = prompt('阶段名称:', phases[idx].name);
      if (newName) { phases[idx].name = newName; renderPhaseBar(); }
    });
  });
  document.getElementById('addPhaseBtn')?.addEventListener('click', () => {
    const phases = getPhases();
    const name = prompt('阶段名称:', `阶段 ${phases.length + 1}`);
    if (name) { phases.push({ name, units: [], annotations: [] }); renderPhaseBar(); showToast(`✅ 已添加阶段: ${name}`); }
  });
  document.getElementById('playAllBtn')?.addEventListener('click', () => {
    const phases = getPhases();
    if (phases.length < 2) { showToast('⚠️ 至少需要两个阶段'); return; }
    let idx = 0;
    const play = () => {
      if (idx >= phases.length - 1) { showToast('✅ 演示完成'); return; }
      switchPhase(idx + 1, true); idx++;
      setTimeout(play, 2000);
    };
    switchPhase(0, false); setTimeout(play, 1000);
  });
}

// ═══════════════════════════════════════════════════════════
//  UNIT LIST (RIGHT PANEL)
// ═══════════════════════════════════════════════════════════
function updateUnitList() {
  const container = document.getElementById('unitListContainer'); if (!container) return;
  const countEl = document.getElementById('unitCount');
  if (countEl) countEl.textContent = unitMeshes.length;
  if (unitMeshes.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:20px; color:#475569; font-size:11px;">暂无单位<br><span style="font-size:9px;">从左侧面板选择单位并点击场景放置</span></div>`;
    return;
  }
  // Group by monster / player
  const monsters = unitMeshes.filter(u => u.userData.isMonster);
  const players = unitMeshes.filter(u => !u.userData.isMonster);
  let html = '';
  if (monsters.length > 0) {
    html += `<div style="font-size:9px; font-weight:700; color:#f97316; padding:2px 4px; margin-bottom:2px;">👹 怪物 (${monsters.length})</div>`;
    monsters.forEach(u => { html += buildUnitListItem(u); });
  }
  if (players.length > 0) {
    html += `<div style="font-size:9px; font-weight:700; color:#3b82f6; padding:2px 4px; margin-top:4px; margin-bottom:2px;">⚔️ 玩家 (${players.length})</div>`;
    players.forEach(u => { html += buildUnitListItem(u); });
  }
  container.innerHTML = html;
  container.querySelectorAll('.unit-list-item').forEach(item => {
    item.addEventListener('click', () => {
      const name = item.dataset.name;
      const unit = unitMeshes.find(u => u.name === name);
      if (unit) { clearSelectionVisuals(); selectedUnit = unit; addSelectionVisual(unit); updateTransformPanel(); }
    });
  });
  container.querySelectorAll('.unit-del-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = btn.dataset.name;
      const unit = unitMeshes.find(u => u.name === name);
      if (unit) {
        scene.remove(unit);
        const idx = unitMeshes.indexOf(unit); if (idx > -1) unitMeshes.splice(idx, 1);
        const spriteIdx = unitLabelSprites.findIndex(s => s.userData.parentUnit === unit);
        if (spriteIdx > -1) { scene.remove(unitLabelSprites[spriteIdx]); unitLabelSprites.splice(spriteIdx, 1); }
        if (selectedUnit === unit) { selectedUnit = null; updateTransformPanel(); }
        showToast('🗑️ 单位已删除'); updateUnitList();
      }
    });
  });
  updateAnnotCount();
}

function buildUnitListItem(u) {
  const def = getUnitDef(u.userData.type);
  const isSelected = u === selectedUnit;
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

// ═══════════════════════════════════════════════════════════
//  TOOLBAR / SCALE / INFO HELPERS
// ═══════════════════════════════════════════════════════════
function updateToolbarSelection() {
  document.querySelectorAll('.unit-card').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.nav-tool-btn').forEach(b => {
    if (['arrow', 'zone', 'label'].includes(b.dataset.tool)) b.classList.remove('active');
  });
  document.getElementById('zoneOptions')?.classList.remove('visible');
  document.getElementById('labelOptions')?.classList.remove('visible');
}

function updateTransformPanel() {
  const panel = document.getElementById('transformPanel');
  if (!panel) return;
  if (!selectedUnit) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  const p = selectedUnit.position;
  const r = selectedUnit.rotation;
  const s = selectedUnit.scale.x;
  document.getElementById('posX').value = p.x.toFixed(2);
  document.getElementById('posY').value = p.y.toFixed(2);
  document.getElementById('posZ').value = p.z.toFixed(2);
  document.getElementById('rotX').value = (r.x * 180 / Math.PI).toFixed(1);
  document.getElementById('rotY').value = (r.y * 180 / Math.PI).toFixed(1);
  document.getElementById('rotZ').value = (r.z * 180 / Math.PI).toFixed(1);
  document.getElementById('scaleInput').value = s.toFixed(3);
  document.getElementById('unitScaleSlider').value = s;
  document.getElementById('unitNameInput').value = selectedUnit.userData.label || '';
}

function applyTransform() {
  if (!selectedUnit) return;
  const px = parseFloat(document.getElementById('posX').value) || 0;
  const py = parseFloat(document.getElementById('posY').value) || 0;
  const pz = parseFloat(document.getElementById('posZ').value) || 0;
  const rx = (parseFloat(document.getElementById('rotX').value) || 0) * Math.PI / 180;
  const ry = (parseFloat(document.getElementById('rotY').value) || 0) * Math.PI / 180;
  const rz = (parseFloat(document.getElementById('rotZ').value) || 0) * Math.PI / 180;
  const scale = parseFloat(document.getElementById('scaleInput').value) || 0.1;
  selectedUnit.position.set(px, py, pz);
  selectedUnit.rotation.set(rx, ry, rz);
  selectedUnit.scale.set(scale, scale, scale);
  selectedUnit.userData.unitScale = scale;
  // 同步更新精灵位置
  const sprite = unitLabelSprites.find(s => s.userData.parentUnit === selectedUnit);
  if (sprite) {
    sprite.position.set(px, py + sprite.userData.offsetY, pz);
  }
}

function updateCurrentModelInfo() {
  const el = document.getElementById('currentModelInfo'); if (!el) return;
  const sd = getCurrentSceneData();
  if (sd?.model?.fileName) {
    el.textContent = sd.model.fileName; el.style.color = '#22c55e';
  } else {
    el.textContent = '无模型'; el.style.color = '#475569';
  }
}

function updateAnnotCount() {
  const el = document.getElementById('annotCount'); if (el) el.textContent = annotationMeshes.length;
}

// ═══════════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════════
let toastTimeout = null;
function showToast(msg) {
  const toast = document.getElementById('toast'); if (!toast) return;
  toast.textContent = msg; toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ═══════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════
init();