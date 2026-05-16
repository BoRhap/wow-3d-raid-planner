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
    // Remove existing model
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

    if (modelInfo.type === 'glb' || modelInfo.type === 'gltf') {
      this.gltfLoader.load(modelInfo.dataUrl, onLoaded, undefined, onError);
    } else if (modelInfo.type === 'fbx') {
      this.fbxLoader.load(modelInfo.dataUrl, onLoaded, undefined, onError);
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
    // Downward ray
    const ray = new THREE.Raycaster(
      new THREE.Vector3(x, this.clipModelMaxY + 50, z),
      new THREE.Vector3(0, -1, 0),
      0, this.clipModelMaxY + 100
    );
    const hits = ray.intersectObjects(meshes, false);
    if (hits.length > 0) return hits[0].point.y + 0.3;
    // Upward ray (for overhangs)
    const upRay = new THREE.Raycaster(
      new THREE.Vector3(x, this.clipModelMinY - 10, z),
      new THREE.Vector3(0, 1, 0),
      0, this.clipModelMaxY + 50
    );
    const upHits = upRay.intersectObjects(meshes, false);
    return upHits.length > 0 ? upHits[0].point.y + 0.3 : 0.5;
  }
}
