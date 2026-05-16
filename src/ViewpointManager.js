// src/ViewpointManager.js
export class ViewpointManager {
  constructor(sceneManager, dataStore) {
    this.sceneManager = sceneManager;
    this.dataStore = dataStore;
  }

  getCurrentCameraState() {
    return {
      pos: { x: this.sceneManager.getCamera().position.x, y: this.sceneManager.getCamera().position.y, z: this.sceneManager.getCamera().position.z },
      target: { x: this.sceneManager.getControls().target.x, y: this.sceneManager.getControls().target.y, z: this.sceneManager.getControls().target.z },
      quaternion: { x: this.sceneManager.getCamera().quaternion.x, y: this.sceneManager.getCamera().quaternion.y, z: this.sceneManager.getCamera().quaternion.z, w: this.sceneManager.getCamera().quaternion.w }
    };
  }

  saveViewpoint(name, groupId) {
    const sd = this.dataStore.getCurrentSceneData();
    if (!sd) return;
    if (!sd.viewpointGroups) sd.viewpointGroups = [{ id: 'vp_default', name: '📌 常用视角', collapsed: false, viewpoints: [] }];
    const id = `vp_${Date.now()}`;
    const vp = { id, name, ...this.getCurrentCameraState() };
    const group = sd.viewpointGroups.find(g => g.id === groupId) || sd.viewpointGroups[0];
    if (!group.viewpoints) group.viewpoints = [];
    group.viewpoints.push(vp);
    return vp;
  }

  jumpToViewpoint(vp) {
    if (this.sceneManager.freeRoamMode) this.sceneManager.toggleFreeRoam();
    this.sceneManager.getCamera().position.set(vp.pos.x, vp.pos.y, vp.pos.z);
    this.sceneManager.getControls().target.set(vp.target.x, vp.target.y, vp.target.z);
    if (vp.quaternion) this.sceneManager.getCamera().quaternion.set(vp.quaternion.x, vp.quaternion.y, vp.quaternion.z, vp.quaternion.w);
    this.sceneManager.getControls().update();
  }

  addGroup(name) {
    const sd = this.dataStore.getCurrentSceneData();
    if (!sd) return;
    if (!sd.viewpointGroups) sd.viewpointGroups = [];
    sd.viewpointGroups.push({ id: `vpg_${Date.now()}`, name, collapsed: false, viewpoints: [] });
  }

  removeGroup(id) {
    const sd = this.dataStore.getCurrentSceneData();
    if (!sd) return;
    sd.viewpointGroups = sd.viewpointGroups.filter(g => g.id !== id);
  }

  deleteViewpoint(groupId, vpId) {
    const sd = this.dataStore.getCurrentSceneData();
    if (!sd) return;
    if (groupId) {
      const group = sd.viewpointGroups.find(g => g.id === groupId);
      if (group && group.viewpoints) group.viewpoints = group.viewpoints.filter(v => v.id !== vpId);
    } else {
      sd.viewpointGroups.forEach(g => {
        if (g.viewpoints) g.viewpoints = g.viewpoints.filter(v => v.id !== vpId);
      });
    }
  }

  reorderViewpoints(groupId, fromIndex, toIndex) {
    const sd = this.dataStore.getCurrentSceneData();
    if (!sd) return;
    const group = sd.viewpointGroups.find(g => g.id === groupId);
    if (group && group.viewpoints) {
      const [item] = group.viewpoints.splice(fromIndex, 1);
      group.viewpoints.splice(toIndex, 0, item);
    }
  }
}
