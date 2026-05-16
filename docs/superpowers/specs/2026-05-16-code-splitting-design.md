# Code Splitting Design: index.js → Modular Architecture

## Goal

Split the monolithic `index.js` (~3,300 lines) into 11 focused modules with class-based encapsulation, while switching Three.js from CDN importmap to Vite npm bundling.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Full — readability, collaboration, testability | User wants all three |
| Three.js loading | Vite npm bundling | Clearer dependencies, enables tree-shaking |
| Module style | ES6 classes with dependency injection | Encapsulation, injectable deps for testing |
| Granularity | Medium (11 files) | Matches existing section boundaries |
| Migration | Incremental (6 steps), each verifiable | Zero-risk, can revert at any step |

## File Structure

```
src/
  App.js                 # Entry: assembles all modules, starts app
  Constants.js           # UNIT_CATEGORIES, CUSTOM_ITEM_PATHS, defaults (no class)
  DataStore.js           # class DataStore — scene/phase/viewpoint CRUD, JSON I/O
  SceneManager.js        # class SceneManager — renderer, camera, lights, ground, particles, animate loop
  ModelManager.js        # class ModelManager — GLB/FBX loading, upload, model surface queries
  ClipPlaneManager.js    # class ClipPlaneManager — Z-axis clipping plane with helper
  UnitManager.js         # class UnitManager — chibi mesh creation, placement, drag, selection
  AnnotationManager.js   # class AnnotationManager — arrow/zone/label creation, editing, inline panel
  PhaseManager.js        # class PhaseManager — phase switching, animated transitions
  ViewpointManager.js    # class ViewpointManager — save/load/jump camera viewpoints, groups
  InteractionManager.js  # class InteractionManager — raycaster, mouse/keyboard events, dispatch
  UIManager.js           # class UIManager — sidebar, phase bar, unit list, toast, all DOM construction
```

## Module Responsibilities

### Constants.js
- Exports `UNIT_CATEGORIES`, `CUSTOM_ITEM_PATHS`, default colors, ground size
- Pure data, no imports, no logic

### DataStore
- Manages `sceneGroups[]` (scene tree) and `sceneDataStore` (Map of sceneId → data)
- Runtime state: `currentSceneId`, `currentPhase`, `selectedUnit`, `selectedAnnotation`, `hoveredUnit`, `hoveredAnnotation`, `placementMode`, `playerViewMode`
- Methods: `getCurrentSceneData()`, `getCurrentPhaseData()`, `savePhaseState()`, `loadPhaseState()`, CRUD for scenes/phases/viewpoints
- JSON export/import: `exportSceneJSON()`, `importSceneJSON()`
- **No Three.js imports, no DOM access**

### SceneManager
- Creates: renderer, camera, scene, controls, clock
- Lighting setup (ambient, 3 directional, hemisphere, 4 point lights)
- Ground plane, grid helper, border lines
- Rune particle system (150 ambient floating particles)
- `animate()` loop: idle bob, selection pulse, particle rotation, free-roam movement
- Free-roam: pointer lock, WASD/QE/Shift movement, speed control
- Exposes getters: `getCamera()`, `getScene()`, `getRenderer()`, `getControls()`, `getClock()`

### ModelManager
- `loadModelIntoScene(url, type)` — supports GLB/GLTF (with Draco) and FBX
- Auto-scales to fit ground, centers, sets materials/shadows
- `clearModel()` — removes current model from scene
- `handleModelUpload(file)`, `handleBatchModelUpload(files)` — browser File API
- Exposes model mesh list for raycasting targets

### ClipPlaneManager
- Creates/destroys `THREE.Plane` clipping plane
- Helper visualization (semi-transparent plane)
- Slider-friendly `clipHeight` with min/max from model bounds
- `enable()`, `disable()`, `setHeight(h)`

### UnitManager
- `createChibiMesh(unitDef)` — procedural sphere/capsule/cone/torus geometry
- `createCustomMesh(itemId, texture)` — textured box with TGA icon
- `enterPlacementMode(type)`, `exitPlacementMode()`
- `selectUnit(mesh)`, `deselectUnit()`, `deleteUnit(mesh)`
- Drag-to-move on horizontal plane at unit Y
- Transform panel data (position/rotation/scale read/write)
- Manages `unitMeshes[]` and `unitLabelSprites[]` arrays
- Idle bob animation and selection pulse visual
- Depends on: SceneManager (scene graph), DataStore (unit data), ModelManager (surface height)

### AnnotationManager
- `createArrowAnnotation(startPos, endPos, color)`
- `createZoneAnnotation(center, radius, color, label)`
- `createLabelAnnotation(position, text)`
- `selectAnnotation(mesh)`, `deselectAnnotation()`, `deleteAnnotation(mesh)`
- Inline edit panel at mouse position (color picker, text input, radius slider)
- Manages `annotationMeshes[]` array
- Depends on: SceneManager, DataStore

### PhaseManager
- `switchPhase(index)` — save current state, load target phase
- `addPhase(name)`, `removePhase(index)`, `renamePhase(index, name)`
- `startAutoPlay()` — cycles through phases with animated transitions
- `animatePhaseTransition()` — lerp positions with arc effect, particles, fade out removed units
- Depends on: UnitManager, AnnotationManager, DataStore, SceneManager

### ViewpointManager
- `saveViewpoint(name, groupId)` — captures camera state
- `jumpToViewpoint(viewpoint)` — restores camera position/target/quaternion
- `addGroup(name)`, `removeGroup(id)`, `renameGroup(id, name)`
- `reorderViewpoints(groupId, fromIndex, toIndex)`
- Depends on: SceneManager, DataStore

### InteractionManager
- Raycaster functions:
  - `getModelSurfaceHeight(x, z)` — find Y on model surface
  - `getSceneIntersect(event)` — hit test against model + ground
  - `getUnitIntersect(event)` — hit test against unitMeshes
  - `getAnnotationIntersect(event)` — hit test against annotationMeshes
- Mouse events: click, mousemove, mousedown, mouseup, contextmenu
- Keyboard events: WASD for free-roam, Escape to cancel placement
- `setRaycastTargets(units, annotations, model)` — update target lists
- Depends on: SceneManager (camera, renderer), UnitManager, AnnotationManager, ModelManager

### UIManager
- `buildUI()` — creates all DOM, appends to document.body
- `injectStyles()` — creates `<style>` tag with ~200 lines CSS
- Internal private methods organized by UI region:
  - `#buildSidebar()`, `#buildRail()`, `#switchNavSection()`, `#toggleSidebar()`
  - `#renderSceneSelector()`, `#renderViewTools()`, `#renderViewpointSelector()`
  - `#renderUnitPalette()`, `#renderAnnotationTools()`
  - `#buildPhaseBar()`, `#renderPhaseBar()`
  - `#buildUnitListPanel()`, `#updateUnitList()`
  - `#showTransformPanel()`, `#showAnnotationEditPanel()`
- `showToast(msg)` — only public method beyond `buildUI()`
- Depends on: all other modules (for event callbacks)

### App.js
- Dependency injection center: creates all modules, wires them together
- `constructor()` — instantiate in dependency order
- `start()` — call `sceneManager.start()` to begin render loop
- Entry point: `new App().start()` called from module import

## Communication Patterns

1. **Constructor dependency injection** — modules receive references to their deps via constructor options object
2. **Direct method calls** — UI event callbacks call module methods directly (e.g., click unit card → `unitManager.enterPlacementMode('boss')`)
3. **DataStore as shared state** — cross-cutting state (selection, placement mode, current phase) lives in DataStore
4. **Getters for rendering primitives** — SceneManager exposes `getCamera()`, `getScene()`, etc. so other modules access Three.js objects without importing three themselves

## What stays out of DataStore

| Variable | Owner | Reason |
|----------|-------|--------|
| `unitMeshes[]` | UnitManager | Single writer |
| `annotationMeshes[]` | AnnotationManager | Single writer |
| `freeRoamMode, keys{}` | SceneManager | Internal camera state |
| `navSections` | UIManager | UI-only state |
| `clipEnabled, clipHeight` | ClipPlaneManager | Single module |
| `isDragging, dragTarget` | InteractionManager | Transient |
| `currentSceneModel` | ModelManager | Single writer |
| `brightness` | SceneManager | Render parameter |

## Three.js Migration

**Before (CDN importmap):**
```html
<script type="importmap">
  { "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.183.2/..." } }
</script>
```

**After (npm):**
```js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
```

- Remove importmap from `index.html`
- Three.js is already in `package.json` dependencies (`"three": "^0.183.2"`)
- Vite 6 handles Three.js module resolution natively
- No `vite.config.js` changes needed

## Migration Steps

### Step 1: Switch Three.js loading
- Replace CDN importmap imports with npm imports in index.js
- Remove `<script type="importmap">` from index.html
- Verify: `npm run dev`, page renders, models load

### Step 2: Extract Constants.js + DataStore.js
- Move `UNIT_CATEGORIES`, custom items registry to Constants.js
- Move `sceneDataStore`, `sceneGroups`, getter/setter methods to DataStore.js
- Import in index.js, replace globals
- Verify: scene switching, phase data persistence

### Step 3: Extract SceneManager + ModelManager + ClipPlaneManager
- Create three class files
- Create App.js skeleton with constructor wiring
- Verify: 3D scene renders, models load, clipping works

### Step 4: Extract UnitManager + AnnotationManager
- Create two class files
- Wire into App.js
- Verify: unit placement, selection, drag; annotation creation and editing

### Step 5: Extract PhaseManager + ViewpointManager + InteractionManager
- Create three class files
- Wire into App.js
- Verify: phase switching animation, viewpoint save/jump, mouse/keyboard interaction

### Step 6: Extract UIManager + finalize
- Create UIManager.js
- Complete App.js wiring
- Update index.html entry to `/src/App.js`
- Remove index.js
- Verify: full feature regression

### Risk mitigation
- Steps 2-5 keep index.js operational; new modules coexist
- Verify with `npm run dev` after each step
- Any step failure → delete new files, continue with index.js code
- `npm run build` at the end to confirm production build works

## Verification

After full migration:
1. `npm run dev` — app loads without errors
2. Scene switching — select different scenes
3. Model loading — GLB models render with textures
4. Unit placement — all unit types placeable, draggable, selectable
5. Unit transform — position/rotation/scale editing works
6. Annotations — arrows, zones, labels creatable, editable, deletable
7. Phase management — add/switch phases, auto-play animation
8. Viewpoints — save camera position, jump to saved viewpoint
9. Free-roam — WASD movement, pointer lock
10. Clip plane — enable/disable, height slider
11. Import/Export — save to JSON, load from JSON
12. `npm run build` — production build succeeds
