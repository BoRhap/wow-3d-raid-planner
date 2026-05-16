# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```
npm run dev      # Start Vite dev server with HMR
npm run build    # Production build to dist/
npm run preview  # Preview production build locally
```

No test or lint commands exist yet.

## Architecture

Single-file vanilla JavaScript SPA (`index.js`, ~3,300 lines) + Three.js 0.183 for 3D rendering. No React, Vue, TypeScript, or state management library. Vite 6 is the build tool but Three.js itself is loaded at runtime via CDN importmap in `index.html` (not bundled).

### Code organization (index.js sections)

| Lines | Section | Key functions |
|-------|---------|---------------|
| 1–8 | Imports | Three.js core + OrbitControls, GLTFLoader, FBXLoader, DRACOLoader, TGALoader |
| 17–62 | Globals | Scene, camera, renderer, raycaster, state for selection/placement/dragging/clipping/free-roam |
| 107–167 | Unit definitions | `UNIT_CATEGORIES` — monsters, player roles, player classes, custom items (TGA icons from `src/icons/`) |
| 198–232 | Scene system | Two-level hierarchy: `sceneGroups[]` → scenes → `sceneDataStore[sceneId]` with phases, models, viewpoints |
| 242–306 | Init | `init()` — renderer, camera, controls, lighting, ground, rune particles, animation loop |
| 351–423 | Model loading | `loadModelIntoScene()` — GLB/GLTF (Draco), FBX; auto-scaling, material setup, shadow config |
| 425–438 | Environment | Ground plane, grid, border lines |
| 440–903 | Unit placement | `createChibiMesh()` procedural character geometry, `createCustomMesh()` for TGA items, selection visuals, transform panel |
| 904–1010 | Annotation edit | Inline panel at mouse position for editing arrow/zone/label properties |
| 1011–1088 | Annotations | `createArrowAnnotation()`, `createZoneAnnotation()`, `createLabelAnnotation()` |
| 1090–1341 | Save/Load | Phase state serialization, JSON import/export, animated phase transitions |
| 1343–1370 | Model upload | `handleModelUpload()`, `handleBatchModelUpload()` — browser File API |
| 1371–1434 | Clip plane | Z-axis clipping with `THREE.Plane`, helper visualization |
| 1435–1494 | Raycasting | `getModelSurfaceHeight()`, `getSceneIntersect()`, `getUnitIntersect()`, `getAnnotationIntersect()` |
| 1496–1761 | Events | Click, drag, hover, keyboard (WASD free-roam), resize, context menu |
| 1762–1790 | Animation loop | `animate()` — idle bob, selection pulse, particle rotation, free-roam movement |
| 1795–3290 | UI | `buildUI()` — pure DOM construction: sidebar rail + content, phase bar, unit list, viewpoint manager |
| 3293–3302 | Toast | `showToast()` — floating notification |

### Data model

- **`sceneDataStore`** — Map of `sceneId` → `{ name, model, phases[], viewpointGroups[] }`
- **`sceneGroups`** — Array of `{ id, label, icon, scenes[] }` defining the scene picker tree
- **`unitMeshes[]`** — Live array of placed Three.js Group meshes
- **`annotationMeshes[]`** — Live array of annotation Groups (arrows, zones, labels)
- **`currentSceneId` / `currentPhase`** — Active selection indices
- Phases are stored within scene data; switching phases saves current state to the current phase and loads the next

### 3D rendering patterns

- Units are procedurally generated chibi-style characters (`createChibiMesh()`) — no external model files for units
- Labels and icons use `THREE.Sprite` with canvas-drawn textures (`createTextSprite()`)
- Surface snapping: `getModelSurfaceHeight(x, z)` raycasts against loaded model meshes to find Y at a given XZ
- Unit drag uses a horizontal plane at the unit's current Y for stable repositioning
- Free-roam mode uses pointer lock API with WASD/QE/Shift movement

### No framework UI

All UI is built via `buildUI()` using `document.createElement`, `innerHTML`, and inline CSS in a `<style>` tag. Sidebar uses a rail+content pattern with collapsible accordion sections. State is tracked in DOM element visibility and the `navSections` object.

### Assets

- `src/map/` — 3D scene models (`.glb` for runtime, `.fbx` as source)
- `src/icons/` — `.tga` icon textures for custom items
- Models are imported as URL strings via Vite: `import naxx01Glb from './src/map/naxx-01.glb?url'`
