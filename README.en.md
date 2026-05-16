# WoW-Style 3D Raid Tactics Planner

> 魔兽世界 3D 战术规划工具

A browser-based, World of Warcraft-themed 3D raid tactics planning tool. Place monster and player units on 3D dungeon maps, annotate strategies with arrows/zones/labels, manage multiple combat phases, and present full tactical walkthroughs with animated phase transitions.

---

## Features

- **3D Scene Management** — Load GLB/FBX dungeon models (Naxxramas pre-included); upload custom maps
- **Unit Placement** — Monsters (Boss, Add, Elite, Summoned, Mob Group), Player Roles (Tank, Healer, DPS), Player Classes (Warrior, Mage, etc.), and Custom Items
- **Annotation Tools** — Directional arrows, circular zones, and text labels with color/size editing
- **Multi-Phase System** — Create multiple combat phases per scene with smooth animated transitions
- **Auto-Play Demo** — Cycle through all phases sequentially to present the complete tactical timeline
- **Free Roam** — First-person WASD flight for recording strategy walkthroughs
- **Z-Axis Clipping** — Slice through the top of 3D models to inspect interior layouts and unit positioning
- **Viewpoint Management** — Save and recall camera positions, organized into named groups with drag-and-drop reorder
- **Import / Export** — Full scene data export to JSON for sharing and backup

---

## Install & Run

### Prerequisites

- [Node.js](https://nodejs.org/) 18+

### Install

```bash
git clone <repo-url>
cd wow-3d
npm install
```

### Development

```bash
npm run dev
```

Open `http://localhost:5173` (Vite default port).

### Production

```bash
npm run build    # Output to dist/
npm run preview  # Preview production build locally
```

This is a fully client-side application — no backend required.

---

## Usage Guide

### Scene Management

Access via **🗺️ Battle Scenes** in the left sidebar:

- Three pre-configured scene groups: Raids, Mythic+ Dungeons, PvP Battlegrounds
- Click a scene card to switch — automatically loads the 3D model and phase data
- Drag-and-drop `.glb` / `.fbx` / `.gltf` files to replace the current scene model
- Drop multiple model files to batch-create new scenes
- Export scenes as JSON files, or import from saved JSON

### View Controls

Access via **👁️ View Tools** in the left sidebar:

- **Orbit Controls**: Left-drag to rotate, scroll to zoom, right-drag to pan
- **Brightness**: Slider from 0.3x to 3.0x
- **Quick Presets**: Top-down, front, side, 45° isometric

#### Free Roam Mode

Click 🚶 or press **F** to enter free-roam:

| Key | Action |
|-----|--------|
| W / ↑ | Forward |
| S / ↓ | Backward |
| A / ← | Strafe left |
| D / → | Strafe right |
| Q | Descend |
| E | Ascend |
| Shift | Sprint (2× speed) |

Mouse controls view direction. Press F again to exit.

#### Z-Axis Clip Plane

Click ✂️ to toggle the clipping plane. Adjust the slider to slice through the model and inspect interior structures.

### Unit Placement

Access via **🎯 Unit Placement** in the left sidebar:

1. Select a unit type from the tabbed grid: Monsters / Players (Role or Class) / Custom Items
2. Click a unit card to enter placement mode
3. Click anywhere on the 3D scene to place (auto-snaps to model surface)
4. Press **Esc** to exit placement mode

**Unit interaction:**
- Click a placed unit to select it (halo ring + pulse animation)
- Drag units to reposition them
- After selecting, use the transform panel to edit position, rotation, scale, and label
- Press **Delete** to remove a selected unit

### Annotation Tools

Access via **✏️ Annotation** in the left sidebar:

| Type | How to use |
|------|------------|
| ➡️ Arrow | Click twice: start point → end point |
| 🔴 Zone | Click once to place, adjust radius and color |
| 📌 Label | Click once to place, then enter text |

- Click an existing annotation to edit its color or text
- Press **Delete** to remove a selected annotation

### Phase Management

Use the **floating phase bar** at the bottom center:

- Click a phase button to switch — current state is auto-saved
- Double-click a phase name to rename it
- Click **+ Phase** to add a new phase
- Click **▶ Demo** to auto-play through all phases with animated transitions

### Viewpoint Management

Access via **🎥 Viewpoints** in the left sidebar:

- Save the current camera position as a named viewpoint
- Click a saved viewpoint to instantly jump to it
- Create multiple viewpoint groups for organizing different camera angles

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| F | Toggle free-roam mode |
| W A S D | Free-roam movement |
| Q / E | Free-roam descend / ascend |
| Shift | Free-roam sprint |
| Delete / Backspace | Delete selected unit or annotation |
| Escape | Cancel placement mode / deselect |

---

## Architecture

### Tech Stack

- **Build Tool**: [Vite 6](https://vitejs.dev/)
- **3D Engine**: [Three.js 0.183](https://threejs.org/) (WebGL)
- **Language**: Vanilla JavaScript (ES Modules)
- **Draco Compression**: GLTF models use Draco decoder for loading

No UI framework (React, Vue, etc.), no state management library. All UI is built with procedural DOM manipulation.

### Module Overview

```
src/
├── App.js                 # Entry point: dependency injection and boot
├── Constants.js           # Unit definitions and constant data
├── DataStore.js           # Scene, phase, and viewpoint state management
├── SceneManager.js        # Three.js rendering pipeline (camera, lights, animation)
├── ModelManager.js        # GLB/FBX model loading and file upload
├── ClipPlaneManager.js    # Z-axis clipping plane with helper visualization
├── UnitManager.js         # Chibi unit mesh creation, placement, and dragging
├── AnnotationManager.js   # Arrow, zone, and label annotations
├── PhaseManager.js        # Phase switching with animated transitions
├── ViewpointManager.js    # Camera viewpoint save/load and grouping
├── InteractionManager.js  # Raycaster hit-testing and keyboard/mouse events
└── UIManager.js           # All DOM-based UI construction
```

### Design

- **Dependency Injection**: All modules receive their dependencies via constructor; [App.js](src/App.js) is the sole composition root
- **Unidirectional Data Flow**: `DataStore` → `Domain Modules` → `Rendering/UI`
- **Pure Data Separation**: `Constants.js` and `DataStore.js` have zero Three.js or DOM dependencies — they are independently testable

## Contact author
wx:sincerelyfox
