// src/App.js
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import naxx01Glb from './map/naxx-01.glb?url';
import naxx02Glb from './map/naxx-02.glb?url';

// Constants are imported directly by the modules that use them (UnitManager, etc.)
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

function downloadJson(data, filename) {
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

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
    this.annotationManager = new AnnotationManager(this.sceneManager, this.dataStore, this.unitManager);
    this.phaseManager = new PhaseManager(this.dataStore, this.unitManager, this.annotationManager, this.sceneManager, this.modelManager);
    this.viewpointManager = new ViewpointManager(this.sceneManager, this.dataStore);

    // 4. UI layer (created first so callbacks can reference it)
    this.uiManager = new UIManager({
      dataStore: this.dataStore,
      sceneManager: this.sceneManager,
      unitManager: this.unitManager,
      annotationManager: this.annotationManager,
      phaseManager: this.phaseManager,
      viewpointManager: this.viewpointManager,
      modelManager: this.modelManager,
      clipPlaneManager: this.clipPlaneManager,
      interactionManager: null // set after interactionManager is created
    });

    // Expose downloadJson for UIManager use
    this.uiManager.downloadJson = downloadJson;

    // 5. Interaction layer (needs UI callbacks)
    const interactionCallbacks = {
      showToast: (...args) => this.uiManager.showToast(...args),
      updateUnitList: (...args) => this.uiManager.updateUnitList(...args),
      updateTransformPanel: (...args) => this.uiManager.updateTransformPanel(...args),
      updateToolbarSelection: (...args) => this.uiManager.updateToolbarSelection(...args),
      updateAnnotCount: (...args) => this.uiManager.updateAnnotCount(...args),
      clearAnnotationSelection: (...args) => this.uiManager.clearAnnotationSelection(...args),
      addAnnotationSelection: (...args) => this.uiManager.addAnnotationSelection(...args),
      showAnnotationEditPanel: (...args) => this.uiManager.showAnnotationEditPanel(...args),
      hideAnnotationEditPanel: (...args) => this.uiManager.hideAnnotationEditPanel(...args),
      toggleFreeRoamMode: (...args) => this.uiManager.toggleFreeRoamMode(...args),
    };

    this.interactionManager = new InteractionManager(
      this.sceneManager, this.unitManager, this.annotationManager,
      this.modelManager, this.dataStore, this.phaseManager,
      interactionCallbacks
    );

    // Wire interactionManager back to uiManager
    this.uiManager.interactionManager = this.interactionManager;
  }

  async start() {
    this.sceneManager.init();

    // Wire free-roam mouse
    document.addEventListener('mousemove', (e) => {
      this.sceneManager.handleMouseMoveForFreeRoam(e);
    });

    // Initialize clip height from model bounds
    this.clipPlaneManager.height = this.modelManager.clipModelMaxY + 1;
    this.clipPlaneManager.clipPlane.constant = this.clipPlaneManager.height;

    // Build UI
    this.uiManager.buildUI();

    // Bind interaction events
    this.interactionManager.bindEvents(this.sceneManager.getRenderer().domElement);

    // Load initial model
    const sd = this.dataStore.getCurrentSceneData();
    if (sd.model) {
      this.modelManager.loadModelIntoScene(sd.model, () => {
        // Update clip range after model loads
        const range = this.clipPlaneManager.updateRange();
        this.clipPlaneManager.height = range.max;
        this.clipPlaneManager.clipPlane.constant = range.max;
      });
    }

    // Load custom items
    await this.unitManager.loadCustomItems();
    // populateCustomGrid will be called from within buildUI flow
    // It's already called above, but we need it after loadCustomItems completes
    this.uiManager.populateCustomGrid();

    // Save current state for initial phase
    this.dataStore.savePhaseState(this.unitManager.meshes, this.annotationManager.meshes);

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
